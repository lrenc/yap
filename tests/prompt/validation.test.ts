import { describe, expect, test } from 'bun:test';
import { isValidPromptName } from '../../src/prompt/validation.ts';

describe('isValidPromptName', () => {
  test('accepts Unicode file names up to 16 characters', () => {
    for (const name of [
      '中文提示词',
      'review-中文',
      'a'.repeat(16),
      '提'.repeat(16),
    ]) {
      expect(isValidPromptName(name)).toBe(true);
    }
  });

  test('rejects unsafe, reserved, and overlong file names', () => {
    for (const name of [
      '',
      '提'.repeat(17),
      '中文/提示',
      '中文\\提示',
      'name:part',
      'name.',
      'name ',
      'my prompt',
      ' foo',
      'a  b',
      'a\u00A0b',
      'a\u3000b',
      '.',
      '..',
      'default',
      'CON',
      'com1.txt',
      'line\nbreak',
      'next\u0085line',
    ]) {
      expect(isValidPromptName(name)).toBe(false);
    }
  });
});
