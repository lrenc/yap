import { describe, expect, test } from 'bun:test';
import { TimeoutError } from '../../../src/model/provider/errors.ts';
import {
  readSSE,
  type ReadSSEOptions,
  type SSEEvent,
} from '../../../src/model/provider/sse.ts';
import { byteStream } from '../../helpers/streams.ts';

async function collectSSE(
  chunks: readonly (string | Uint8Array)[],
  options: ReadSSEOptions = {},
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of readSSE(byteStream(chunks), options)) {
    events.push(event);
  }
  return events;
}

describe('readSSE', () => {
  test('parses events, fields, and multi-line data', async () => {
    const events = await collectSSE([
      [
        ': comment',
        'retry: 1000',
        'event: update',
        'id: 7',
        'data: first',
        'data: second',
        '',
        'id: 8',
        'data: next',
        '',
        '',
      ].join('\n'),
    ]);

    expect(events).toEqual([
      { event: 'update', data: 'first\nsecond', id: '7' },
      { event: 'message', data: 'next', id: '8' },
    ]);
  });

  test('uses the default event name and preserves colons in data', async () => {
    const events = await collectSSE([
      'data: https://example.test/path?q=1\n\n',
    ]);

    expect(events).toEqual([
      {
        event: 'message',
        data: 'https://example.test/path?q=1',
        id: undefined,
      },
    ]);
  });

  test('handles CRLF line endings split across chunks', async () => {
    const events = await collectSSE([
      'event: kind\r',
      '\ndata: value\r',
      '\n\r',
      '\n',
    ]);

    expect(events).toEqual([
      { event: 'kind', data: 'value', id: undefined },
    ]);
  });

  test('handles lone carriage-return line endings', async () => {
    const events = await collectSSE(['id: 1\rdata: value\r\r']);

    expect(events).toEqual([
      { event: 'message', data: 'value', id: '1' },
    ]);
  });

  test('decodes UTF-8 characters split across byte chunks', async () => {
    const encoded = new TextEncoder().encode('data: 😀\n\n');
    const split = Math.floor(encoded.length / 2);
    const events = await collectSSE([
      encoded.slice(0, split),
      encoded.slice(split),
    ]);

    expect(events).toEqual([
      { event: 'message', data: '😀', id: undefined },
    ]);
  });

  test('ignores events without data and IDs containing NUL', async () => {
    const events = await collectSSE([
      'event: ping\n\n',
      'id: valid\n\n',
      'id: bad\u0000id\ndata: value\n\n',
    ]);

    expect(events).toEqual([
      { event: 'message', data: 'value', id: 'valid' },
    ]);
  });

  test('does not emit an event that lacks a blank-line terminator', async () => {
    expect(await collectSSE(['data: incomplete\n'])).toEqual([]);
  });

  test('cancels the underlying stream when the consumer returns early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const events = readSSE(body);

    expect(await events.next()).toEqual({
      value: { event: 'message', data: 'first', id: undefined },
      done: false,
    });
    await events.return(undefined);

    expect(cancelled).toBe(true);
  });

  test('cancels immediately when return is called before iteration', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const events = readSSE(body);

    await events.return(undefined);

    expect(cancelled).toBe(true);
  });

  test('cancels a pending read when the consumer returns', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const events = readSSE(body);
    const pending = events.next();
    await new Promise(resolve => setTimeout(resolve, 0));

    await events.return(undefined);

    expect(await pending).toEqual({
      value: undefined,
      done: true,
    });
    expect(cancelled).toBe(true);
  });

  test('rejects when no data arrives before the idle timeout', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const events = readSSE(body, { idleTimeout: 5 });

    await expect(events.next()).rejects.toBeInstanceOf(TimeoutError);
    expect(cancelled).toBe(true);
  });
});
