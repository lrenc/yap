import type { AgentModel } from '../model/types.ts';
import type { AdapterName } from '../model/provider/openai/types.ts';
import type { AgentTool } from '../tools/types.ts';

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly baseURL: string;
  readonly adapter: AdapterName;
}

export interface Model extends Omit<AgentModel, 'client'> {
  readonly name: string;
  readonly providerId: string;
}

export interface AgentToolset {
  tools: AgentTool[];
}

export interface RunConfigSnapshot {
  model: AgentModel;
  instructions: string;
  reasoningEffort?: string;
}

export type RunConfigResolver = (
  signal: AbortSignal,
) => RunConfigSnapshot | Promise<RunConfigSnapshot>;
