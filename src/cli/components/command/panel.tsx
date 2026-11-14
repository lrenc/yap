import type { ReactNode } from 'react';
import { Box, Text } from 'ink';

export function Panel({
  children,
  footer,
  height,
  paddingX = 1,
}: {
  children: ReactNode;
  footer?: string;
  height?: number;
  paddingX?: number;
}) {
  return (
    <Box
      flexDirection='column'
      marginTop={1}
      paddingX={paddingX}
      flexShrink={0}
      {...(height === undefined ? {} : { height })}
    >
      <Box flexDirection='column'>
        {children}
      </Box>
      {footer ? (
        <Box marginTop={1}>
          <Text color='#7F848E'>{footer}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
