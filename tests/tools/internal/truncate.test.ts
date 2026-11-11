import { describe, expect, test } from 'bun:test';
import {
  MAX_OUTPUT_BYTES,
  truncateLines,
} from '../../../src/tools/internal/truncate.ts';

describe('truncateLines', () => {
  test('applies start and limit while preserving line endings', () => {
    expect(truncateLines(['a\n', 'b\n', 'c\n'], {
      start: 1,
      limit: 1,
    })).toEqual({
      content: 'b\n',
      lineCount: 1,
      byteLimitReached: false,
    });
  });

  test('stops before a line that would exceed the byte limit', () => {
    const first = 'a'.repeat(MAX_OUTPUT_BYTES / 2);
    const second = 'b'.repeat(MAX_OUTPUT_BYTES / 2 + 1);

    expect(truncateLines([first, second], { limit: 2 })).toEqual({
      content: first,
      lineCount: 1,
      byteLimitReached: true,
    });
  });
});
