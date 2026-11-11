import type { OpenAIClient, ResponseCreateParams } from './provider/openai/types.ts';

export type AgentModelParams = Pick<
  ResponseCreateParams,
  'include' | 'tool_choice' | 'reasoning'
> & {
  max_output_tokens: number;
};

export interface AgentModel {
  id: string;
  client: OpenAIClient;
  contextWindow: number;
  reasoningEfforts?: string[];
  params: AgentModelParams;
}

export interface ModelSelection {
  modelId: string;
  reasoningEffort?: string;
}
