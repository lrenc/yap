import type { FunctionCall } from '../../model/provider/openai/types.ts';
import type { AgentTool, ToolResult } from '../../tools/types.ts';
import type { ToolOutcome } from './types.ts';

export async function executeTool({ tools, call, signal }: {
  tools: AgentTool[];
  call: FunctionCall;
  signal: AbortSignal;
}): Promise<ToolOutcome> {
  try {
    const tool = tools.find(tool => tool.name === call.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${call.name}`);
    }
    const value = await tool.execute(JSON.parse(call.arguments), signal);
    const result: ToolResult = typeof value === 'string'
      ? { output: value }
      : value;
    if (!result || typeof result.output !== 'string') {
      throw new Error('Tool output must be a string');
    }
    return {
      status: result.isError ? 'error' : 'completed',
      output: result.output,
      details: structuredClone(result.details),
    };
  } catch (error) {
    return {
      status: 'error',
      output: JSON.stringify({
        error: signal.aborted
          ? 'Tool interrupted; may have partially completed.'
          : error instanceof Error
            ? error.message
            : 'Tool failed.',
      }),
    };
  }
}
