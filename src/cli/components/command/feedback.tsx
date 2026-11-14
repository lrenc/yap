import { Box, Text } from 'ink';
import type { AppFeedback } from '../../hooks/use-app.ts';

const COLORS = {
  info: '#B4B5BC',
  warning: '#E5C07B',
  error: '#E06C75',
} as const;

export function Feedback({
  feedback,
  pending,
  paused,
}: {
  feedback: readonly AppFeedback[];
  pending: number;
  paused: boolean;
}) {
  return (
    <Box flexDirection='column' paddingX={1} minHeight={1}>
      {feedback.map(item => (
        <Text key={item.id} color={COLORS[item.level]} wrap='wrap'>
          {item.message}
        </Text>
      ))}
      {pending > 0 ? (
        <Text color='#7F848E'>
          {pending} command{pending === 1 ? '' : 's'} queued
          {paused ? ' · waiting for panel' : ''}
        </Text>
      ) : null}
    </Box>
  );
}
