import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { StartUp } from '../../src/cli/components/startup.tsx';
import { isMacOS } from '../../src/utils/env.ts';

describe('StartUp', () => {
  let rendered: ReturnType<typeof render> | undefined;
  const originalTermProgram = process.env.TERM_PROGRAM;
  const originalTerm = process.env.TERM;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;

    if (originalTermProgram === undefined) {
      delete process.env.TERM_PROGRAM;
    } else {
      process.env.TERM_PROGRAM = originalTermProgram;
    }
    if (originalTerm === undefined) {
      delete process.env.TERM;
    } else {
      process.env.TERM = originalTerm;
    }
  });

  test('shows the platform-specific recommendation for a limited terminal', () => {
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    delete process.env.TERM;

    rendered = render(<StartUp />);
    const frame = rendered.lastFrame() ?? '';

    expect(frame).toContain(
      'For a better experience, use a recommended terminal:',
    );
    if (isMacOS()) {
      expect(frame).toContain('iTerm2 or Ghostty');
    } else if (process.platform === 'win32') {
      expect(frame).toContain('Windows Terminal or WezTerm');
    } else {
      expect(frame).toContain('GNOME Terminal or Kitty');
    }
  });

  test('does not show the recommendation for a modern terminal', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    process.env.TERM = 'xterm-256color';

    rendered = render(<StartUp />);

    expect(rendered.lastFrame()).not.toContain(
      'use a recommended terminal',
    );
  });
});
