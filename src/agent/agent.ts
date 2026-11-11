import type { AgentModel } from '../model/types.ts';
import type { AgentTool } from '../tools/types.ts';
import { Session } from './session/session.ts';
import type { SessionOptions } from './session/types.ts';
import type { AgentConfig } from './types.ts';

export class Agent implements AgentConfig {
  // 系统提示词
  readonly instructions: string;
  readonly models: AgentModel[];
  readonly tools: AgentTool[];

  constructor(
    options: Partial<AgentConfig> & Pick<AgentConfig, 'models'>,
  ) {
    const { models } = options;
    const tools = options.tools ?? [];
    if (models.length === 0) {
      throw new Error('At last one model is required');
    }
    const modelIds = new Set<string>();
    for (const model of models) {
      const { id } = model;
      if (modelIds.has(id)) {
        throw new Error('Model IDs must be unique');
      }
      modelIds.add(id);
    }

    const toolName = new Set<string>();
    for (const { name } of tools) {
      if (toolName.has(name)) {
        throw new Error('Tool names must be unique');
      }
      toolName.add(name);
    }

    this.instructions = options.instructions ?? '';
    this.models = [...models];
    this.tools = [...tools];
  }

  createSession(options: SessionOptions): Session {
    return new Session(this, options);
  }
}