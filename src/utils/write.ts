import { randomUUID } from 'node:crypto';
import fs, { type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { isWindows } from './env.ts';

export interface AtomicWriteOptions {
  mode?: number;
  signal?: AbortSignal;
}

async function resolveMode(target: string, explicit?: number): Promise<number | undefined> {
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile()) {
      throw new Error(
        `Atomic writes require a regular file: ${target}`
      );
    }
    return explicit ?? (stat.mode & 0o7777);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return explicit;
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
    // 有些文件系统或网络盘不支持对目录 fsync
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function renameWithRetry(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0;;attempt += 1) {
    signal?.throwIfAborted();
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!isWindows() || !transient || attempt >= 5) {
        throw error;
      }
      await delay(20 * (attempt + 1), signal);
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason);
    };
    function finish(): void {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const { mode, signal } = options;
  signal?.throwIfAborted();

  const directory = dirname(target);
  const fileMode = await resolveMode(target, mode);

  await fs.mkdir(directory, { recursive: true });

  const temporary = join(directory, `.${basename(target).slice(0, 64)}.${randomUUID()}.tmp`);
  let handle: FileHandle | null = null;
  let created = false;
  try {
    handle = await fs.open(temporary, 'wx', fileMode ?? 0o666);
    created = true;
    await handle.writeFile(data);
    if (fileMode !== undefined && !isWindows()) {
      await handle.chmod(fileMode);
    }
    await handle.sync();
    await handle.close();
    handle = null;
    signal?.throwIfAborted();
    await renameWithRetry(temporary, target, signal);
    created = false;
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    if (created) {
      await fs.unlink(temporary).catch(() => {});
    }
    throw error;
  }
}
