import { describe, expect, test } from 'bun:test';
import { getModel } from '../../src/model/lookup.ts';
import { testModel } from './helpers.ts';

describe('getModel', () => {
  test('returns the selected model', () => {
    const expected = testModel();
    const models = [testModel({ id: 'other-model' }), expected];

    expect(getModel(models, 'test-model')).toBe(expected);
  });

  test('rejects an unknown model ID', () => {
    expect(() => getModel([testModel()], 'missing-model'))
      .toThrow('Unknown model ID: missing-model');
  });
});
