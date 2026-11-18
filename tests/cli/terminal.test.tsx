import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { render } from 'ink-testing-library';
import { App } from '../../src/app/app.ts';
import type { RunAdmission } from '../../src/app/queue.ts';
import { FileSecretStore } from '../../src/agent/settings/secrets.ts';
import { PromptRepository } from '../../src/agent/settings/prompts.ts';
import { SettingsStore } from '../../src/agent/settings/store.ts';
import { Terminal } from '../../src/cli/terminal.tsx';
import { sseEvent } from '../helpers/streams.ts';

describe('Terminal', () => {
  let rendered: ReturnType<typeof render> | null = null;
  let root: string | undefined;
  const home = homedir();
  const cwd = process.cwd();
  const displayCwd = cwd.startsWith(`${home}${sep}`)
    ? `~${cwd.slice(home.length)}`
    : cwd;

  afterEach(async () => {
    rendered?.unmount();
    rendered = null;
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  async function createApp(admitRun?: RunAdmission) {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-terminal-'));
    return new App({
      settings: new SettingsStore(root),
      secrets: new FileSecretStore(root),
      prompts: new PromptRepository(root),
      ...(admitRun === undefined ? {} : { admitRun }),
    });
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

  test('renders the startup screen and prompt input', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === true
    ));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('YAP');
    expect(frame).toContain('Ask anything...');
    expect(frame).toContain(
      'API key is not configured. Run /config to set it.',
    );
    expect(frame).toContain('DeepSeek Flash · high');
    expect(frame).toContain(displayCwd);
    expect(frame).not.toContain('PgUp/PgDn scroll');
    expect(frame.indexOf('YAP')).toBeLessThan(
      frame.indexOf('Ask anything...'),
    );
    expect(frame.indexOf('API key is not configured')).toBeLessThan(
      frame.indexOf('Ask anything...'),
    );
    const rows = frame.split('\n');
    const noticeRow = rows.findIndex(line => (
      line.includes('API key is not configured')
    ));
    expect(rows[noticeRow - 1]).toBe('');
    expect(frame.split('\n').length).toBeLessThanOrEqual(16);
  });

  test('queues ordinary messages while the API key is missing', async () => {
    const app = await createApp();
    const events: string[] = [];
    app.subscribe(event => events.push(event.type));
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === true
    ));

    rendered.stdin.write('hello\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('! hello') === true
      && rendered?.lastFrame()?.includes('API key is not configured') === true
    ));
    rendered.stdin.write('second\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('! second') === true
    ));

    expect(app.pendingCount).toBe(2);
    expect(events).not.toContain('userMessage');
    expect(events).not.toContain('done');
    expect(rendered.lastFrame()).not.toContain('Missing API Key');
    expect(rendered.lastFrame()).toContain('API key is not configured');
    const frame = rendered.lastFrame() ?? '';
    expect(frame).not.toContain('input queued');
    expect(frame.indexOf('! hello')).toBeLessThan(
      frame.indexOf('! second'),
    );
    expect(frame.indexOf('! hello')).toBeLessThan(
      frame.indexOf('Ask anything...'),
    );
  });

  test('shows generic admission blocks above the composer', async () => {
    const app = await createApp(() => ({
      type: 'blocked',
      block: {
        type: 'otherPrerequisite',
        message: 'waiting for workspace access',
      },
    }));
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('hello\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('! hello') === true
      && rendered?.lastFrame()?.includes(
        'waiting for workspace access'
      ) === true
    ));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).not.toContain('input queued');
    expect(frame.indexOf('waiting for workspace access')).toBeLessThan(
      frame.indexOf('Ask anything...'),
    );
    const rows = frame.split('\n');
    const noticeRow = rows.findIndex(line => (
      line.includes('waiting for workspace access')
    ));
    expect(rows[noticeRow - 1]).toBe('');
  });

  test('uses the same spacing for secrets loading errors', async () => {
    const app = await createApp();
    await fs.writeFile(
      join(root!, 'secrets.json'),
      JSON.stringify({
        version: 1,
        providers: {
          deepseek: { apiKey: 123 },
        },
      }),
    );
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Cannot load secrets') === true
    ));

    const frame = rendered.lastFrame() ?? '';
    const rows = frame.split('\n');
    const noticeRow = rows.findIndex(line => (
      line.includes('Cannot load secrets')
    ));
    expect(rows[noticeRow - 1]).toBe('');
    expect(frame.indexOf('Cannot load secrets')).toBeLessThan(
      frame.indexOf('Ask anything...'),
    );
  });

  test('keeps messages queued when secrets cannot be loaded', async () => {
    const app = await createApp();
    await fs.writeFile(
      join(root!, 'secrets.json'),
      JSON.stringify({
        version: 1,
        providers: {
          deepseek: { apiKey: 123 },
        },
      }),
    );
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Cannot load secrets') === true
    ));

    rendered.stdin.write('hello\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('! hello') === true
    ));
    await flush();

    expect(app.pendingCount).toBe(1);
    expect(rendered.lastFrame()?.match(/Cannot load secrets/g)).toHaveLength(1);
    expect(rendered.lastFrame()).not.toContain(
      'Secrets must be loaded successfully before use'
    );
  });

  test('clears initialization errors after secrets are repaired', async () => {
    const app = await createApp();
    const secretsPath = join(root!, 'secrets.json');
    await fs.writeFile(
      secretsPath,
      JSON.stringify({
        version: 1,
        providers: {
          deepseek: { apiKey: 123 },
        },
      }),
    );
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Cannot load secrets') === true
    ));

    await fs.writeFile(
      secretsPath,
      JSON.stringify({
        version: 1,
        providers: {},
      }),
    );
    rendered.stdin.write('hello\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('! hello') === true
      && rendered?.lastFrame()?.includes('API key is not configured') === true
    ));

    expect(rendered.lastFrame()).not.toContain('Cannot load secrets');
  });

  test('sends a queued message after configuring the API key', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response([
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: 'Queued response',
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
            content: [{ type: 'output_text', text: 'Queued response' }],
          }],
        },
      },
    ].map(sseEvent).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
    try {
      const app = await createApp();
      const events: string[] = [];
      const notices: string[] = [];
      app.subscribe(event => {
        events.push(event.type);
        if (event.type === 'notice') {
          notices.push(event.message);
        }
      });
      rendered = render(<Terminal app={app} />);
      await waitFor(() => (
        rendered?.lastFrame()?.includes('API key is not configured') === true
      ));

      rendered.stdin.write('hello\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('! hello') === true
      ));

      rendered.stdin.write('/config\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('› API Key') === true
      ));
      await flush();
      rendered.stdin.write('\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Enter API Key') === true
      ));
      rendered.stdin.write('test-key\r');

      await waitFor(() => (
        rendered?.lastFrame()?.includes('Queued response') === true
      ));
      const blockedFrame = rendered.frames.findIndex(frame => (
        frame.includes('! hello')
      ));
      const completedFrame = rendered.frames.findIndex((
        frame,
        index,
      ) => index > blockedFrame && frame.includes('✓ hello'));
      expect(blockedFrame).toBeGreaterThan(-1);
      expect(completedFrame).toBeGreaterThan(blockedFrame);
      expect(rendered.frames.slice(blockedFrame, completedFrame + 1).every(
        frame => frame.includes('hello'),
      )).toBe(true);
      expect(rendered.lastFrame()).toContain('✓ hello');
      expect(rendered.lastFrame()).not.toContain('! hello');

      expect(events.filter(type => type === 'userMessage')).toHaveLength(1);
      expect(notices).not.toContain(
        'Missing API Key for DeepSeek. Set it with /config.',
      );
      expect(app.pendingCount).toBe(0);
      expect(rendered.lastFrame()).not.toContain('API key is not configured');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('hides the key notice when the current provider is configured', async () => {
    const app = await createApp();
    await app.initialize();
    await app.setApiKey('deepseek', 'test-key');
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));
    await flush();

    expect(rendered.lastFrame()).not.toContain('API key is not configured');
  });

  test('ignores an empty key for another provider on GLM', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response([
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: 'GLM response',
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
            content: [{ type: 'output_text', text: 'GLM response' }],
          }],
        },
      },
    ].map(sseEvent).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
    try {
      const app = await createApp();
      await fs.writeFile(
        join(root!, 'config.json'),
        JSON.stringify({
          version: 1,
          activeModelId: 'glm-5.3',
          modelSettings: {},
        }),
      );
      await fs.writeFile(
        join(root!, 'secrets.json'),
        JSON.stringify({
          version: 1,
          providers: {
            deepseek: { apiKey: '' },
            zhipu: { apiKey: 'glm-test-key' },
          },
        }),
      );
      rendered = render(<Terminal app={app} />);
      await waitFor(() => (
        rendered?.lastFrame()?.includes('GLM-5.3') === true
      ));

      expect(rendered.lastFrame()).not.toContain('Cannot load secrets');
      expect(rendered.lastFrame()).not.toContain('API key is not configured');
      rendered.stdin.write('hello\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('GLM response') === true
      ));
      expect(rendered.lastFrame()).toContain('✓ hello');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('refreshes the key notice after a configuration event', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === true
    ));

    await app.setApiKey('deepseek', 'test-key');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === false
    ));
  });

  test('renders a streamed model response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response([
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: 'Hello',
      },
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: ' world',
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
            content: [{ type: 'output_text', text: 'Hello world' }],
          }],
        },
      },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
    try {
      const app = await createApp();
      rendered = render(<Terminal app={app} />);
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Ask anything...') === true
      ));
      await app.setApiKey('deepseek', 'test-key');

      rendered.stdin.write('hello\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Hello world') === true
      ));

      expect(rendered.lastFrame()).not.toContain('You');
      expect(rendered.lastFrame()).toContain('hello');
      expect(rendered.lastFrame()).toContain('✓ hello');
      expect(rendered.lastFrame()?.match(/Hello world/g)).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('renders streamed Markdown without syntax markers', async () => {
    const text = '## Result\n\n**Done**';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response([
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: '## Result\n\n',
      },
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: '**Done**',
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
    try {
      const app = await createApp();
      rendered = render(<Terminal app={app} />);
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Ask anything...') === true
      ));
      await app.setApiKey('deepseek', 'test-key');

      rendered.stdin.write('hello\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Done') === true
      ));

      const frame = rendered.lastFrame() ?? '';
      expect(frame).toContain('Result');
      expect(frame).toContain('Done');
      expect(frame).not.toContain('##');
      expect(frame).not.toContain('**');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('renders multiline streamed content only once', async () => {
    const text = 'first line\nsecond line\nthird line';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response([
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: 'first line\n',
      },
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: 'second line\n',
      },
      {
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 0,
        delta: 'third line',
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
    try {
      const app = await createApp();
      rendered = render(<Terminal app={app} />);
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Ask anything...') === true
      ));
      await app.setApiKey('deepseek', 'test-key');

      rendered.stdin.write('hello\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('third line') === true
      ));

      const frame = rendered.lastFrame() ?? '';
      expect(frame.match(/first line/g)).toHaveLength(1);
      expect(frame.match(/second line/g)).toHaveLength(1);
      expect(frame.match(/third line/g)).toHaveLength(1);
      expect(frame.match(/YAP/g)).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('keeps the Composer fixed while scrolling a long transcript', async () => {
    const text = Array.from(
      { length: 40 },
      (_value, index) => `line ${index + 1}`,
    ).join('\n');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response([
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
    try {
      const app = await createApp();
      rendered = render(<Terminal app={app} />);
      await waitFor(() => (
        rendered?.lastFrame()?.includes('Ask anything...') === true
      ));
      await app.setApiKey('deepseek', 'test-key');

      rendered.stdin.write('hello\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('line 40') === true
      ));

      const promptRow = () => rendered!.lastFrame()!.split('\n')
        .findIndex(line => line.includes('›'));
      const before = promptRow();
      rendered.stdin.write('\x1b[5~');
      await flush();

      expect(rendered.lastFrame()).not.toContain('line 40');
      expect(rendered.lastFrame()).not.toContain('scrolled up');
      expect(rendered.lastFrame()).not.toContain('Ctrl+End to follow');
      expect(promptRow()).toBe(before);

      rendered.stdin.write('/model\r');
      await waitFor(() => (
        rendered?.lastFrame()?.includes(
          '↑/↓ move · Enter select'
        ) === true
      ));
      rendered.stdin.write('\x1b');
      await waitFor(() => (
        rendered?.lastFrame()?.includes(
          '↑/↓ move · Enter select'
        ) === false
      ));

      rendered.stdin.write('\x1b[1;5F');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('line 40') === true
      ));

      Object.defineProperty(rendered.stdout, 'columns', {
        configurable: true,
        value: 48,
      });
      rendered.stdout.emit('resize');
      await waitFor(() => (
        rendered?.lastFrame()?.includes('line 40') === true
      ));
      expect(promptRow()).toBeGreaterThan(-1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('shows and filters the slash command list while typing', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('/');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Select a model') === true
      && rendered?.lastFrame()?.includes('/config') === true
    ));
    rendered.stdin.write('m');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Select a model') === true
      && rendered?.lastFrame()?.includes('› /config') === false
    ));
  });

  test('navigates command suggestions while keeping input editable', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('/');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› /model') === true
    ));
    await flush();
    rendered.stdin.write('\x1b[B');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› /config') === true
    ));
    rendered.stdin.write('m');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› /model') === true
      && rendered?.lastFrame()?.includes('› /config') === false
    ));
    rendered.stdin.write('o\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes(
        '↑/↓ move · Enter select'
      ) === true
    ));
  });

  test('runs the command selected with arrow keys', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('/');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› /model') === true
    ));
    await flush();
    rendered.stdin.write('\x1b[B');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› /config') === true
    ));
    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('not configured') === true
    ));
  });

  test('keeps the Composer fixed while command matches change', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === true
    ));
    const promptRow = () => rendered!.lastFrame()!.split('\n')
      .findIndex(line => line.includes('›'));

    const before = promptRow();
    rendered.stdin.write('/');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('No matching commands') === false
      && rendered?.lastFrame()?.includes('Select a model') === true
    ));
    const rows = rendered.lastFrame()!.split('\n');
    const promptLine = rows.find(line => line.includes('›'))!;
    const firstCommandRow = rows.findIndex(line => line.includes('/model'));
    expect(rows[firstCommandRow]!.indexOf('/model'))
      .toBe(promptLine.indexOf('/'));
    expect(firstCommandRow).toBeGreaterThan(rows.indexOf(promptLine));
    const withMenu = promptRow();
    rendered.stdin.write('m');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Select a model') === true
    ));
    const filtered = promptRow();

    expect(withMenu).toBe(before);
    expect(filtered).toBe(before);
  });

  test('opens the model panel and saves a selection', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('/model\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes(
        '↑/↓ move · Enter select'
      ) === true
    ));
    const frame = rendered.lastFrame()!;
    expect(frame).not.toContain('╭');
    const rows = frame.split('\n');
    expect(rows.findIndex(line => line.includes('›'))).toBeLessThan(
      rows.findIndex(line => line.includes('DeepSeek Flash')),
    );
    await flush();
    rendered.stdin.write('\x1b[B');
    await waitFor(() => rendered?.lastFrame()?.includes('› DeepSeek Pro') === true);
    rendered.stdin.write('\r');
    await waitFor(() => app.config?.activeModelId === 'deepseek-v4-pro');

    expect(rendered.lastFrame()).not.toContain('DeepSeek Flash');
    expect(rendered.lastFrame()).toContain('DeepSeek Pro · high');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === true
    ));
  });

  test('keeps an API Key visible while editing', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('/config\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API Key') === true
    ));
    await flush();
    await waitFor(() => (
      rendered?.lastFrame()?.includes('not configured') === true
    ));

    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Enter API Key') === true
    ));
    await flush();
    rendered.stdin.write('sk-test-secret');
    await flush();
    expect(rendered.lastFrame()).toContain('sk-test-secret');
    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API Key for') === false
    ));

    expect(rendered.lastFrame()).not.toContain('API Key saved');
    expect(rendered.lastFrame()).not.toContain('applies from the next run');
    expect(await app.hasApiKey('deepseek')).toBe(true);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === false
    ));

    await flush();
    rendered.stdin.write('/config\r');
    await flush();
    await waitFor(() => (
      rendered?.lastFrame()?.includes('configured') === true
    ));
    await flush();
    rendered.stdin.write('\x1b[B');
    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› default') === true
    ));
    rendered.stdin.write('\x1b[B');
    rendered.stdin.write('\r');
    await waitFor(() => (
      app.config?.modelSettings['deepseek-flash']?.reasoningEffort
      === 'none'
    ));
    await waitFor(() => (
      rendered?.lastFrame()?.includes('DeepSeek Flash · none') === true
    ));
    expect(rendered.lastFrame()).not.toContain('none saved');
    expect(rendered.lastFrame()).not.toContain('applies from the next run');
  });

  test('shows the key notice again after clearing the key', async () => {
    const app = await createApp();
    await app.initialize();
    await app.setApiKey('deepseek', 'test-key');
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));
    await flush();
    expect(rendered.lastFrame()).not.toContain('API key is not configured');

    rendered.stdin.write('/config\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('configured') === true
    ));
    rendered.stdin.write('c');
    await waitFor(() => (
      rendered?.lastFrame()?.includes(
        'Clear the stored API Key? Press Enter to confirm.'
      ) === true
    ));
    rendered.stdin.write('\r');

    await waitFor(() => (
      rendered?.lastFrame()?.includes('API key is not configured') === true
    ));
    expect(await app.hasApiKey('deepseek')).toBe(false);
  });

  test('creates a Prompt from the Prompt panel', async () => {
    const app = await createApp();
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('/prompt\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes(
        '↑/↓ move · a add'
      ) === true
    ));
    await flush();
    rendered.stdin.write('a');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('New Prompt name') === true
    ));
    rendered.stdin.write('r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› r') === true
    ));
    rendered.stdin.write('eviewer');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› reviewer') === true
    ));
    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Edit Prompt') === false
      && rendered?.lastFrame()?.includes('New Prompt · reviewer') === true
    ));
    rendered.stdin.write('R');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› R') === true
    ));
    rendered.stdin.write('eview carefully');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› Review carefully') === true
    ));
    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('New Prompt') === false
    ));

    expect(rendered.lastFrame()).not.toContain('Prompt created: reviewer');
    expect(await app.readPrompt('reviewer')).toBe('Review carefully');

    await flush();
    rendered.stdin.write('/prompt reviewer\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes(
        'reviewer · DeepSeek Flash · high'
      ) === true
    ));
    expect(rendered.lastFrame()).not.toContain('Prompt changed');
  });
});
