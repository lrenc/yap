import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Terminal } from '../../src/cli/terminal.tsx';

describe('Terminal', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('renders the startup screen and prompt input', async () => {
    rendered = render(<Terminal />);
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('YAP');
    expect(frame).toContain('Ask anything...');
  });
});
