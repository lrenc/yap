import { describe, expect, test } from 'bun:test';
import { getModelBudget } from '../../../src/context/compaction/budget.ts';

describe('getModelBudget', () => {
  test('derives the threshold and positive margin', () => {
    const budget = getModelBudget({
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
    });

    expect(budget.threshold).toBe(111_616);
    expect(budget.margin).toBe(8_192);
    expect(budget.keepRecentTokens).toBe(20_000);
    expect(budget.maxSummaryTokens).toBe(4_096);
  });

  test('keeps a non-negative margin for large output limits', () => {
    expect(getModelBudget({
      contextWindow: 128_000,
      maxOutputTokens: 32_000,
    }).margin).toBe(0);
  });
});
