import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promptNameSchema } from '../../src/agent/settings/schema.ts';
import { PromptRepository } from '../../src/agent/settings/prompts.ts';

describe('promptNameSchema', () => {
  test('accepts Unicode file names up to 16 characters', () => {
    for (const name of [
      '中文提示词',
      'review-中文',
      'a'.repeat(16),
      '提'.repeat(16),
    ]) {
      expect(promptNameSchema.safeParse(name).success).toBe(true);
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
      expect(promptNameSchema.safeParse(name).success).toBe(false);
    }
  });
});

describe('PromptRepository', () => {
  test('creates, lists, and reads Unicode Prompt names', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'yap-unicode-prompt-'));
    try {
      const prompts = new PromptRepository(root);
      await prompts.create('中文提示词', '中文内容');

      expect(await prompts.list()).toContain('中文提示词');
      expect(await prompts.read('中文提示词')).toBe('中文内容');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
