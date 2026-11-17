import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import {
  KeyNotice,
  keyNoticeLevel,
} from '../../../src/cli/components/key-notice.tsx';

describe('KeyNotice', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('renders a configuration hint', () => {
    rendered = render(
      <KeyNotice ignored={false} />,
    );

    expect(rendered.lastFrame()).toContain(
      'API key is not configured. Run /config to set it.',
    );
  });

  test('uses warning before use and error after use', () => {
    expect(keyNoticeLevel(false)).toBe('warning');
    expect(keyNoticeLevel(true)).toBe('error');
  });
});
