import { describe, expect, test } from 'bun:test';
import { filterMouseInput } from '../../../src/cli/input/mouse.ts';

describe('filterMouseInput', () => {
  test('extracts wheel directions and preserves normal input', () => {
    const wheel: number[] = [];
    const filtered = filterMouseInput(
      `a\x1b[<64;10;5Mb\x1b[<65;10;5Mc`,
      direction => wheel.push(direction),
    );

    expect(filtered).toEqual({
      text: 'abc',
      pending: '',
    });
    expect(wheel).toEqual([-1, 1]);
  });

  test('holds an incomplete mouse sequence for the next chunk', () => {
    const filtered = filterMouseInput(
      'before\x1b[<64;10',
      () => {
        throw new Error('Wheel event should wait for a complete sequence.');
      },
    );

    expect(filtered.text).toBe('before');
    expect(filtered.pending).toBe('\x1b[<64;10');
  });

  test('ignores horizontal wheel reports', () => {
    const wheel: number[] = [];
    const filtered = filterMouseInput(
      '\x1b[<66;10;5M\x1b[<67;10;5M',
      direction => wheel.push(direction),
    );

    expect(filtered.text).toBe('');
    expect(wheel).toEqual([]);
  });

  test('supports legacy X10 wheel reports', () => {
    const wheel: number[] = [];
    const filtered = filterMouseInput(
      `a\x1b[M\x60\x21\x21b\x1b[M\x61\x21\x21c`,
      direction => wheel.push(direction),
    );

    expect(filtered).toEqual({
      text: 'abc',
      pending: '',
    });
    expect(wheel).toEqual([-1, 1]);
  });

  test('reassembles an X10 report split across input chunks', () => {
    const first = filterMouseInput('\x1b[M\x60', () => {});
    expect(first).toEqual({
      text: '',
      pending: '\x1b[M\x60',
    });

    const wheel: number[] = [];
    const second = filterMouseInput(
      `${first.pending}\x21\x21`,
      direction => wheel.push(direction),
    );
    expect(second).toEqual({
      text: '',
      pending: '',
    });
    expect(wheel).toEqual([-1]);
  });
});
