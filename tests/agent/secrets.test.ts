import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSecretStore } from '../../src/agent/settings/secrets.ts';

describe('FileSecretStore', () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  test('returns a trimmed API key from disk', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-secrets-'));
    await fs.writeFile(
      join(root, 'secrets.json'),
      JSON.stringify({
        version: 1,
        providers: {
          deepseek: { apiKey: '  sk-test-secret\n' },
        },
      }),
    );
    const secrets = new FileSecretStore(root);

    await secrets.load();

    expect(await secrets.getApiKey('deepseek')).toBe('sk-test-secret');
  });

  test('formats schema errors as compact JSON', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-secrets-'));
    await fs.writeFile(
      join(root, 'secrets.json'),
      JSON.stringify({
        version: 1,
        providers: {
          deepseek: { apiKey: 123 },
        },
      }),
    );
    const secrets = new FileSecretStore(root);

    const error = await secrets.load().catch(cause => cause);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain('\n');
    expect(error.message).toContain(
      '"path":["providers","deepseek","apiKey"]'
    );
    expect(error.message).toContain('"code":"invalid_type"');
  });

  test('treats an empty API key as missing without hiding other providers', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-secrets-'));
    await fs.writeFile(
      join(root, 'secrets.json'),
      JSON.stringify({
        version: 1,
        providers: {
          deepseek: { apiKey: '' },
          zhipu: { apiKey: 'glm-test-key' },
        },
      }),
    );
    const secrets = new FileSecretStore(root);

    await secrets.load();

    expect(await secrets.getApiKey('deepseek')).toBeUndefined();
    expect(await secrets.getApiKey('zhipu')).toBe('glm-test-key');
  });

  test('keeps the last loaded keys when a reload fails', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-secrets-'));
    const path = join(root, 'secrets.json');
    await fs.writeFile(
      path,
      JSON.stringify({
        version: 1,
        providers: {
          zhipu: { apiKey: 'glm-test-key' },
        },
      }),
    );
    const secrets = new FileSecretStore(root);
    await secrets.load();

    await fs.writeFile(path, '{');
    await expect(secrets.load()).rejects.toThrow('Cannot load secrets');

    expect(await secrets.getApiKey('zhipu')).toBe('glm-test-key');
  });
});
