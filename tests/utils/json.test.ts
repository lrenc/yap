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
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJson } from '../../src/utils/json.ts';

async function captureError(action: () => Promise<unknown>): Promise<Error> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Expected an Error, received ${String(error)}`);
  }
  throw new Error('Expected action to reject');
}

describe('JSON utilities', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yap-json-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('returns null for a missing file', async () => {
    expect(await readJson(join(root, 'missing.json'))).toBeNull();
  });

  test('reads JSON with a UTF-8 BOM', async () => {
    const target = join(root, 'bom.json');
    await writeFile(target, '\uFEFF{"enabled":true}', 'utf8');

    expect(await readJson(target)).toEqual({ enabled: true });
  });

  test('passes parsed JSON through a validation callback', async () => {
    const target = join(root, 'settings.json');
    await writeFile(target, '{"value":42}', 'utf8');

    const result = await readJson<number>(target, value => {
      if (
        typeof value !== 'object'
        || value === null
        || !('value' in value)
        || typeof value.value !== 'number'
      ) {
        throw new TypeError('Invalid settings');
      }
      return value.value;
    });

    expect(result).toBe(42);
  });

  test('propagates validation callback errors unchanged', async () => {
    const target = join(root, 'settings.json');
    await writeFile(target, '{"value":42}', 'utf8');
    const failure = new TypeError('Validation failed');

    const error = await captureError(() => readJson(target, () => {
      throw failure;
    }));

    expect(error).toBe(failure);
  });

  test('reports malformed JSON with the original cause', async () => {
    const target = join(root, 'broken.json');
    await writeFile(target, '{"broken"', 'utf8');

    const error = await captureError(() => readJson(target));

    expect(error.message).toBe(`Invalid JSON in ${target}`);
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  test('wraps non-ENOENT read failures', async () => {
    const target = join(root, 'directory');
    await mkdir(target);

    const error = await captureError(() => readJson(target));

    expect(error.message).toBe(`Cannot read JSON file ${target}`);
    expect(error.cause).toBeInstanceOf(Error);
  });

  test('writes formatted JSON with a trailing newline', async () => {
    const target = join(root, 'nested', 'settings.json');

    await writeJson(target, { enabled: true });

    expect(await readFile(target, 'utf8')).toBe(
      '{\n  "enabled": true\n}\n',
    );
  });

  test('rejects values that serialize to undefined', async () => {
    const target = join(root, 'undefined.json');

    await expect(writeJson(target, undefined)).rejects.toThrow(
      `Cannot serialize JSON for ${target}`,
    );
  });

  test('reports circular values as serialization failures', async () => {
    const target = join(root, 'circular.json');
    const value: Record<string, unknown> = {};
    value.self = value;

    const error = await captureError(() => writeJson(target, value));

    expect(error.message).toBe(`Cannot serialize JSON for ${target}`);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  test('wraps file-system write failures', async () => {
    const target = join(root, 'directory');
    await mkdir(target);

    const error = await captureError(() => writeJson(target, {}));

    expect(error.message).toBe(`Cannot write JSON file ${target}`);
    expect(error.cause).toBeInstanceOf(Error);
  });

  test('preserves the abort reason without wrapping it', async () => {
    const target = join(root, 'aborted.json');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(
      writeJson(target, {}, { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
  });
});
