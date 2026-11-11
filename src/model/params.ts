import type {
  AgentModel,
  AgentModelParams,
  ModelSelection,
} from './types.ts';

export function buildModelParams(
  model: AgentModel,
  selection: Pick<ModelSelection, 'reasoningEffort'>,
): AgentModelParams {
  const { reasoningEffort } = selection;
  if (reasoningEffort === undefined) {
    return { ...model.params };
  }
  return {
    ...model.params,
    reasoning: {
      ...model.params.reasoning,
      effort: reasoningEffort,
    },
  };
}
