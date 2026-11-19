import type {
  AdapterName,
  OpenAIClient,
  ResponseCreateParams,
} from './provider/openai/types.ts';

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
  readonly reasoningEfforts: readonly string[];
  params: AgentModelParams;
}

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

export interface ModelSelection {
  modelId: string;
  reasoningEffort?: string | undefined;
}
