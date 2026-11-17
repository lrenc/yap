import { Box, Text } from 'ink';
import { useTheme } from '../theme/index.ts';

export interface KeyNoticeProps {
  ignored: boolean;
}

export function keyNoticeLevel(ignored: boolean): 'warning' | 'error' {
  return ignored ? 'error' : 'warning';
}

export function KeyNotice({
  ignored,
}: KeyNoticeProps) {
  const theme = useTheme();
  const level = keyNoticeLevel(ignored);
  return (
    <Box paddingX={1}>
      <Text color={theme.colors.feedback[level]} wrap='truncate-end'>
        API key is not configured. Run /config to set it.
      </Text>
    </Box>
  );
}
