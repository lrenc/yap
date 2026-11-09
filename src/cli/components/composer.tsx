import { Box, Text } from 'ink';
import { Input } from './input.tsx';
import type { Draft } from '../types.ts';

interface ComposerProps {
  draft: Draft;
}

export function Composer({ draft }: ComposerProps) {
  return (
    <Box
      width='100%'
      backgroundColor='#373B43'
      paddingX={1}
      paddingY={1}
      flexDirection='row'
      alignItems='flex-start'
    >
      <Box width={2} flexShrink={0}>
        <Text color='#B4B5BC'>› </Text>
      </Box>
      <Input
        draft={draft}
        focus={true}
        placeholder='Ask anything...'
      />
    </Box>
  );
}
