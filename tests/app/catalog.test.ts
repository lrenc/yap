import { describe, expect, test } from 'bun:test';
import { models } from '../../src/app/models.ts';
import { providers } from '../../src/app/providers.ts';

describe('provider catalog', () => {
  test('routes GLM through its Responses adapter', () => {
    expect(providers.find(provider => provider.id === 'zhipu')).toEqual({
      id: 'zhipu',
      name: 'Zhipu GLM',
      baseURL: 'https://open.bigmodel.cn/api/v1',
      adapter: 'glm',
    });
  });

  test('offers the supported GLM-5.3 reasoning settings', () => {
    expect(models.find(model => model.id === 'glm-5.3')).toEqual({
      id: 'glm-5.3',
      name: 'GLM-5.3',
      providerId: 'zhipu',
      contextWindow: 1_000_000,
      reasoningEfforts: ['low', 'high', 'max'],
      params: {
        max_output_tokens: 131_072,
        reasoning: { effort: 'max' },
      },
    });
  });
});
