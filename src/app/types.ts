import type { AgentModel } from '../model/types.ts';
import type { AdapterName } from '../model/provider/openai/types.ts';

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
