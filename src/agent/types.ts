import type { AgentModel } from '../model/types.ts';
import type { AgentTool } from '../tools/types.ts';

export interface AgentConfig {
  instructions: string;
  models: AgentModel[];
  tools: AgentTool[];
}