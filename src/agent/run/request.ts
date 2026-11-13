import { createHash } from 'node:crypto';
import { getModelBudget, getSummaryLimit } from '../../context/compaction/budget.ts';
import { summaryMessages } from '../../context/history.ts';
import { estimateTokens } from '../../context/tokens.ts';
import { getModel } from '../../model/lookup.ts';
import { buildModelParams } from '../../model/params.ts';
import { isUndefined } from '../../utils/guards.ts';
import type { CompactionBudget, RequestInfo } from '../../context/types.ts';
import type {
  ResponseCreateParams,
  ResponseInputItem
} from '../../model/provider/openai/types.ts';
import type { ModelSelection } from '../../model/types.ts';
import type { AgentConfig, RunConfigSnapshot } from '../types.ts';

export function selectRunConfig(
  agent: AgentConfig,
  selection: ModelSelection,
): RunConfigSnapshot {
  return {
    model: getModel(agent.models, selection.modelId),
    instructions: agent.instructions,
    ...(isUndefined(selection.reasoningEffort) ? {} : {
      reasoningEffort: selection.reasoningEffort,
    }),
  };
}

export function captureRunConfig(config: RunConfigSnapshot): RunConfigSnapshot {
  const { client, ...model } = config.model;
  return {
    ...config,
    model: {
      ...structuredClone(model),
      client,
    },
  };
}

export function checkPendingInput(
  agent: Pick<AgentConfig, 'tools'>,
  config: RunConfigSnapshot,
  input: ResponseInputItem[],
): CompactionBudget {
  const { model } = config;
  const budget = getModelBudget({
    contextWindow: model.contextWindow,
    maxOutputTokens: model.params.max_output_tokens,
  });
  const request = buildRequest(agent, config, [
    ...summaryMessages(''),
    ...input,
  ]);
  const available = budget.threshold - estimateTokens(request);
  if (getSummaryLimit(available, budget.maxSummaryTokens) <= 0) {
    throw new Error(
      'Pending input exceeds the context budget'
    );
  }
  return budget;
}

export function buildRequest(
  agent: Pick<AgentConfig, 'tools'>,
  { model, instructions, reasoningEffort }: RunConfigSnapshot,
  input: ResponseInputItem[],
): ResponseCreateParams {
  const params: ResponseCreateParams = {
    ...buildModelParams(
      model,
      isUndefined(reasoningEffort) ? {} : { reasoningEffort },
    ),
    model: model.id,
    instructions,
    input,
    tools: agent.tools.map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    })),
    store: false,
    parallel_tool_calls: false,
  };
  return params;
}

export function captureRequest(params: ResponseCreateParams, {
  endpoint,
  contextStart,
  hasExtraInput,
}: {
  endpoint: string | undefined;
  contextStart: number;
  hasExtraInput: boolean;
}): {
  params: ResponseCreateParams;
  request: RequestInfo;
} {
  const { input, ...requestParams } = params;
  const snapshot = structuredClone(requestParams);
  const { model, ...fixed } = snapshot;
  const request: RequestInfo = {
    model,
    signature: createHash('sha256')
      .update(JSON.stringify(fixed))
      .digest('hex'),
    contextStart,
    hasExtraInput,
  };
  if (!isUndefined(endpoint)) {
    request.endpoint = endpoint;
  }
  return {
    params: { ...snapshot, input },
    request,
  };
}
