import { describe, expect, test } from 'bun:test';
import { LoopGuard } from '../../../src/agent/run/guard.ts';
import type { FunctionCall } from '../../../src/model/provider/openai/types.ts';

function call(argumentsValue: string): FunctionCall {
  return {
    type: 'function_call',
    call_id: 'call_1',
    name: 'lookup',
    arguments: argumentsValue,
  };
}

describe('LoopGuard', () => {
  test('resets the loop counter when a new result appears', () => {
    const guard = new LoopGuard();

    guard.record(call('{"id":1}'), 'first');
    expect(guard.endTurn()).toBe(false);
    guard.record(call('{"id":1}'), 'first');
    expect(guard.endTurn()).toBe(false);
    guard.record(call('{"id":2}'), 'second');
    expect(guard.endTurn()).toBe(false);
  });

  test('normalizes argument key order when detecting repeats', () => {
    const guard = new LoopGuard();

    guard.record(call('{"b":2,"a":1}'), 'same');
    guard.endTurn();
    for (let turn = 0; turn < 3; turn += 1) {
      guard.record(call('{"a":1,"b":2}'), 'same');
      expect(guard.endTurn()).toBe(turn === 2);
    }
  });

  test('detects repeated turns without tool calls', () => {
    const guard = new LoopGuard();

    expect(guard.endTurn()).toBe(false);
    expect(guard.endTurn()).toBe(false);
    expect(guard.endTurn()).toBe(true);
  });
});
