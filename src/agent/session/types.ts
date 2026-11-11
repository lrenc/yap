import type { ModelSelection } from '../../model/types.ts';

export interface SessionOptions {
  getModelSelection: () => ModelSelection;
  isReady?: (modelId: string) => boolean;
}

export interface WaitingState {
  readonly modelId: string;
  readonly count: number;
}