import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  pathResolver,
  pathSchema,
} from '../../../src/tools/internal/path.ts';

describe('pathResolver', () => {
  test('resolves relative and absolute paths', () => {
    const resolvePath = pathResolver(tmpdir());

    expect(resolvePath('nested/file.txt')).toBe(
      resolve(tmpdir(), 'nested/file.txt'),
    );
    expect(resolvePath('/absolute/file.txt')).toBe('/absolute/file.txt');
  });

  test('expands the home directory', () => {
    const resolvePath = pathResolver(tmpdir());

    expect(resolvePath('~')).toBe(homedir());
    expect(resolvePath('~/documents')).toBe(
      resolve(homedir(), 'documents'),
    );
  });
});

describe('pathSchema', () => {
  test('requires a non-empty path', () => {
    expect(pathSchema.safeParse({ path: 'file.txt' }).success).toBe(true);
    expect(pathSchema.safeParse({ path: '' }).success).toBe(false);
    expect(pathSchema.safeParse({ path: '   ' }).success).toBe(false);
  });
});
