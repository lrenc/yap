import { describe, expect, test } from 'bun:test';
import { buildModelParams } from '../../src/model/params.ts';
import { testModel } from './helpers.ts';

describe('buildModelParams', () => {
  test('copies model defaults when no effort is selected', () => {
    const model = testModel({
      params: {
        max_output_tokens: 1_024,
        reasoning: { effort: 'medium' },
      },
    });

    const params = buildModelParams(model, {});

    expect(params).toEqual(model.params);
    expect(params).not.toBe(model.params);
    expect(params.reasoning?.effort).toBe('medium');
  });

  test('overrides the model reasoning effort', () => {
    const model = testModel({
      params: {
        max_output_tokens: 1_024,
        reasoning: { effort: 'medium' },
      },
    });

    const params = buildModelParams(model, {
      reasoningEffort: 'high',
    });

    expect(params.reasoning).toEqual({ effort: 'high' });
    expect(model.params.reasoning).toEqual({ effort: 'medium' });
  });
});
