import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSecretStore } from '../../src/app/settings/secrets.ts';

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
});
