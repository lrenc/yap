import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { PromptRepository } from '../../../../src/app/settings/prompts.ts';
import { PromptPanel } from '../../../../src/cli/components/command/prompt.tsx';

describe('PromptPanel', () => {
  let rendered: ReturnType<typeof render> | undefined;
  let root: string | undefined;

  afterEach(async () => {
    rendered?.unmount();
    rendered = undefined;
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  test('refreshes the list after deleting an active Prompt fails to clear config', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'yap-prompt-panel-'));
    const prompts = new PromptRepository(root);
    await prompts.create('reviewer', 'Review carefully');
    let completed = 0;
    rendered = render(
      <PromptPanel
        prompts={prompts}
        activePrompt='reviewer'
        trackSave={save => save}
        onSelect={async () => {
          throw new Error('config write failed');
        }}
        onComplete={() => {
          completed += 1;
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => rendered?.lastFrame()?.includes('reviewer') === true);

    rendered.stdin.write('\x1b[B');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('› reviewer') === true
    ));
    rendered.stdin.write('d');
    await waitFor(() => rendered?.lastFrame()?.includes('Delete') === true);
    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('config write failed') === true
    ));

    expect(await prompts.read('reviewer')).toBeUndefined();
    expect(rendered.lastFrame()).not.toContain('Delete');
    expect(rendered.lastFrame()).toContain('› default');
    expect(completed).toBe(0);
  });
});

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!check()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for PromptPanel.');
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
