import type { AgentPrompts } from '../agent/ports.ts';

export type { Model } from '../agent/types.ts';
export { promptNameSchema } from '../agent/settings/schema.ts';

export type PromptSource = Pick<AgentPrompts, 'list' | 'read'>;
