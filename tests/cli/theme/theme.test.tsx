import { afterEach, describe, expect, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import {
  darkTheme,
  ThemeProvider,
  useTheme,
  type Theme,
} from '../../../src/cli/theme/index.ts';

describe('ThemeProvider', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('provides the dark theme by default', async () => {
    let received: Theme | undefined;
    rendered = render(
      <ThemeProvider>
        <ThemeProbe onTheme={theme => {
          received = theme;
        }} />
      </ThemeProvider>,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(received).toBe(darkTheme);
  });

  test('allows a complete custom theme', async () => {
    const custom: Theme = {
      colors: {
        ...structuredClone(darkTheme.colors),
        feedback: {
          ...darkTheme.colors.feedback,
          error: '#123456',
        },
      },
    };
    let received: Theme | undefined;
    rendered = render(
      <ThemeProvider theme={custom}>
        <ThemeProbe onTheme={theme => {
          received = theme;
        }} />
      </ThemeProvider>,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(received?.colors.feedback.error).toBe('#123456');
  });
});

function ThemeProbe({ onTheme }: { onTheme: (theme: Theme) => void }) {
  onTheme(useTheme());
  return <Text>theme</Text>;
}
