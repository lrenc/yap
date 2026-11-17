import { describe, expect, test } from 'bun:test';
import {
  applyChatEvent,
  INITIAL_CHAT_STATE,
  type ChatEvent,
} from '../../../src/cli/state/chat.ts';

function apply(
  events: readonly ChatEvent[],
) {
  return events.reduce(
    applyChatEvent,
    INITIAL_CHAT_STATE,
  );
}

describe('chat state', () => {
  test('streams and finalizes assistant text without duplication', () => {
    const state = apply([
      {
        type: 'user_message',
        content: 'hello',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'turn_start',
        turn: 1,
        modelId: 'test-model',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'text_delta',
        turn: 1,
        delta: 'hel',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'text_delta',
        turn: 1,
        delta: 'lo',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'text_done',
        turn: 1,
        text: 'hello',
        parts: [{ type: 'output_text', text: 'hello' }],
        runId: 1,
        sessionId: 1,
      },
    ]);

    expect(state.active).toBeNull();
    expect(state.activity).toBeNull();
    expect(state.completed.map(item => item.type)).toEqual([
      'user',
      'assistant',
    ]);
    expect(state.completed.at(-1)).toEqual({
      id: 'assistant:1:1:1',
      type: 'assistant',
      content: 'hello',
      refusal: false,
    });
  });

  test('uses the final response text when deltas are incomplete', () => {
    const state = apply([
      {
        type: 'text_delta',
        turn: 1,
        delta: 'hel',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'text_done',
        turn: 1,
        text: 'hello',
        parts: [{ type: 'output_text', text: 'hello' }],
        runId: 1,
        sessionId: 1,
      },
    ]);

    expect(state.completed.at(-1)).toMatchObject({
      type: 'assistant',
      content: 'hello',
      refusal: false,
    });
  });

  test('uses multiline final text when it differs from deltas', () => {
    const state = apply([
      {
        type: 'text_delta',
        turn: 1,
        delta: 'first\nsec',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'text_done',
        turn: 1,
        text: 'first\nsecond\nthird',
        parts: [{ type: 'output_text', text: 'first\nsecond\nthird' }],
        runId: 1,
        sessionId: 1,
      },
    ]);

    expect(state.completed).toHaveLength(1);
    expect(state.completed[0]).toMatchObject({
      type: 'assistant',
      content: 'first\nsecond\nthird',
      refusal: false,
    });
  });

  test('keeps multiline Markdown active until text_done', () => {
    const streaming = apply([
      {
        type: 'text_delta',
        turn: 1,
        delta: 'first line\nsecond',
        runId: 1,
        sessionId: 1,
      },
    ]);

    expect(streaming.completed).toEqual([]);
    expect(streaming.active?.text).toBe('first line\nsecond');

    const completed = applyChatEvent(streaming, {
      type: 'text_done',
      turn: 1,
      text: 'first line\nsecond',
      parts: [{ type: 'output_text', text: 'first line\nsecond' }],
      runId: 1,
      sessionId: 1,
    });
    expect(completed.active).toBeNull();
    expect(completed.completed).toEqual([{
      id: 'assistant:1:1:1',
      type: 'assistant',
      content: 'first line\nsecond',
      refusal: false,
    }]);
  });

  test('preserves refusal styling for multiline Markdown', () => {
    const state = apply([{
      type: 'refusal_delta',
      turn: 1,
      delta: 'blocked\nrest',
      runId: 1,
      sessionId: 1,
    }]);

    expect(state.active?.refusal).toBe(true);
    expect(state.active?.text).toBe('blocked\nrest');
    expect(state.completed).toEqual([]);

    const completed = applyChatEvent(state, {
      type: 'text_done',
      turn: 1,
      text: 'blocked\nrest',
      parts: [{ type: 'output_text', text: 'blocked\nrest' }],
      runId: 1,
      sessionId: 1,
    });
    expect(completed.completed.at(-1)).toEqual({
      id: 'assistant:1:1:1',
      type: 'assistant',
      content: 'blocked\nrest',
      refusal: true,
    });
  });

  test('preserves CRLF in the Markdown source', () => {
    const state = apply([{
      type: 'text_delta',
      turn: 1,
      delta: 'first\r\nsecond',
      runId: 1,
      sessionId: 1,
    }]);

    expect(state.completed).toEqual([]);
    expect(state.active?.text).toBe('first\r\nsecond');
  });

  test('combines text and refusal deltas into one Markdown message', () => {
    let state = apply([{
      type: 'text_delta',
      turn: 1,
      delta: 'normal\n',
      runId: 1,
      sessionId: 1,
    }]);
    state = applyChatEvent(state, {
      type: 'refusal_delta',
      turn: 1,
      delta: 'refused',
      runId: 1,
      sessionId: 1,
    });
    state = applyChatEvent(state, {
      type: 'text_done',
      turn: 1,
      text: 'normal\nrefused',
      parts: [{ type: 'refusal', refusal: 'refused' }],
      runId: 1,
      sessionId: 1,
    });

    expect(state.completed).toEqual([{
      id: 'assistant:1:1:1',
      type: 'assistant',
      content: 'normal\nrefused',
      refusal: true,
    }]);
  });

  test('tracks tool activity and preserves failed output', () => {
    const call = {
      type: 'function_call' as const,
      call_id: 'call_1',
      name: 'read_file',
      arguments: '{}',
    };
    const started = apply([{
      type: 'tool_start',
      call,
      runId: 1,
      sessionId: 1,
    }]);

    expect(started.activity).toEqual({
      type: 'tool',
      name: 'read_file',
      callId: 'call_1',
    });

    const ended = applyChatEvent(started, {
      type: 'tool_end',
      call,
      status: 'error',
      output: 'failed to read the file',
      runId: 1,
      sessionId: 1,
    });
    expect(ended.activity).toBeNull();
    expect(ended.completed.at(-1)).toEqual({
      id: 'tool:1:1:call_1',
      type: 'tool',
      name: 'read_file',
      status: 'error',
      summary: 'failed to read the file',
    });
  });

  test('finalizes partial text and reports run errors', () => {
    const state = apply([
      {
        type: 'text_delta',
        turn: 1,
        delta: 'partial',
        runId: 2,
        sessionId: 1,
      },
      {
        type: 'done',
        result: {
          stopReason: 'error',
          response: null,
          turns: 1,
          error: new Error('provider failed'),
        },
        runId: 2,
        sessionId: 1,
      },
    ]);

    expect(state.completed).toEqual([
      {
        id: 'assistant:1:2:1',
        type: 'assistant',
        content: 'partial',
        refusal: false,
      },
      {
        id: 'notice:1:2:done',
        type: 'notice',
        level: 'error',
        message: 'provider failed',
      },
    ]);
  });

  test('keeps completed lines when a run fails before text_done', () => {
    const state = apply([
      {
        type: 'text_delta',
        turn: 1,
        delta: 'first line\npartial',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'done',
        result: {
          stopReason: 'error',
          response: null,
          turns: 1,
          error: new Error('provider failed'),
        },
        runId: 1,
        sessionId: 1,
      },
    ]);

    expect(state.completed[0]).toMatchObject({
      type: 'assistant',
      content: 'first line\npartial',
    });
  });

  test('does not report follow-up interruption as an error', () => {
    const state = apply([
      {
        type: 'done',
        result: {
          stopReason: 'interrupted',
          response: null,
          turns: 0,
        },
        runId: 1,
        sessionId: 1,
      },
    ]);

    expect(state.completed).toEqual([]);
  });

  test('starts a new transcript section at a session boundary', () => {
    const active = apply([
      {
        type: 'user_message',
        content: 'previous',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'text_delta',
        turn: 1,
        delta: 'unfinished',
        runId: 1,
        sessionId: 1,
      },
      {
        type: 'session_boundary',
        sessionId: 1,
      },
    ]);

    expect(active.active).toBeNull();
    expect(active.activity).toBeNull();
    expect(active.completed).toEqual([
      {
        id: 'user:1:1',
        type: 'user',
        content: 'previous',
      },
      {
        id: 'divider:1:1',
        type: 'divider',
        label: 'New conversation',
      },
    ]);
  });
});
