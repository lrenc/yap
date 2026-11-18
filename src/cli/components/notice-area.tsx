import type { ReactNode } from 'react';
import { Box } from 'ink';

export function NoticeArea({ children }: { children: ReactNode }) {
  return (
    <Box
      marginTop={1}
      paddingX={1}
      flexDirection='column'
      flexShrink={0}
    >
      {children}
    </Box>
  );
}
