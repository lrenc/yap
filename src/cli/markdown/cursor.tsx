import { Text } from 'ink';
import { useTheme } from '../theme/index.ts';

export function MarkdownCursor() {
  const theme = useTheme();
  return <Text color={theme.colors.markdown.cursor}>▌</Text>;
}
