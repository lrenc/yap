import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { render } from 'ink-testing-library';
import { App } from '../../src/app/app.ts';
import { FileSecretStore } from '../../src/app/settings/secrets.ts';
import { PromptRepository } from '../../src/app/settings/prompts.ts';
import { SettingsStore } from '../../src/app/settings/store.ts';
import { Terminal } from '../../src/cli/terminal.tsx';

describe('Terminal', () => {
  let rendered: ReturnType<typeof render> | undefined;
  let root: string | undefined;
  const home = homedir();
  const cwd = process.cwd();
  const displayCwd = cwd.startsWith(`${home}${sep}`)
    ? `~${cwd.slice(home.length)}`
    : cwd;

  afterEach(async () => {
    rendered?.unmount();
    rendered = undefined;
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  async function createApp() {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-terminal-'));
    return new App({
      settings: new SettingsStore(root),
      secrets: new FileSecretStore(root),
      prompts: new PromptRepository(root),
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

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('YAP');
    expect(frame).toContain('Ask anything...');
    expect(frame).toContain('DeepSeek Flash · high');
    expect(frame).toContain(displayCwd);
  });

  test('keeps ordinary messages out of the model conversation', async () => {
    const app = await createApp();
    const events: string[] = [];
    app.subscribe(event => events.push(event.type));
    rendered = render(<Terminal app={app} />);
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Ask anything...') === true
    ));

    rendered.stdin.write('hello\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Conversation is not available') === true
    ));

    expect(events).toContain('notice');
    expect(events).not.toContain('user_message');
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
      && rendered?.lastFrame()?.includes('/config') === false
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
      && rendered?.lastFrame()?.includes('/config') === false
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
    await waitFor(() => app.settings.config.activeModelId === 'deepseek-v4-pro');

    expect(rendered.lastFrame()).not.toContain('DeepSeek Flash');
    expect(rendered.lastFrame()).toContain('DeepSeek Pro · high');
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
      rendered?.lastFrame()?.includes('API Key saved') === true
    ));

    expect(rendered.lastFrame()).not.toContain('API Key for');
    expect(await app.secrets.getApiKey('deepseek')).toBe('sk-test-secret');

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
      app.settings.config.modelSettings['deepseek-flash']?.reasoningEffort
      === 'none'
    ));
    await waitFor(() => (
      rendered?.lastFrame()?.includes('none saved') === true
    ));
    expect(rendered.lastFrame()).toContain('DeepSeek Flash · none');
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
      rendered?.lastFrame()?.includes('Prompt created: reviewer') === true
    ));

    expect(rendered.lastFrame()).not.toContain('New Prompt');
    expect(await app.prompts.read('reviewer')).toBe('Review carefully');

    await flush();
    rendered.stdin.write('/prompt reviewer\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes(
        'reviewer · DeepSeek Flash · high'
      ) === true
    ));
  });
});
