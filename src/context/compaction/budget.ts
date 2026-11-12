import type { CompactionBudget } from '../types.ts';

const RESERVE_TOKENS = 16_384;
const KEEP_RECENT_TOKENS = 20_000;
const MAX_SUMMARY_TOKENS = 4_096;
const ESCAPE_FACTOR = 2;

export function getModelBudget({
  contextWindow,
  maxOutputTokens,
}: {
  contextWindow: number;
  maxOutputTokens: number;
}): CompactionBudget {
  const reserveTokens = Math.max(
    RESERVE_TOKENS,
    maxOutputTokens,
  );
  return {
    reserveTokens,
    keepRecentTokens: KEEP_RECENT_TOKENS,
    maxSummaryTokens: MAX_SUMMARY_TOKENS,
    threshold: contextWindow - reserveTokens,
    margin: Math.max(
      0, RESERVE_TOKENS - maxOutputTokens,
    ),
  };
}

export function getSummaryLimit(
  availableTokens: number,
  maxTokens: number,
): number {
  return Math.max(
    0,
    Math.min(maxTokens, Math.floor(availableTokens / ESCAPE_FACTOR)),
  );
}
