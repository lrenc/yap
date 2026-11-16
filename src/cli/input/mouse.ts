import { EventEmitter } from 'node:events';
import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export const ENABLE_MOUSE = '\x1b[?1000h\x1b[?1006h';
export const DISABLE_MOUSE = '\x1b[?1006l\x1b[?1000l';

const SEQUENCE = /\x1b\[(?:<(\d+);(\d+);(\d+)([Mm])|M([\s\S])([\s\S])([\s\S]))/gu;

export interface FilteredMouseInput {
  text: string;
  pending: string;
}

export function filterMouseInput(
  input: string,
  onWheel: (direction: -1 | 1) => void,
): FilteredMouseInput {
  let text = '';
  let index = 0;
  for (const match of input.matchAll(SEQUENCE)) {
    text += input.slice(index, match.index);
    const button = match[1] === undefined
      ? (match[5]?.charCodeAt(0) ?? 0) - 32
      : Number(match[1]);
    const verticalWheel = button & ~(4 | 8 | 16);
    if (verticalWheel === 64 || verticalWheel === 65) {
      onWheel(verticalWheel === 64 ? -1 : 1);
    }
    index = match.index + match[0].length;
  }
  const tail = input.slice(index);
  const partial = tail.match(/\x1b\[(?:<[\d;]*|M[\s\S]{0,2})$/u);
  return {
    text: text + (partial ? tail.slice(0, partial.index) : tail),
    pending: partial?.[0] ?? '',
  };
}

export interface MouseInput {
  readonly stdin: NodeJS.ReadableStream;
  readonly events: EventEmitter;
  dispose: () => void;
}

class MouseFilter extends Transform {
  readonly isTTY: boolean;

  readonly #source: NodeJS.ReadStream;
  readonly #events = new EventEmitter();
  readonly #decoder = new StringDecoder('utf8');
  #pending = '';

  constructor(source: NodeJS.ReadStream) {
    super();
    this.#source = source;
    this.isTTY = source.isTTY;
  }

  get events(): EventEmitter {
    return this.#events;
  }

  setRawMode = (mode: boolean): this => {
    this.#source.setRawMode(mode);
    return this;
  };

  ref = (): this => {
    this.#source.ref();
    return this;
  };

  unref = (): this => {
    this.#source.unref();
    return this;
  };

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const input = this.#pending + this.#decoder.write(chunk);
    const filtered = filterMouseInput(input, direction => {
      this.#events.emit('wheel', direction);
    });
    this.#pending = filtered.pending;
    if (filtered.text) {
      this.push(filtered.text);
    }
    callback();
  }

  override _flush(callback: (error?: Error | null) => void): void {
    const remaining = this.#pending + this.#decoder.end();
    this.#pending = '';
    if (remaining) {
      this.push(remaining);
    }
    callback();
  }
}

export function createMouseInput(source: NodeJS.ReadStream): MouseInput {
  const stdin = new MouseFilter(source);
  source.pipe(stdin);
  return {
    stdin,
    events: stdin.events,
    dispose: () => {
      source.unpipe(stdin);
      stdin.events.removeAllListeners();
      stdin.end();
    },
  };
}
