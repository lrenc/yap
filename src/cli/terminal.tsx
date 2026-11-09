import { useMemo } from 'react';
import { Static, Box, Text } from 'ink';
import { StartUp } from './components/startup.tsx';

export function Terminal() {
  const items = useMemo(() => (
    ['startup' as const]
  ), []);

  return (
    <Static items={items}>
      {item => item === 'startup' ? (
        <Box key='startup' flexDirection='column' marginBottom={1}>
          <StartUp />
        </Box>
      ) : (
        <Text key="">Hello</Text>
      )}
    </Static>
  );
}
