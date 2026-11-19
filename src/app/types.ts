import type { AgentPrompts } from '../agent/ports.ts';

export type PromptSource = Pick<AgentPrompts, 'list' | 'read'>;
