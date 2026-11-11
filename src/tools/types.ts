import type { z } from 'zod';

export interface Issue {
  program: 'fd' | 'rg' | 'bash' | 'taskkill';
  reason: 'missing' | 'unavailable' | 'timeout';
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown, signal: AbortSignal): Promise<string | ToolResult>;
}

export interface ToolResult {
  output: string;
  details?: unknown;
  isError?: boolean;
}

export interface ToolDefinition<T extends z.ZodObject> {
  name: string;
  description: string;
  parameters: T;
  execute(args: z.output<T>, signal: AbortSignal): Promise<string | ToolResult>;
}
