import { estimateEntry } from '../tokens.ts';
import type { HistoryEntry } from '../types.ts';

export function planCompaction({
  history,
  boundaries,
  pendingStart,
  keepRecentTokens,
  keepLimit,
}: {
  history: HistoryEntry[];
  boundaries: number[];
  pendingStart: number | undefined;
  keepRecentTokens: number;
  keepLimit: number;
}): {
  prefix: HistoryEntry[];
  keepFrom: number;
} {
  if (keepLimit <= 0) {
    throw new Error('No budget for recent history');
  }
  const contextStart = boundaries[0];
  const requiredStart = pendingStart ?? boundaries.at(-1);
  if (
    contextStart === undefined
    || requiredStart === undefined
    || requiredStart <= contextStart
  ) {
    throw new Error('No history prefix to compact');
  }

  let keepFrom = history.length;
  let keptTokens = 0;
  for (let i = boundaries.length - 1; i > 0; i --) {
    const start = boundaries[i];
    if (start === undefined || start < contextStart || start >= keepFrom) {
      throw new Error('Invalid history boundary');
    }
    let unitTokens = 0;
    for (let j = start; j < keepFrom; j ++) {
      const entry = history[j];
      if (entry === undefined) {
        throw new Error('Missing history entry');
      }
      unitTokens += estimateEntry(entry);
    }
    if (keptTokens + unitTokens > keepLimit) {
      if (start >= requiredStart) {
        throw new Error(
          'Required recent history exceeds compaction budget'
        );
      }
      break;
    }
    keptTokens += unitTokens;
    keepFrom = start;
    if (
      start <= requiredStart
      && keptTokens >= keepRecentTokens
    ) {
      break;
    }
  }
  return {
    prefix: history.slice(contextStart, keepFrom),
    keepFrom,
  };
}
