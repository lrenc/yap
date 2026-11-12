import type { AgentModel } from '../model/types.ts';

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly baseURL: string;
}

export interface Model extends Omit<AgentModel, 'client'> {
  readonly name: string;
  readonly providerId: string;
}

export interface MissingSetting {
  readonly key: 'apiKey';
  readonly providerId: string;
  readonly providerName: string;
}
