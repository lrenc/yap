import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { App } from '../../../src/app/app.ts';
import { models } from '../../../src/agent/models.ts';
import { FileSecretStore } from '../../../src/agent/settings/secrets.ts';
import { PromptRepository } from '../../../src/agent/settings/prompts.ts';
import { SettingsStore } from '../../../src/agent/settings/store.ts';
import {
  useKeyStatus,
  type KeyStatusResult,
} from '../../../src/cli/hooks/use-key-status.ts';
import type { Model } from '../../../src/agent/types.ts';

describe('useKeyStatus', () => {
  let rendered: ReturnType<typeof render> | null = null;
  let root: string | undefined;
  let app: App | undefined;

  afterEach(async () => {
    rendered?.unmount();
    rendered = null;
    app?.dispose();
    app = undefined;
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  async function createApp() {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-key-status-'));
    app = new App({
      settings: new SettingsStore(root),
      secrets: new FileSecretStore(root),
      prompts: new PromptRepository(root),
    });
    await app.initialize();
    return app;
  }

  async function waitFor(check: () => boolean): Promise<void> {
    const deadline = Date.now() + 1_000;
    while (!check()) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out. Last frame:\n${rendered?.lastFrame()}`);
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  async function flush(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  test('marks a missing key as ignored after use', async () => {
    const runtime = await createApp();
    let current: KeyStatusResult | undefined;
    rendered = render(
      <Probe
        app={runtime}
        model={models[0]!}
        capture={value => {
          current = value;
        }}
      />,
    );
    await waitFor(() => rendered?.lastFrame() === 'missing:false');

    current?.markAttempted();
    await flush();

    expect(rendered.lastFrame()).toBe('missing:true');
  });

  test('refreshes after configuration changes and resets on model switches', async () => {
    const runtime = await createApp();
    let current: KeyStatusResult | undefined;
    const tree = (model: Model) => (
      <Probe
        app={runtime}
        model={model}
        capture={value => {
          current = value;
        }}
      />
    );
    rendered = render(tree(models[0]!));
    await waitFor(() => rendered?.lastFrame() === 'missing:false');

    current?.markAttempted();
    await flush();
    expect(rendered.lastFrame()).toBe('missing:true');

    await runtime.setApiKey('deepseek', 'test-key');
    await waitFor(() => rendered?.lastFrame() === 'configured:false');

    await runtime.clearApiKey('deepseek');
    await waitFor(() => rendered?.lastFrame() === 'missing:false');

    current?.markAttempted();
    await flush();
    expect(rendered.lastFrame()).toBe('missing:true');
    rendered.rerender(tree(models[1]!));
    await waitFor(() => rendered?.lastFrame() === 'missing:false');
  });
});

function Probe({
  app,
  model,
  capture,
}: {
  app: App;
  model: Model;
  capture: (value: KeyStatusResult) => void;
}) {
  const result = useKeyStatus(app, model, true);
  capture(result);
  return <Text>{result.status}:{String(result.ignored)}</Text>;
}
