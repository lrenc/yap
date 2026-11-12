import { describe, expect, test } from 'bun:test';
import type { Key } from 'ink';
import {
  createDraft,
  editInput,
  layoutInput,
  moveVerticalCursor,
  normalizeCursor,
} from '../../../src/cli/state/input.ts';

const neutralKey: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
  eventType: 'press',
};

function key(overrides: Partial<Key>): Key {
  return { ...neutralKey, ...overrides };
}

function layoutRows(
  value: string,
  cursor: number,
  columns: number,
) {
  return layoutInput(value, cursor, columns).rows.map(line => ({
    text: line.text,
    cursor: line.cursor,
  }));
}

describe('normalizeCursor', () => {
  test('clamps invalid positions to the valid text range', () => {
    expect(normalizeCursor('abc', -10)).toBe(0);
    expect(normalizeCursor('abc', 99)).toBe(3);
    expect(normalizeCursor('abc', Number.NaN)).toBe(0);
  });

  test('snaps positions inside a grapheme to its nearest boundary', () => {
    expect(normalizeCursor('a👨‍👩‍👧‍👦b', 3)).toBe(1);
    expect(normalizeCursor('a🇨🇳b', 2)).toBe(1);
  });

  test('createDraft always creates a normalized draft', () => {
    expect(createDraft('abc', 10)).toEqual({ value: 'abc', cursor: 3 });
    expect(createDraft('abc')).toEqual({ value: 'abc', cursor: 3 });
  });
});

describe('editInput', () => {
  test('inserts text at the grapheme cursor', () => {
    expect(editInput(createDraft('ac', 1), 'b')).toEqual({
      value: 'abc',
      cursor: 2,
    });
  });

  test('deletes graphemes in both directions', () => {
    expect(editInput(
      createDraft('😀b', 2),
      '',
      key({ backspace: true }),
    )).toEqual({ value: 'b', cursor: 0 });

    expect(editInput(
      createDraft('a😀b', 1),
      '',
      key({ delete: true }),
    )).toEqual({ value: 'ab', cursor: 1 });
  });

  test('never splits a grapheme when the input cursor is invalid', () => {
    const deleted = editInput(
      { value: '😀', cursor: 1 },
      '',
      key({ backspace: true }),
    );
    const inserted = editInput({ value: 'abc', cursor: 99 }, 'X');
    const negative = editInput({ value: 'abc', cursor: -1 }, 'X');

    expect([...deleted.value]).toEqual([]);
    expect(inserted).toEqual({ value: 'abcX', cursor: 4 });
    expect(negative).toEqual({ value: 'Xabc', cursor: 1 });
  });

  test('keeps the cursor after an insertion that merges forward', () => {
    const inserted = editInput(
      createDraft('\u200d👩', 0),
      '👨',
    );

    expect(inserted).toEqual({
      value: '👨‍👩',
      cursor: 5,
    });
    expect(editInput(inserted, 'X')).toEqual({
      value: '👨‍👩X',
      cursor: 6,
    });
  });

  test('moves by grapheme with arrows, Home, and End', () => {
    const draft = createDraft('a😀b');

    expect(editInput(draft, '', key({ leftArrow: true }))).toEqual({
      value: 'a😀b',
      cursor: 3,
    });
    const beforeEmoji = editInput(draft, '', key({ leftArrow: true }));
    expect(editInput(beforeEmoji, '', key({ leftArrow: true }))).toEqual({
      value: 'a😀b',
      cursor: 1,
    });
    expect(editInput(draft, '', key({ rightArrow: true }))).toEqual(draft);
    expect(editInput(draft, '', key({ home: true }))).toEqual({
      value: 'a😀b',
      cursor: 0,
    });
    expect(editInput(
      createDraft('a😀b', 0),
      '',
      key({ end: true }),
    )).toEqual({ value: 'a😀b', cursor: 4 });
  });

  test('returns a normalized draft when an arrow cannot move', () => {
    expect(editInput(
      { value: '😀', cursor: 1 },
      '',
      key({ rightArrow: true }),
    )).toEqual({ value: '😀', cursor: 2 });
  });

  test('ignores shortcuts and release events', () => {
    const draft = createDraft('abc', 1);

    for (const blocked of [
      key({ ctrl: true }),
      key({ meta: true }),
      key({ escape: true }),
      key({ tab: true }),
      key({ return: true }),
      key({ upArrow: true }),
      key({ downArrow: true }),
      key({ pageUp: true }),
      key({ pageDown: true }),
      key({ eventType: 'release' }),
    ]) {
      expect(editInput(draft, 'x', blocked)).toEqual(draft);
    }
  });
});

describe('layoutInput', () => {
  test('renders empty input with a visible cursor', () => {
    expect(layoutRows('', 0, 20)).toEqual([
      { text: ' ', cursor: 0 },
    ]);
  });

  test('handles LF, CRLF, and CR line separators', () => {
    for (const lineBreak of ['\n', '\r\n', '\r']) {
      expect(layoutRows(
        `a${lineBreak}b`,
        2 + lineBreak.length,
        20,
      )).toEqual([
        { text: 'a', cursor: -1 },
        { text: 'b ', cursor: 1 },
      ]);
    }
  });

  test('expands tabs to four-column stops', () => {
    expect(layoutRows('a\tb', 3, 20)).toEqual([
      { text: 'a   b ', cursor: 5 },
    ]);
  });

  test('wraps wide characters by display width', () => {
    expect(layoutRows('你好世界', 2, 4)).toEqual([
      { text: '你好', cursor: -1 },
      { text: '世界', cursor: 0 },
    ]);
  });

  test('normalizes invalid cursors before layout', () => {
    expect(layoutRows('😀', 1, 20)).toEqual([
      { text: '😀 ', cursor: 2 },
    ]);
  });

  test('uses a safe width for zero or negative columns', () => {
    expect(layoutRows('ab', 2, 0)).toEqual([
      { text: 'a', cursor: -1 },
      { text: 'b', cursor: -1 },
      { text: ' ', cursor: 0 },
    ]);
    expect(() => layoutInput('\t', 0, -1)).not.toThrow();
  });
});

describe('moveVerticalCursor', () => {
  test('moves between logical lines at the same display column', () => {
    const draft = createDraft('abc\ndef');
    const layout = layoutInput(draft.value, draft.cursor, 20);

    const up = moveVerticalCursor(draft, layout, 'up');
    expect(up).toEqual({ value: 'abc\ndef', cursor: 3 });

    const upLayout = layoutInput(up.value, up.cursor, 20);
    expect(moveVerticalCursor(up, upLayout, 'down')).toEqual(draft);
  });

  test('moves between soft-wrapped visual lines', () => {
    const draft = createDraft('abcdef', 5);
    const layout = layoutInput(draft.value, draft.cursor, 3);

    expect(moveVerticalCursor(draft, layout, 'up')).toEqual({
      value: 'abcdef',
      cursor: 2,
    });
  });

  test('clamps to the end of a shorter target line', () => {
    const draft = createDraft('abcdef\nx');
    const layout = layoutInput(draft.value, draft.cursor, 20);

    expect(moveVerticalCursor(draft, layout, 'up')).toEqual({
      value: 'abcdef\nx',
      cursor: 1,
    });
  });

  test('does nothing beyond the first and last rows', () => {
    const first = createDraft('one\ntwo', 0);
    const firstLayout = layoutInput(first.value, first.cursor, 20);
    expect(moveVerticalCursor(first, firstLayout, 'up')).toEqual(first);

    const last = createDraft('one\ntwo');
    const lastLayout = layoutInput(last.value, last.cursor, 20);
    expect(moveVerticalCursor(last, lastLayout, 'down')).toEqual(last);
  });

  test('uses the preferred column across shorter lines', () => {
    const draft = createDraft('abcdef\nx\nabcdef');
    const firstLayout = layoutInput(draft.value, draft.cursor, 20);
    const middle = moveVerticalCursor(
      draft,
      firstLayout,
      'up',
      6,
    );
    const middleLayout = layoutInput(middle.value, middle.cursor, 20);

    expect(moveVerticalCursor(
      middle,
      middleLayout,
      'up',
      6,
    )).toEqual({
      value: 'abcdef\nx\nabcdef',
      cursor: 6,
    });
  });
});
