import fs from 'node:fs/promises';
import { isWindows } from '../../utils/env.ts';

export async function ensureDirectory(
  path: string,
  mode = 0o700,
): Promise<void> {
  await fs.mkdir(path, {
    recursive: true, mode,
  });
  const stats = await fs.lstat(path);
  if (!stats.isDirectory()) {
    throw new Error(`Settings path must be a directory: ${path}`);
  }
  if (!isWindows()) {
    await fs.chmod(path, mode);
  }
}

export async function repairPermissions(
  path: string, mode: 0o700 | 0o600,
): Promise<string | undefined> {
  let stats;
  try {
    stats = await fs.lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return `Cannot set private permissions for ${path}`;
    }
    return;
  }
  const directory = mode === 0o700;
  if (directory ? !stats.isDirectory() : !stats.isFile()) {
    throw new Error(
      `Settings path must be a ${directory ? 'directory' : 'regular file'}: ${path}`
    );
  }
  if (!isWindows() && (stats.mode & 0o7777) !== mode) {
    try {
      await fs.chmod(path, mode);
    } catch {
      return `Cannot set private permissions for ${path}`;
    }
  }
}
