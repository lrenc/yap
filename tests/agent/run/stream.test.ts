import { expect, test } from 'bun:test';
import { RunStream } from '../../../src/agent/run/stream.ts';

test('merges adjacent unread text deltas for the same turn', async () => {
  const stream = new RunStream(() => {});

  stream.emit({ type: 'text_delta', turn: 1, delta: 'hel' });
  stream.emit({ type: 'text_delta', turn: 1, delta: 'lo' });
  stream.emit({ type: 'text_delta', turn: 2, delta: ' next' });
  stream.close();

  expect(await stream.next()).toEqual({
    value: { type: 'text_delta', turn: 1, delta: 'hello' },
    done: false,
  });
  expect(await stream.next()).toEqual({
    value: { type: 'text_delta', turn: 2, delta: ' next' },
    done: false,
  });
  expect(await stream.next()).toEqual({
    value: undefined,
    done: true,
  });
});

test('delivers an event directly to a waiting consumer', async () => {
  const stream = new RunStream(() => {});
  const next = stream.next();

  stream.emit({ type: 'queue', waitingFor: 'test-model' });

  expect(await next).toEqual({
    value: { type: 'queue', waitingFor: 'test-model' },
    done: false,
  });
});

test('completes a waiting consumer when closed', async () => {
  const stream = new RunStream(() => {});
  const next = stream.next();

  stream.close();
  stream.emit({ type: 'text_delta', turn: 1, delta: 'ignored' });

  expect(await next).toEqual({
    value: undefined,
    done: true,
  });
});

test('cancels and discards buffered events when returned', async () => {
  let cancels = 0;
  const stream = new RunStream(() => {
    cancels += 1;
  });
  stream.emit({ type: 'text_delta', turn: 1, delta: 'unused' });

  expect(await stream.return()).toEqual({
    value: undefined,
    done: true,
  });
  expect(cancels).toBe(1);
  expect(await stream.next()).toEqual({
    value: undefined,
    done: true,
  });
});
