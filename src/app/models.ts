import type { Model } from './types.ts';

export const models: readonly Model[] = [
  {
    id: 'deepseek-flash',
    name: 'DeepSeek Flash',
    providerId: 'deepseek',
    contextWindow: 1_000_000,
    reasoningEfforts: [
      'none', 'low', 'high', 'max'
    ],
    params: {
      max_output_tokens: 16_384,
      reasoning: {
        effort: 'high',
      },
    },
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek Pro',
    providerId: 'deepseek',
    contextWindow: 1_000_000,
    reasoningEfforts: [
      'none', 'low', 'high', 'max'
    ],
    params: {
      max_output_tokens: 16_384,
      reasoning: {
        effort: 'high',
      },
    },
  },
  {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    providerId: 'zhipu',
    contextWindow: 1_000_000,
    reasoningEfforts: [
      'low', 'high', 'max'
    ],
    params: {
      max_output_tokens: 131_072,
      reasoning: {
        effort: 'max',
      },
    },
  },
];
