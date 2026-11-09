import { cancellable } from './stream.ts';
import { SSEError, TimeoutError } from './errors.ts';

export interface SSEEvent {
  event: string;
  data: string;
  id: string | undefined;
}

export interface ReadSSEOptions {
  idleTimeout?: number;
}

export function readSSE(
  body: ReadableStream<Uint8Array>,
  options: ReadSSEOptions = {},
): AsyncGenerator<SSEEvent> {
  const { idleTimeout } = options;

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let closed = false;
  let cleanup: Promise<void> | undefined;

  function cancel(): Promise<void> {
    closed = true;
    cleanup ??= (async () => {
      const current = reader;
      if (!current) {
        await body.cancel().catch(() => {});
        return;
      }
      try {
        await current.cancel();
      } catch {}
      try {
        current.releaseLock();
      } catch {}
    })();
    return cleanup;
  }

  async function readChunk(): Promise<ReadableStreamReadResult<Uint8Array>> {
    if (!reader) {
      throw new SSEError('SSE stream reader is not ready');
    }
    if (idleTimeout === undefined) {
      return reader.read();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new TimeoutError(`SSE idle timeout after ${idleTimeout}ms`));
          }, idleTimeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function* read(): AsyncGenerator<SSEEvent> {
    reader = body.getReader();

    const decoder = new TextDecoder();
    let buffer = '';
    let skipLF = false;
    let data: string[] = [];
    let event = 'message';
    let id: string | undefined;

    function applyLine(line: string): boolean {
      if (line === '') {
        return true;
      }
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') {
        data.push(value);
      }
      if (field === 'event') {
        event = value || 'message';
      }
      if (field === 'id' && !value.includes('\0')) {
        id = value;
      }
      return false;
    }

    try {
      while (!closed) {
        const { value, done } = await readChunk();
        if (closed) {
          return;
        }
        buffer += decoder.decode(value, {
          stream: !done,
        });

        if (skipLF && buffer.length > 0) {
          if (buffer[0] === '\n') {
            buffer = buffer.slice(1);
          }
          skipLF = false;
        }

        while (!closed) {
          const end = buffer.search(/[\r\n]/);
          if (end < 0) {
            break;
          }

          const line = buffer.slice(0, end);
          const length = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1;
          skipLF = buffer[end] === '\r' && end === buffer.length - 1;
          buffer = buffer.slice(end + length);

          if (applyLine(line)) {
            if (data.length) {
              yield { event, data: data.join('\n'), id };
            }
            event = 'message';
            data = [];
          }
        }

        if (done) {
          return;
        }
      }
    } finally {
      await cancel();
    }
  }

  return cancellable(read(), cancel);
}
