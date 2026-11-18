import type { RunConfigResolver, RunConfigSnapshot } from '../types.ts';
import type { AgentEvent } from '../run/types.ts';

export interface SessionOptions {
  readonly id?: number;
  resolveRunConfig: RunConfigResolver;
  resolveQueueConfig?: () => RunConfigSnapshot;
  allocateRunId?: () => number;
  isReady?: (modelId: string) => boolean;
}

export interface WaitingState {
  readonly modelId: string;
  readonly count: number;
}

export interface SessionRun {
  readonly runId: number;
  readonly stream: AsyncIterableIterator<AgentEvent>;
}
