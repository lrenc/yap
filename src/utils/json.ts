import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { writeFileAtomic } from './write.ts';
import type { AtomicWriteOptions } from './write.ts';
import { isObject } from './guards.ts';


export type JsonParse<T> = (value: unknown) => T;

export class JsonFileError extends Error {
  readonly code: string | undefined;
  readonly path: string;

  constructor(
    message: string,
    options: {
      path: string;
      code?: string | undefined;
      cause?: unknown;
    }
  ) {
    super(message, {
      cause: options.cause,
    });
    this.name = 'JsonFileError';
    this.path = options.path;
    this.code = options.code;
  }
}

function codeOf(error: unknown): string | undefined {
  return (
    isObject(error)
    && typeof error.code === 'string'
      ? error.code
      : undefined
  );
}

function serializeJson(path: string, data: unknown): string {
  let content: string | undefined;
  try {
    content = JSON.stringify(data, null, 2);
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : String(error);
    throw new JsonFileError(
      `Cannot serialize ${basename(path)}: ${reason}`, {
        path, code: 'ERR_JSON_SERIALIZE', cause: error,
      });
  }
  if (content === undefined) {
    throw new JsonFileError(
      `Cannot serialize ${basename(path)}: ${typeof data} is not JSON serializable`,
      { path, code: 'ERR_JSON_SERIALIZE' },
    );
  }
  return `${content}\n`;
}

export async function readJson<T>(
  path: string, parse?: JsonParse<T>,
): Promise<T | null> {
  let content: string;
  try {
    content = await fs.readFile(path, 'utf8');
  } catch (error) {
    const code = codeOf(error);
    if (code === 'ENOENT') {
      return null;
    }
    throw new JsonFileError(
      `Cannot read ${basename(path)}${code ? ` (${code})` : ''}: ${path}`,
      { path, code, cause: error },
    );
  }

  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : String(error);
    throw new JsonFileError(`Invalid JSON in ${path}: ${reason}`, {
      path, code: 'ERR_INVALID_JSON', cause: error,
    });
  }

  return parse ? parse(value) : (value as T);
}

export async function writeJson(
  path: string, data: unknown, options: AtomicWriteOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  const content = serializeJson(path, data);
  try {
    await writeFileAtomic(path, content, options);
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    const code = codeOf(error);
    throw new JsonFileError(
      `Cannot write ${basename(path)}${code ? ` (${code})` : ''}: ${path}`,
      { path, code, cause: error },
    );
  }
}

