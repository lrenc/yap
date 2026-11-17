import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../theme/index.ts';

export function Panel({
  children,
  footer,
  height,
}: {
  children: ReactNode;
  footer?: string;
  height?: number;
}) {
  const theme = useTheme();
  return (
    <Box
      flexDirection='column'
      marginTop={1}
      paddingX={1}
      flexShrink={0}
      {...(height === undefined ? {} : { height })}
    >
      <Box flexDirection='column'>
        {children}
      </Box>
      {footer ? (
        <Box marginTop={1}>
          <Text color={theme.colors.text.muted}>{footer}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function PanelStatus({
  busy,
  error,
}: {
  busy: boolean;
  error: string | undefined;
}) {
  const theme = useTheme();
  return (
    <>
      {busy ? (
        <Text color={theme.colors.text.muted}>
          Saving...
        </Text>
      ) : null}
      {error ? (
        <Text color={theme.colors.feedback.error}>
          {error}
        </Text>
      ) : null}
    </>
  );
}
