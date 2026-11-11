import { z } from 'zod';
import type { AgentTool, ToolDefinition } from './types.ts';

export function defineTool<T extends z.ZodObject>(definition: ToolDefinition<T>): AgentTool {
  const { name, description, parameters } = definition;

  return {
    name,
    description,
    parameters: z.toJSONSchema(parameters, { io: 'input' }),
    async execute(args, signal) {
      signal.throwIfAborted();
      const parsed = await parameters.parseAsync(args);
      signal.throwIfAborted();
      return definition.execute(parsed, signal);
    },
  };
}
