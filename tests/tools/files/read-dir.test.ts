import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDirectoryTool } from '../../../src/tools/files/read-directory.ts';

describe('readDirectoryTool', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yap-read-dir-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('lists dotfiles, files, and directories alphabetically', async () => {
    await writeFile(join(root, 'b.txt'), '');
    await writeFile(join(root, 'a.txt'), '');
    await writeFile(join(root, '.hidden'), '');
    await mkdir(join(root, 'folder'));
    const tool = readDirectoryTool(root);

    const result = await tool.execute({
      path: '.',
      limit: null,
    }, new AbortController().signal);

    expect(String(result).split('\n')).toEqual([
      '.hidden',
      'a.txt',
      'b.txt',
      'folder/',
    ]);
  });

  test('sorts names case-insensitively', async () => {
    await writeFile(join(root, 'B.txt'), '');
    await writeFile(join(root, 'a.txt'), '');
    await writeFile(join(root, 'C.txt'), '');
    const tool = readDirectoryTool(root);

    const result = await tool.execute({
      path: '.',
      limit: null,
    }, new AbortController().signal);

    expect(String(result).split('\n')).toEqual([
      'a.txt',
      'B.txt',
      'C.txt',
    ]);
  });

  test('reports when entries exceed the limit', async () => {
    await writeFile(join(root, 'a.txt'), '');
    await writeFile(join(root, 'b.txt'), '');
    await writeFile(join(root, 'c.txt'), '');
    const tool = readDirectoryTool(root);

    expect(await tool.execute({
      path: '.',
      limit: 2,
    }, new AbortController().signal)).toBe(
      'a.txt\nb.txt\n\n'
      + '[2 entries limit reached. Use limit=4 for more]',
    );
  });

  test('does not report truncation when the limit is exact', async () => {
    await writeFile(join(root, 'a.txt'), '');
    await writeFile(join(root, 'b.txt'), '');
    const tool = readDirectoryTool(root);

    expect(await tool.execute({
      path: '.',
      limit: 2,
    }, new AbortController().signal)).toBe('a.txt\nb.txt');
  });

  test('reports an empty directory', async () => {
    const tool = readDirectoryTool(root);

    expect(await tool.execute({
      path: '.',
      limit: null,
    }, new AbortController().signal)).toBe('(empty directory)');
  });

  test('describes non-recursive output and parameter defaults', () => {
    const tool = readDirectoryTool(root);

    expect(tool.description).toContain('Does not recurse.');
    expect(tool.parameters).toMatchObject({
      properties: {
        path: {
          description: expect.stringContaining('supports ~'),
        },
        limit: {
          description: expect.stringContaining('Pass null to use 500'),
        },
      },
    });
  });

  test.skipIf(process.platform === 'win32')(
    'marks symbolic links to directories with a trailing slash',
    async () => {
      const target = join(root, 'target');
      await mkdir(target);
      await symlink(target, join(root, 'linked'));
      const tool = readDirectoryTool(root);

      expect(await tool.execute({
        path: '.',
        limit: null,
      }, new AbortController().signal)).toBe('linked/\ntarget/');
    },
  );
});
