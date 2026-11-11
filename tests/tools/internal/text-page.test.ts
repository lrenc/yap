import { describe, expect, test } from 'bun:test';
import {
  TextPage,
} from '../../../src/tools/internal/text-page.ts';
import { MAX_OUTPUT_BYTES } from '../../../src/tools/internal/truncate.ts';

describe('TextPage', () => {
  test('handles CRLF split across chunks and starts from the requested line', () => {
    const page = new TextPage({ start: 1, limit: 2 });

    page.append('one\r');
    page.append('\ntwo\nthree');

    expect(page.finish()).toEqual({
      content: 'two\nthree',
      lineCount: 2,
      totalLines: 3,
    });
  });

  test('counts all lines while capturing only the requested window', () => {
    const page = new TextPage({ start: 1, limit: 1 });

    page.append('a\nb\nc');

    expect(page.finish()).toEqual({
      content: 'b\n',
      lineCount: 1,
      totalLines: 3,
    });
  });

  test('preserves empty lines', () => {
    const page = new TextPage({ start: 0, limit: 10 });

    page.append('a\n\nb\n');

    expect(page.finish()).toEqual({
      content: 'a\n\nb\n',
      lineCount: 3,
      totalLines: 3,
    });
  });

  test('rejects an oversized selected line', () => {
    const page = new TextPage({ start: 0, limit: 10 });

    expect(() => page.append('x'.repeat(MAX_OUTPUT_BYTES + 1)))
      .toThrow('exceeds the 50 KiB output limit');
  });

  test('stops capturing after the byte limit and still counts lines', () => {
    const page = new TextPage({ start: 0, limit: 10 });

    page.append('ok\n');
    page.append('x'.repeat(MAX_OUTPUT_BYTES));
    page.append('\nlast');

    expect(page.finish()).toEqual({
      content: 'ok\n',
      lineCount: 1,
      totalLines: 3,
    });
  });
});
