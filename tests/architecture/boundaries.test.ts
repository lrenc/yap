import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'src');

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

async function importsFrom(
  directory: string,
  patterns: readonly string[],
): Promise<string[]> {
  const violations: string[] = [];
  for (const path of await sourceFiles(directory)) {
    const source = await fs.readFile(path, 'utf8');
    for (const pattern of patterns) {
      if (source.includes(pattern)) {
        violations.push(`${path}: ${pattern}`);
      }
    }
  }
  return violations;
}

async function runtimeExportsFromTypeModules(): Promise<string[]> {
  const violations: string[] = [];
  for (const path of await sourceFiles(root)) {
    if (!path.endsWith('/types.ts')) {
      continue;
    }
    const source = await fs.readFile(path, 'utf8');
    if (
      /export\s*\{/u.test(source)
      || /export\s+(?:const|let|var|function|class|enum|default)\b/u.test(source)
    ) {
      violations.push(path);
    }
  }
  return violations;
}

describe('module boundaries', () => {
  test('App does not depend on Session or Run implementations', async () => {
    expect(await importsFrom(join(root, 'app'), [
      '../agent/session/',
      '../agent/run/run.ts',
    ])).toEqual([]);
  });

  test('CLI does not bypass App for Session state', async () => {
    expect(await importsFrom(join(root, 'cli'), [
      'agent/settings/',
      '../agent/session/',
      '../../agent/session/',
      '../../../agent/session/',
    ])).toEqual([]);
  });

  test('Session does not depend on App', async () => {
    expect(await importsFrom(join(root, 'agent/session'), [
      '../../app/',
    ])).toEqual([]);
  });

  test('only Agent constructs production Sessions', async () => {
    const constructions: string[] = [];
    for (const path of await sourceFiles(root)) {
      if (path === join(root, 'agent/agent.ts')) {
        continue;
      }
      const source = await fs.readFile(path, 'utf8');
      if (source.includes('new Session(')) {
        constructions.push(path);
      }
    }
    expect(constructions).toEqual([]);
  });

  test('Agent domain files no longer live under App', async () => {
    for (const path of [
      'app/models.ts',
      'app/providers.ts',
      'app/clients.ts',
      'app/settings',
    ]) {
      await expect(fs.stat(join(root, path))).rejects.toBeInstanceOf(Error);
    }
    expect(dirname(join(root, 'agent/models.ts'))).toBe(join(root, 'agent'));
  });

  test('type modules do not export runtime values or re-exports', async () => {
    expect(await runtimeExportsFromTypeModules()).toEqual([]);
  });
});
