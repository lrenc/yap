import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import {
  Notice,
  type NoticeItem,
} from '../../../src/cli/components/notice.tsx';

describe('Notice', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('renders global notices in order', async () => {
    const notices: NoticeItem[] = [
      {
        key: 'warning',
        level: 'warning',
        message: 'API key is not configured.',
      },
      {
        key: 'error',
        level: 'error',
        message: 'Cannot load secrets.',
      },
    ];
    rendered = render(<Notice notices={notices} />);
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame.indexOf('API key is not configured.')).toBeLessThan(
      frame.indexOf('Cannot load secrets.'),
    );
  });
});
