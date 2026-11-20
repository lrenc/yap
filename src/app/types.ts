import type { QueueBlock } from '../agent/admission.ts';
import type { AgentPrompts } from '../agent/ports.ts';
import type { AgentEvent } from '../agent/run/types.ts';

export type PromptSource = Pick<AgentPrompts, 'list' | 'read'>;

export type ConfigChange =
  | 'model'
  | 'reasoningEffort'
  | 'prompt'
  | 'apiKey';

export type AppPanel =
  | { type: 'model' }
  | { type: 'config'; modelId: string; providerId: string }
  | { type: 'prompt' };

export interface InitError {
  source: 'settings' | 'secrets';
  message: string;
}

export interface QueuedMessage {
  id: number;
  content: string;
}

export type AppEvent =
  | (AgentEvent & { runId: number; sessionId: number })
  | {
    type: 'userMessage';
    queueId: number;
    content: string;
    runId: number;
    sessionId: number;
  }
  | {
    type: 'notice';
    level: 'info' | 'warning' | 'error';
    message: string;
  }
  | {
    type: 'initErrors';
    errors: readonly InitError[];
  }
  | {
    type: 'panel';
    panel: AppPanel | null;
  }
  | {
    type: 'sessionBoundary';
    sessionId: number;
  }
  | {
    type: 'configChanged';
    change: ConfigChange;
  }
  | {
    type: 'inputQueue';
    pending: number;
    blocked: QueueBlock | null;
    messages: readonly QueuedMessage[];
  };
