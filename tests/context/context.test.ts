import { describe, expect, test } from 'bun:test';
import type {
  FunctionCall,
  OpenAIResponse,
} from '../../src/model/provider/openai/types.ts';
import { Context } from '../../src/context/context.ts';

function response(id: string, text: string): OpenAIResponse {
  return {
    id,
    status: 'completed',
    output: [{
      type: 'message',
      id: `message-${id}`,
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    }],
  };
}

describe('Context', () => {
  test('preserves completed history and tracks only the pending turn', () => {
    const context = new Context();

    context.addUserMessage('first');
    context.addResponse(response('one', 'first reply'));
    context.addUserMessage('second');

    expect(context.contextStart).toBe(0);
    expect(context.pendingInput()).toEqual([
      { role: 'user', content: 'second' },
    ]);
    expect(context.toInput()).toHaveLength(3);

    context.addResponse(response('two', 'second reply'));
    expect(context.pendingInput()).toEqual([]);
    expect(context.getHistory()).toHaveLength(4);
  });

  test('rejects non-completed responses without clearing the pending turn', () => {
    const context = new Context();
    context.addUserMessage('pending');

    expect(() => context.addResponse({
      id: 'failed',
      status: 'failed',
      output: [],
      error: { message: 'request failed' },
    })).toThrow('request failed');
    expect(context.pendingInput()).toEqual([
      { role: 'user', content: 'pending' },
    ]);
  });

  test('preserves tool call and tool output order', () => {
    const context = new Context();
    const call: FunctionCall = {
      type: 'function_call',
      call_id: 'call_1',
      name: 'lookup',
      arguments: '{"id":1}',
    };

    context.addUserMessage('look this up');
    context.addResponse({
      id: 'tool-response',
      status: 'completed',
      output: [call],
    });
    context.addToolResult(call, '{"value":42}');

    expect(context.pendingInput()).toEqual([]);
    expect(context.requiredInput()).toEqual([
      call,
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"value":42}',
      },
    ]);

    context.addUserMessage('continue');

    expect(context.toInput().map(item => item.type)).toEqual([
      undefined,
      'function_call',
      'function_call_output',
      undefined,
    ]);
    expect(context.pendingInput()).toEqual([
      { role: 'user', content: 'continue' },
    ]);
    expect(context.requiredInput()).toEqual([
      { role: 'user', content: 'continue' },
    ]);
  });

  test('returns a defensive copy of history', () => {
    const context = new Context();
    context.addUserMessage('message');

    const history = context.getHistory();
    history.pop();

    expect(history).toHaveLength(0);
    expect(context.getHistory()).toHaveLength(1);
  });
});
