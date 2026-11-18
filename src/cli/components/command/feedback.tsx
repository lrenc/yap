import { Box, Text } from 'ink';
import type { AppFeedback } from '../../hooks/use-app.ts';
import { useTheme } from '../../theme/index.ts';

export function Feedback({
  feedback,
}: {
  feedback: readonly AppFeedback[];
}) {
  const theme = useTheme();
  return (
    <Box
      flexDirection='column'
      flexShrink={0}
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
    </Box>
  );
}
