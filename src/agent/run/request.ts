import { createHash } from 'node:crypto';
import type {
  ResponseCreateParams,
  ResponseInputItem,
} from '../../model/provider/openai/types.ts';
import type { RequestInfo } from '../../context/types.ts';
import { buildModelParams } from '../../model/params.ts';
import type { AgentModel } from '../../model/types.ts';
import type { AgentConfig } from '../types.ts';

export function buildRequest(
  agent: AgentConfig,
  model: AgentModel,
  input: ResponseInputItem[],
  reasoningEffort: string | undefined,
): ResponseCreateParams {
  const params: ResponseCreateParams = {
    ...buildModelParams(
      model,
      reasoningEffort === undefined ? {} : { reasoningEffort },
    ),
    model: model.id,
    instructions: agent.instructions,
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
    signature: createHash('sha256').update(JSON.stringify(fixed)).digest('hex'),
    contextStart,
    hasExtraInput,
  };
  if (endpoint !== undefined) {
    request.endpoint = endpoint;
  }
  return {
    params: { ...snapshot, input },
    request,
  };
}
