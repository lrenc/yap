import type { CompactionBudget } from '../types.ts';

const RESERVE_TOKENS = 16_384;
const KEEP_RECENT_TOKENS = 20_000;
const MAX_SUMMARY_TOKENS = 4_096;

export function getModelBudget({
  contextWindow,
  maxOutputTokens,
}: {
  contextWindow: number;
  maxOutputTokens: number;
}): CompactionBudget {
  return {
    reserveTokens: RESERVE_TOKENS,
    keepRecentTokens: KEEP_RECENT_TOKENS,
    maxSummaryTokens: MAX_SUMMARY_TOKENS,
    threshold: contextWindow - RESERVE_TOKENS,
    margin: Math.max(
      0, RESERVE_TOKENS - maxOutputTokens,
    ),
  };
}
