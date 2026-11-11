import { describe, expect, test } from 'bun:test';
import { planCompaction } from '../../../src/context/compaction/plan.ts';
import { estimateEntry } from '../../../src/context/tokens.ts';
import type { HistoryEntry } from '../../../src/context/types.ts';
import { textResponse } from '../helpers.ts';

const user = (content: string): HistoryEntry => ({
  type: 'user',
  message: { role: 'user', content },
});

function response(id: string): HistoryEntry {
  const value = textResponse(id);
  return {
    type: 'response',
    responseId: value.id,
    output: value.output,
  };
}

const history: HistoryEntry[] = [
  user('old user'),
  response('old response'),
  user('recent user'),
  response('recent response'),
  user('pending user'),
];
const boundaries = [0, 1, 2, 3, 4];

describe('planCompaction', () => {
  test('never compacts the pending turn', () => {
    const plan = planCompaction({
      history,
      boundaries,
      requiredStart: 4,
      keepRecentTokens: 0,
      keepLimit: 1_000_000,
    });

    expect(plan.keepFrom).toBe(4);
    expect(plan.prefix).toEqual(history.slice(0, 4));
  });

  test('keeps enough recent entries to meet the recent-token target', () => {
    const recentTokens = (
      estimateEntry(history[3] as HistoryEntry)
      + estimateEntry(history[4] as HistoryEntry)
    );
    const plan = planCompaction({
      history,
      boundaries,
      requiredStart: 4,
      keepRecentTokens: recentTokens,
      keepLimit: 1_000_000,
    });

    expect(plan.keepFrom).toBe(3);
    expect(plan.prefix).toEqual(history.slice(0, 3));
  });

  test('rejects a required recent turn that exceeds the budget', () => {
    expect(() => planCompaction({
      history,
      boundaries,
      requiredStart: 4,
      keepRecentTokens: 0,
      keepLimit: estimateEntry(history[4] as HistoryEntry) - 1,
    })).toThrow('Required recent history exceeds compaction budget');
  });

  test('rejects invalid boundary ordering', () => {
    expect(() => planCompaction({
      history,
      boundaries: [0, 2, 1],
      requiredStart: 1,
      keepRecentTokens: 1_000_000,
      keepLimit: 1_000_000,
    })).toThrow('Invalid history boundary');
  });

  test('requires history beyond the current context start', () => {
    expect(() => planCompaction({
      history: [user('only')],
      boundaries: [0],
      requiredStart: 0,
      keepRecentTokens: 0,
      keepLimit: 1_000,
    })).toThrow('No history prefix to compact');
  });
});
