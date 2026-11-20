import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../../src/app/app.ts';
import { FileSecretStore } from '../../src/agent/settings/secrets.ts';
import { PromptRepository } from '../../src/agent/settings/prompts.ts';
import { SettingsStore } from '../../src/agent/settings/store.ts';
import type { AppEvent } from '../../src/app/types.ts';
import type { RunAdmission } from '../../src/agent/admission.ts';

describe('queue admission policy', () => {
  let app: App | undefined;
  let root: string | undefined;

  afterEach(async () => {
    app?.dispose();
    app = undefined;
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  async function createApp(admitRun: RunAdmission) {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-queue-'));
    app = new App({
      settings: new SettingsStore(root),
      secrets: new FileSecretStore(root),
      prompts: new PromptRepository(root),
      admitRun,
    });
    await app.initialize();
    return app;
  }

  async function waitFor(check: () => boolean): Promise<void> {
    const deadline = Date.now() + 1_000;
    while (!check()) {
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for queue state.');
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  async function completesWithin(
    promise: Promise<void>,
    timeout = 500,
  ): Promise<boolean> {
    return Promise.race([
      promise.then(() => true),
      new Promise<false>(resolve => {
        setTimeout(() => resolve(false), timeout);
      }),
    ]);
  }

  test('lets a command bypass a generically blocked queued message', async () => {
    const events: AppEvent[] = [];
    const runtime = await createApp(() => ({
      type: 'blocked',
      block: {
        type: 'someOtherPrerequisite',
        message: 'waiting for another prerequisite',
      },
    }));
    runtime.subscribe(event => events.push(event));

    runtime.submit('hello');
    await waitFor(() => events.some(event => (
      event.type === 'inputQueue'
      && event.blocked?.type === 'someOtherPrerequisite'
    )));
    expect(runtime.pendingCount).toBe(1);
    expect(events.some(event => event.type === 'userMessage')).toBe(false);
    expect(events.some(event => (
      event.type === 'inputQueue'
      && event.messages.length === 1
      && event.messages[0]?.id === 1
      && event.messages[0].content === 'hello'
    ))).toBe(true);

    runtime.submit('/config');
    await waitFor(() => events.some(event => (
      event.type === 'panel' && event.panel?.type === 'config'
    )));

    expect(runtime.pendingCount).toBe(1);
    expect(events.some(event => event.type === 'userMessage')).toBe(false);
    expect(events.some(event => (
      event.type === 'inputQueue'
      && event.messages.some(message => message.content === '/config')
    ))).toBe(false);
  });

  test('keeps slash messages in the visible queue', async () => {
    const events: AppEvent[] = [];
    const runtime = await createApp(() => ({
      type: 'blocked',
      block: {
        type: 'someOtherPrerequisite',
        message: 'waiting for another prerequisite',
      },
    }));
    runtime.subscribe(event => events.push(event));

    runtime.submit('/usr/local/bin');
    runtime.submit('//new');
    await waitFor(() => events.some(event => (
      event.type === 'inputQueue'
      && event.messages.length === 2
    )));

    const messages = events
      .filter(event => event.type === 'inputQueue')
      .at(-1)?.messages.map(message => message.content);
    expect(messages).toEqual(['/usr/local/bin', '/new']);
    expect(runtime.pendingCount).toBe(2);
    expect(events.some(event => event.type === 'sessionBoundary')).toBe(false);
  });

  test('runs slash text as a message', async () => {
    const events: AppEvent[] = [];
    let input: string | undefined;
    const runtime = await createApp(context => {
      input = context.input;
      return { type: 'ready' };
    });
    runtime.subscribe(event => {
      events.push(event);
      if (event.type === 'userMessage') {
        runtime.cancel();
      }
    });

    runtime.submit('/usr/local/bin');
    await waitFor(() => events.some(event => event.type === 'userMessage'));

    expect(input).toBe('/usr/local/bin');
    expect(events.find(event => event.type === 'userMessage')?.content)
      .toBe('/usr/local/bin');
  });

  test('runs escaped command text as a message', async () => {
    const events: AppEvent[] = [];
    let input: string | undefined;
    const runtime = await createApp(context => {
      input = context.input;
      return { type: 'ready' };
    });
    runtime.subscribe(event => {
      events.push(event);
      if (event.type === 'userMessage') {
        runtime.cancel();
      }
    });

    runtime.submit('//new');
    await waitFor(() => events.some(event => event.type === 'userMessage'));

    expect(input).toBe('/new');
    expect(events.find(event => event.type === 'userMessage')?.content)
      .toBe('/new');
    expect(events.some(event => event.type === 'sessionBoundary')).toBe(false);
  });

  test('links an accepted run to its queued message', async () => {
    const events: AppEvent[] = [];
    const runtime = await createApp(() => ({ type: 'ready' }));
    runtime.subscribe(event => {
      events.push(event);
      if (event.type === 'userMessage') {
        runtime.cancel();
      }
    });

    runtime.submit('hello');
    await waitFor(() => events.some(event => event.type === 'userMessage'));

    expect(events.find(event => event.type === 'userMessage'))
      .toMatchObject({
        queueId: 1,
        content: 'hello',
      });
  });

  test('cancels an unresolved admission and resumes new commands', async () => {
    const events: AppEvent[] = [];
    let admissionStarted = false;
    const runtime = await createApp(() => {
      admissionStarted = true;
      return new Promise(() => {});
    });
    runtime.subscribe(event => events.push(event));

    runtime.submit('hello');
    await waitFor(() => admissionStarted);
    runtime.cancel();
    runtime.submit('/config');

    await waitFor(() => events.some(event => (
      event.type === 'panel' && event.panel?.type === 'config'
    )));
    expect(runtime.pendingCount).toBe(0);
  });

  test('rechecks a blocked queue after an App configuration change', async () => {
    const events: AppEvent[] = [];
    let ready = false;
    let runtime: App;
    runtime = await createApp(() => (
      ready
        ? { type: 'ready' }
        : {
          type: 'blocked',
          block: {
            type: 'someOtherPrerequisite',
            message: 'waiting for another prerequisite',
          },
        }
    ));
    runtime.subscribe(event => {
      events.push(event);
      if (event.type === 'userMessage') {
        runtime.cancel();
      }
    });

    runtime.submit('hello');
    await waitFor(() => events.some(event => (
      event.type === 'inputQueue' && event.blocked !== null
    )));

    ready = true;
    await runtime.setApiKey('deepseek', 'test-key');
    await waitFor(() => events.some(event => event.type === 'userMessage'));
  });

  test('preserves the current block while rechecking admission', async () => {
    const events: AppEvent[] = [];
    const runtime = await createApp(() => ({
      type: 'blocked',
      block: {
        type: 'someOtherPrerequisite',
        message: 'waiting for another prerequisite',
      },
    }));
    runtime.subscribe(event => events.push(event));

    runtime.submit('hello');
    await waitFor(() => events.some(event => (
      event.type === 'inputQueue' && event.blocked !== null
    )));
    const previousLength = events.length;

    await runtime.setReasoningEffort('deepseek-flash', 'none');
    await waitFor(() => events.slice(previousLength).some(event => (
      event.type === 'inputQueue' && event.blocked !== null
    )));

    expect(events.slice(previousLength).some(event => (
      event.type === 'inputQueue'
      && event.pending > 0
      && event.blocked === null
    ))).toBe(false);
  });

  test('emits configuration changes for Prompt mutations', async () => {
    const changes: string[] = [];
    const runtime = await createApp(() => ({ type: 'ready' }));
    runtime.subscribe(event => {
      if (event.type === 'configChanged') {
        changes.push(event.change);
      }
    });

    await runtime.createPrompt('reviewer', 'Review carefully');
    await runtime.updatePrompt('reviewer', 'Review thoroughly');
    await runtime.deletePrompt('reviewer');

    expect(changes).toEqual(['prompt', 'prompt', 'prompt']);
  });

  test('reports a blocked queue as idle', async () => {
    const events: AppEvent[] = [];
    const runtime = await createApp(() => ({
      type: 'blocked',
      block: {
        type: 'someOtherPrerequisite',
        message: 'waiting for another prerequisite',
      },
    }));
    runtime.subscribe(event => events.push(event));

    runtime.submit('hello');
    await waitFor(() => events.some(event => (
      event.type === 'inputQueue' && event.blocked !== null
    )));

    expect(await completesWithin(runtime.whenIdle())).toBe(true);
  });
});
