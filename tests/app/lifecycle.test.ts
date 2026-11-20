import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../../src/app/app.ts';
import type { AppEvent } from '../../src/app/types.ts';
import { PromptRepository } from '../../src/agent/settings/prompts.ts';
import { FileSecretStore } from '../../src/agent/settings/secrets.ts';
import { SettingsStore } from '../../src/agent/settings/store.ts';
import { sseEvent } from '../helpers/streams.ts';

function responseStream(text = 'reply'): Response {
  return new Response([
    {
      type: 'response.output_text.delta',
      item_id: 'message_1',
      output_index: 0,
      delta: text,
    },
    {
      type: 'response.completed',
      response: {
        id: 'response_1',
        status: 'completed',
        output: [{
          type: 'message',
          id: 'message_1',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        }],
      },
    },
  ].map(sseEvent).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('App lifecycle', () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  test('uses Agent-owned session and run IDs across /new', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-lifecycle-'));
    const app = new App({
      settings: new SettingsStore(root),
      secrets: new FileSecretStore(root),
      prompts: new PromptRepository(root),
      admitRun: () => ({ type: 'ready' }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => responseStream();
    try {
      await app.initialize();
      await app.setApiKey('deepseek', 'test-key');
      const events: AppEvent[] = [];
      app.subscribe(event => events.push(event));

      app.submit('first');
      await app.whenIdle();
      app.submit('second');
      await app.whenIdle();
      app.submit('/new');
      await app.whenIdle();
      app.submit('third');
      await app.whenIdle();

      const ids = events
        .filter(event => event.type === 'userMessage')
        .map(event => [event.sessionId, event.runId]);
      expect(ids).toEqual([
        [1, 1],
        [1, 2],
        [2, 3],
      ]);
      expect(events.find(event => event.type === 'sessionBoundary'))
        .toMatchObject({ sessionId: 1 });
    } finally {
      globalThis.fetch = originalFetch;
      app.dispose();
    }
  });

  test('reports the same missing Prompt again after returning to it', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-missing-prompt-'));
    await fs.writeFile(join(root, 'config.json'), JSON.stringify({
      version: 1,
      activeModelId: 'deepseek-flash',
      modelSettings: {},
      activePrompt: 'missing',
    }));
    const app = new App({
      settings: new SettingsStore(root),
      secrets: new FileSecretStore(root),
      prompts: new PromptRepository(root),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => responseStream();
    try {
      const notices: string[] = [];
      app.subscribe(event => {
        if (event.type === 'notice') {
          notices.push(event.message);
        }
      });

      await app.initialize();
      await app.setApiKey('deepseek', 'test-key');

      const warning =
        'Prompt "missing" is missing; using default.';
      expect(notices.filter(message => message === warning)).toHaveLength(1);

      await app.setActivePrompt(undefined);
      app.submit('use default');
      await app.whenIdle();

      await app.setActivePrompt('missing');
      app.submit('use missing again');
      await app.whenIdle();

      expect(notices.filter(message => message === warning)).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
      app.dispose();
    }
  });
});
