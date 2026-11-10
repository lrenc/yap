import { describe, expect, test } from 'bun:test';
import {
  estimateEntry,
  estimateItem,
  estimateText,
  estimateTokens,
} from '../../src/context/tokens.ts';
import type { HistoryEntry } from '../../src/context/types.ts';
import type {
  FunctionTool,
  ResponseInputItem,
} from '../../src/model/provider/openai/types.ts';

const user: ResponseInputItem = {
  role: 'user',
  content: 'hello',
};

const tool: FunctionTool = {
  type: 'function',
  name: 'lookup',
  description: 'Look up a value',
  parameters: { type: 'object' },
};

describe('token estimates', () => {
  test('estimates UTF-8 text conservatively', () => {
    expect(estimateText('')).toBe(0);
    expect(estimateText('abc')).toBe(1);
    expect(estimateText('😀')).toBe(2);
    expect(estimateText('你好')).toBe(2);
  });

  test('estimates string and array input consistently', () => {
    expect(estimateTokens({
      input: 'hello',
    })).toBe(estimateTokens({
      input: [user],
    }));
  });

  test('includes instructions and tool definitions', () => {
    const base = estimateTokens({ input: [user] });
    const withExtras = estimateTokens({
      input: [user],
      instructions: 'be concise',
      tools: [tool],
    });

    expect(withExtras).toBe(
      base
      + estimateText('be concise')
      + 4
      + estimateItem(tool),
    );
  });

  test('estimates every history entry type', () => {
    const entries: HistoryEntry[] = [
      {
        type: 'user',
        message: { role: 'user', content: 'hello' },
      },
      {
        type: 'response',
        responseId: 'response',
        output: [{
          type: 'message',
          id: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'world' }],
        }],
      },
      {
        type: 'tool_result',
        result: {
          type: 'function_call_output',
          call_id: 'call',
          output: '42',
        },
      },
    ];

    for (const entry of entries) {
      expect(estimateEntry(entry)).toBeGreaterThan(0);
    }
  });
});
