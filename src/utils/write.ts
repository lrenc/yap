import { randomUUID } from 'node:crypto';
import fs, { type FileHandle } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { isWindows } from './env.ts';

export interface AtomicWriteOptions {
  mode?: number;
  directoryMode?: number;
  signal?: AbortSignal;
  followSymlink?: boolean;
  durable?: boolean;
}

async function resolveTarget(path: string): Promise<string> {
  try {
    return await fs.realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    try {
      if (!(await fs.lstat(path)).isSymbolicLink()) {
        return path;
      }
      return resolve(dirname(path), await fs.readlink(path));
    } catch {
      return path;
    }
  }
}

async function resolveMode(target: string, explicit?: number): Promise<number> {
  if (explicit !== undefined) {
    return explicit;
  }
  try {
    return (await fs.stat(target)).mode & 0o7777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0o666;
    }
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  if (isWindows()) {
    return;
  }
  let handle: FileHandle | null = null;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
  } catch {
    // 有些文件系统/网络盘不支持对目录 fsync
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!isWindows() || !transient || attempt >= 5) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
}

export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const {
    mode, directoryMode, signal,
    durable = true, followSymlink = true,
  } = options;
  signal?.throwIfAborted();

  const target = followSymlink ? await resolveTarget(path) : path;
  const directory = dirname(target);
  const fileMode = await resolveMode(target, mode);

  await fs.mkdir(directory, {
    recursive: true,
    mode: directoryMode ?? 0o777,
  });
  if (directoryMode !== undefined && !isWindows()) {
    const stat = await fs.lstat(directory);
    if (!stat.isSymbolicLink()) {
      await fs.chmod(directory, directoryMode);
    }
  }

  const temporary = join(directory, `.${basename(target).slice(0, 64)}.${randomUUID()}.tmp`);
  let handle: FileHandle | null = null;
  let created = false;
  try {
    handle = await fs.open(temporary, 'wx', fileMode);
    created = true;
    await handle.writeFile(data);
    if (durable) {
      await handle.sync();
    }
    await handle.close();
    handle = null;
    signal?.throwIfAborted();
    await renameWithRetry(temporary, target);
    created = false;
    if (durable) {
      await syncDirectory(directory);
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    if (created) {
      await fs.unlink(temporary).catch(() => {});
    }
    throw error;
  }
}
