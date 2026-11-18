import { Box, Text } from 'ink';
import { useTheme } from '../theme/index.ts';

export interface NoticeItem {
  key: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export function Notice({
  notices,
}: {
  notices: readonly NoticeItem[];
}) {
  const theme = useTheme();
  return (
    <Box
      marginTop={1}
      paddingX={1}
      flexDirection='column'
      flexShrink={0}
    >
      {notices.map(notice => (
        <Text
          key={notice.key}
          color={theme.colors.feedback[notice.level]}
          wrap='wrap'
        >
          {notice.message}
        </Text>
      ))}
    </Box>
  );
}
