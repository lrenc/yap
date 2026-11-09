import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Composer } from '../../../src/cli/components/composer.tsx';
import { createDraft } from '../../../src/cli/state/input.ts';

async function waitForRender(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Composer', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('renders one prompt symbol before the input', async () => {
    rendered = render(
      <Composer draft={createDraft('')} />,
    );
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame.match(/›/g)).toHaveLength(1);
    expect(frame).toContain('› Ask anything...');
  });

  test('renders the current draft after the prompt symbol', async () => {
    rendered = render(
      <Composer draft={createDraft('hello')} />,
    );
    await waitForRender();

    expect(rendered.lastFrame()).toContain('› hello');
  });
});
