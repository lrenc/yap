import { describe, expect, test } from 'bun:test';
import { cancellable } from '../../../src/model/provider/stream.ts';

describe('cancellable', () => {
  test('forwards values and returns normally without invoking cancel', async () => {
    let cancelCalls = 0;
    async function* source() {
      yield 1;
      yield 2;
    }
    const events = cancellable(source(), async () => {
      cancelCalls += 1;
    });

    expect(await events.next()).toEqual({ value: 1, done: false });
    expect(await events.next()).toEqual({ value: 2, done: false });
    expect(await events.next()).toEqual({ value: undefined, done: true });
    expect(cancelCalls).toBe(0);
  });

  test('cancels when the consumer returns early', async () => {
    let cancelCalls = 0;
    async function* source() {
      yield 'first';
      yield 'second';
    }
    const events = cancellable(source(), async () => {
      cancelCalls += 1;
    });

    expect(await events.next()).toEqual({ value: 'first', done: false });
    expect(await events.return(undefined)).toEqual({
      value: undefined,
      done: true,
    });
    expect(cancelCalls).toBe(1);
  });

  test('cancels when the consumer throws into the generator', async () => {
    let cancelCalls = 0;
    const failure = new Error('consumer failed');
    async function* source() {
      yield 'first';
    }
    const events = cancellable(source(), async () => {
      cancelCalls += 1;
    });

    await events.next();

    await expect(events.throw(failure)).rejects.toBe(failure);
    expect(cancelCalls).toBe(1);
  });

  test('cancels when return is called before iteration starts', async () => {
    let cancelCalls = 0;
    async function* source() {
      yield 1;
    }
    const events = cancellable(source(), async () => {
      cancelCalls += 1;
    });

    expect(await events.return(undefined)).toEqual({
      value: undefined,
      done: true,
    });
    expect(cancelCalls).toBe(1);
  });
});
