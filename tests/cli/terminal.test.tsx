import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Terminal } from '../../src/cli/terminal.tsx';

describe('Terminal', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('renders the current placeholder text', () => {
    rendered = render(<Terminal />);

    expect(rendered.lastFrame()).toContain('hello');
  });
});
