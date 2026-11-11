import type { AgentModel } from './types.ts';

export function getModel(
  models: readonly AgentModel[],
  id: string,
): AgentModel {
  const model = models.find(model => model.id === id);
  if (!model) {
    throw new Error(`Unknown model ID: ${id}`);
  }
  return model;
}
