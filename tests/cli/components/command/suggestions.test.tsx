import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Suggestions } from '../../../../src/cli/components/command/suggestions.tsx';

describe('Suggestions', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('shows the command catalog for a slash', async () => {
    rendered = render(<Suggestions input='/' />);
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('/model');
    expect(frame).toContain('/config');
    expect(frame).toContain('/prompt');
    expect(frame).toContain('/new');
  });

  test('filters the catalog as the command name grows', async () => {
    rendered = render(<Suggestions input='/co' />);
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('/config');
    expect(frame).not.toContain('/model');
    expect(frame).not.toContain('/prompt');
  });

  test('reports when no command matches', async () => {
    rendered = render(<Suggestions input='/missing' />);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(rendered.lastFrame()).toContain('No matching commands');
  });
});
