import type {
  OpenAIClient,
  OpenAIResponse,
  RequestOptions,
  ResponseCreateParams,
  ResponseInputItem,
} from '../../src/model/provider/openai/types.ts';
import type { RequestInfo } from '../../src/context/types.ts';

export function textResponse(
  id = 'resp_1',
  text = 'response',
  status: OpenAIResponse['status'] = 'completed',
): OpenAIResponse {
  return {
    id,
    status,
    output: [{
      type: 'message',
      id: `message_${id}`,
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    }],
  };
}

export function clientWithCreate(
  create: (
    params: ResponseCreateParams,
    options?: RequestOptions,
  ) => Promise<OpenAIResponse>,
): OpenAIClient {
  return {
    endpoint: 'https://example.test/v1/responses',
    create,
    async stream() {
      throw new Error('Stream is not used in context tests');
    },
  };
}

export function buildRequest(
  input: ResponseInputItem[],
): ResponseCreateParams {
  return {
    model: 'test-model',
    input,
  };
}

export function requestInfo(
  overrides: Partial<RequestInfo> = {},
): RequestInfo {
  return {
    model: 'test-model',
    endpoint: 'https://example.test/v1/responses',
    signature: 'signature',
    contextStart: 0,
    hasExtraInput: false,
    ...overrides,
  };
}
