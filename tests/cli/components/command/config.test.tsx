import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { models } from '../../../../src/agent/models.ts';
import { ConfigPanel } from '../../../../src/cli/components/command/config.tsx';

describe('ConfigPanel', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('keeps the panel open and shows the save failure reason', async () => {
    let completed = 0;
    rendered = render(
      <ConfigPanel
        model={models[0]!}
        hasApiKey={async () => false}
        onSaveApiKey={async () => {
          throw new Error('secret store is read-only');
        }}
        onClearApiKey={async () => {}}
        onSaveEffort={async () => {}}
        onComplete={() => {
          completed += 1;
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => (
      rendered?.lastFrame()?.includes('not configured') === true
    ));

    rendered.stdin.write('\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('Enter API Key') === true
    ));
    rendered.stdin.write('sk-test-secret\r');
    await waitFor(() => (
      rendered?.lastFrame()?.includes('secret store is read-only') === true
    ));

    expect(completed).toBe(0);
    expect(rendered.lastFrame()).toContain('API Key for');
  });
});

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!check()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for ConfigPanel.');
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
