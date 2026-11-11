import { describe, expect, test } from 'bun:test';
import { executeTool } from '../../../src/agent/run/tool-call.ts';
import type { FunctionCall } from '../../../src/model/provider/openai/types.ts';
import type { AgentTool } from '../../../src/tools/types.ts';

function call(overrides: Partial<FunctionCall> = {}): FunctionCall {
  return {
    type: 'function_call',
    id: 'call_item',
    call_id: 'call_1',
    name: 'echo',
    arguments: JSON.stringify({ value: 'hello' }),
    ...overrides,
  };
}

function tool(): AgentTool {
  return {
    name: 'echo',
    description: 'Echo the input',
    parameters: {},
    async execute(args) {
      return {
        output: JSON.stringify(args),
        details: { received: true },
      };
    },
  };
}

describe('executeTool', () => {
  test('executes a matching tool with parsed arguments', async () => {
    const result = await executeTool({
      tools: [tool()],
      call: call(),
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      status: 'completed',
      output: JSON.stringify({ value: 'hello' }),
      details: { received: true },
    });
  });

  test('preserves tool error results', async () => {
    const failingTool: AgentTool = {
      ...tool(),
      async execute() {
        return {
          output: 'failed',
          isError: true,
        };
      },
    };
    const result = await executeTool({
      tools: [failingTool],
      call: call(),
      signal: new AbortController().signal,
    });

    expect(result.status).toBe('error');
    expect(result.output).toBe('failed');
  });

  test('rejects a tool result without string output', async () => {
    const invalidTool: AgentTool = {
      ...tool(),
      async execute() {
        return { output: 42 } as unknown as string;
      },
    };
    const result = await executeTool({
      tools: [invalidTool],
      call: call(),
      signal: new AbortController().signal,
    });

    expect(result.status).toBe('error');
    expect(JSON.parse(result.output)).toEqual({
      error: 'Tool output must be a string',
    });
  });

  test('reports unknown tools and invalid arguments', async () => {
    const unknown = await executeTool({
      tools: [tool()],
      call: call({ name: 'missing' }),
      signal: new AbortController().signal,
    });
    const invalid = await executeTool({
      tools: [tool()],
      call: call({ arguments: '{' }),
      signal: new AbortController().signal,
    });

    expect(unknown.status).toBe('error');
    expect(JSON.parse(unknown.output)).toEqual({
      error: 'Unknown tool: missing',
    });
    expect(invalid.status).toBe('error');
    expect(JSON.parse(invalid.output).error).toContain('JSON');
  });

  test('reports cancellation even when the tool throws', async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelledTool: AgentTool = {
      ...tool(),
      async execute() {
        throw new Error('stopped');
      },
    };
    const result = await executeTool({
      tools: [cancelledTool],
      call: call(),
      signal: controller.signal,
    });

    expect(result.status).toBe('error');
    expect(JSON.parse(result.output)).toEqual({
      error: 'Tool interrupted; may have partially completed.',
    });
  });
});
