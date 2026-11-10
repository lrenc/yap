import { useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { Input } from './input.tsx';
import { createDraft } from '../state/input.ts';
import type { Draft } from '../types.ts';

interface ComposerProps {
  initialValue?: string;
  onSubmit?: (value: string) => void;
}

export function Composer({
  initialValue = '',
  onSubmit,
}: ComposerProps) {
  const [draft, setDraft] = useState<Draft>(
    () => createDraft(initialValue),
  );
  const { rows } = useWindowSize();
  const maxRows = Math.max(
    1,
    Math.min(8, rows - 8),
  );

  return (
    <Box
      width='100%'
      backgroundColor='#373B43'
      flexDirection='column'
    >
      <Box
        paddingX={1}
        paddingY={1}
        alignItems='flex-start'
        flexDirection='row'
      >
        <Box width={2} flexShrink={0}>
          <Text color='#B4B5BC'>› </Text>
        </Box>
        <Input
          draft={draft}
          focus={true}
          maxRows={maxRows}
          onDraftChange={setDraft}
          placeholder='Ask anything...'
          {...(onSubmit ? { onSubmit } : {})}
        />
      </Box>
    </Box>
  );
}
