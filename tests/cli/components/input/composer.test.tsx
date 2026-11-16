import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Composer } from '../../../../src/cli/components/input/composer.tsx';

async function waitForRender(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Composer', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('renders one prompt symbol before the input', async () => {
    rendered = render(
      <Composer />,
    );
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame.match(/›/g)).toHaveLength(1);
    expect(frame).toContain('› Ask anything...');
  });

  test('renders the current draft after the prompt symbol', async () => {
    rendered = render(
      <Composer initialValue='hello' />,
    );
    await waitForRender();

    expect(rendered.lastFrame()).toContain('› hello');
  });

  test('grows with multiline content', async () => {
    rendered = render(
      <Composer initialValue={'one\ntwo\nthree\nfour'} />,
    );
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('one');
    expect(frame).toContain('two');
    expect(frame).toContain('three');
    expect(frame).toContain('four');
  });

  test('forwards escape to cancel active work', async () => {
    let escapes = 0;
    rendered = render(
      <Composer onEscape={() => {
        escapes += 1;
      }} />,
    );
    await waitForRender();

    rendered.stdin.write('\x1b[27u');
    await waitForRender();

    expect(escapes).toBe(1);
  });
});
