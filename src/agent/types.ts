import type { AgentModel } from '../model/types.ts';
import type { AgentTool } from '../tools/types.ts';

export interface AgentToolset {
  tools: AgentTool[];
}

export interface RunConfigSnapshot {
  model: AgentModel;
  instructions: string;
  reasoningEffort?: string | undefined;
}

export type RunConfigResolver = (
  signal: AbortSignal,
) => RunConfigSnapshot | Promise<RunConfigSnapshot>;
