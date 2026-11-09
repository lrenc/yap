import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '../../src/utils/write.ts';

describe('writeFileAtomic', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yap-write-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('creates parent directories and writes text', async () => {
    const target = join(root, 'nested', 'directory', 'settings.json');

    await writeFileAtomic(target, '{"enabled":true}');

    expect(await readFile(target, 'utf8')).toBe('{"enabled":true}');
    expect(await readdir(join(root, 'nested', 'directory'))).toEqual([
      'settings.json',
    ]);
  });

  test('writes binary data without modification', async () => {
    const target = join(root, 'data.bin');
    const data = new Uint8Array([0, 1, 2, 253, 254, 255]);

    await writeFileAtomic(target, data);

    expect(new Uint8Array(await readFile(target))).toEqual(data);
  });

  test('replaces an existing file and leaves no temporary files', async () => {
    const target = join(root, 'config.json');
    await writeFile(target, 'old');

    await writeFileAtomic(target, 'new');

    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(root)).toEqual(['config.json']);
  });

  test('preserves the mode of an existing file', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const target = join(root, 'private.json');
    await writeFile(target, 'old', { mode: 0o640 });
    await chmod(target, 0o640);

    await writeFileAtomic(target, 'new');

    expect((await stat(target)).mode & 0o777).toBe(0o640);
  });

  test('applies an explicit mode to a new file', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const target = join(root, 'private.json');

    await writeFileAtomic(target, 'new', { mode: 0o600 });

    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  test('rejects symbolic-link targets without changing either file', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const target = join(root, 'target.json');
    const link = join(root, 'link.json');
    await writeFile(target, 'old');
    await symlink(target, link);

    await expect(writeFileAtomic(link, 'new')).rejects.toThrow(
      'Atomic writes require a regular file',
    );

    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('old');
  });

  test('rejects directory targets and cleans up', async () => {
    const target = join(root, 'directory');
    await mkdir(target);

    await expect(writeFileAtomic(target, 'new')).rejects.toThrow(
      'Atomic writes require a regular file',
    );
    expect(await readdir(root)).toEqual(['directory']);
  });

  test('does nothing when the signal is already aborted', async () => {
    const target = join(root, 'aborted.json');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(
      writeFileAtomic(target, 'new', { signal: controller.signal }),
    ).rejects.toThrow('cancelled');

    expect(await readdir(root)).toEqual([]);
  });

  test('cleans up the temporary file when writing data fails', async () => {
    const target = join(root, 'invalid.json');

    await expect(
      writeFileAtomic(target, {} as never),
    ).rejects.toThrow();

    expect(await readdir(root)).toEqual([]);
  });
});
