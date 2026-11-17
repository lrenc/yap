import { Box, Text } from 'ink';
import { MarkdownCursor } from './cursor.tsx';
import { blockSpacing } from './layout.ts';
import { useTheme } from '../theme/index.ts';

export function MarkdownTree({
  text,
  compact,
  trailing,
}: {
  text: string;
  compact: boolean;
  trailing: boolean;
}) {
  const theme = useTheme();
  const lines = text.split('\n');
  return (
    <Box {...blockSpacing(compact)} flexDirection='column'>
      {lines.map((line, index) => (
        <Text key={index} wrap='truncate-end'>
          <Text color={theme.colors.markdown.codeText}>
            {line}
          </Text>
          {trailing && index === lines.length - 1
            ? <MarkdownCursor />
            : null}
        </Text>
      ))}
    </Box>
  );
}
