import { Box, Text } from 'ink';
import type { AppFeedback } from '../../hooks/use-app.ts';
import { useTheme } from '../../theme/index.ts';

export function Feedback({
  feedback,
  pending,
  paused,
}: {
  feedback: readonly AppFeedback[];
  pending: number;
  paused: boolean;
}) {
  const theme = useTheme();
  return (
    <Box
      flexDirection='column'
      flexShrink={0}
      paddingX={1}
      minHeight={1}
    >
      {feedback.map(item => (
        <Text
          key={item.id}
          color={theme.colors.feedback[item.level]}
          wrap='wrap'
        >
          {item.message}
        </Text>
      ))}
      {pending > 0 ? (
        <Text color={theme.colors.text.muted}>
          {pending} input{pending === 1 ? '' : 's'} queued
          {paused ? ' · waiting for panel' : ''}
        </Text>
      ) : null}
    </Box>
  );
}
