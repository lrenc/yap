import type { OpenAIClient } from '../../src/model/provider/openai/types.ts';
import type { AgentModel } from '../../src/model/types.ts';

const client: OpenAIClient = {
  endpoint: 'https://example.test/v1/responses',
  async create() {
    throw new Error('create is not used');
  },
  async stream() {
    throw new Error('stream is not used');
  },
};

export function testModel(
  overrides: Partial<AgentModel> = {},
): AgentModel {
  return {
    id: 'test-model',
    client,
    contextWindow: 128_000,
    params: {
      max_output_tokens: 1_024,
    },
    ...overrides,
  };
}
