import type { ModelSelection } from '../../model/types.ts';
import type { RunConfigResolver } from '../types.ts';

export interface SessionOptions {
  getModelSelection: () => ModelSelection;
  isReady?: (modelId: string) => boolean;
}

export interface ResolverOptions {
  resolveRunConfig: RunConfigResolver;
}

export interface WaitingState {
  readonly modelId: string;
  readonly count: number;
}
