import fs from 'node:fs/promises';
import { writeFileAtomic } from './write.ts';
import type { AtomicWriteOptions } from './write.ts';
import { isObject } from './guards.ts';

export type JsonParse<T> = (value: unknown) => T;

function serializeJson(path: string, data: unknown): string {
  try {
    const content = JSON.stringify(data, null, 2);
    if (content === undefined) {
      throw new TypeError('Value is not JSON serializable');
    }
    return `${content}\n`;
  } catch (error) {
    throw new Error(`Cannot serialize JSON for ${path}`, {
      cause: error,
    });
  }
}

export async function readJson<T>(
  path: string, parse?: JsonParse<T>,
): Promise<T | null> {
  let content: string;
  try {
    content = await fs.readFile(path, 'utf8');
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`Cannot read JSON file ${path}`, {
      cause: error,
    });
  }

  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}`, {
      cause: error,
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
    throw new Error(`Cannot write JSON file ${path}`, {
      cause: error,
    });
  }
}
