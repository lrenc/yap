import { useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { Input } from './input.tsx';
import { createDraft } from '../../state/input.ts';
import type { Draft } from '../../types.ts';

export interface ComposerProps {
  focus?: boolean;
  initialValue?: string;
  onDraftChange?: (value: string) => void;
  placeholder?: string;
  onSubmit?: (value: string) => void;
}

export function Composer({
  focus = true,
  initialValue = '',
  onDraftChange,
  placeholder = 'Ask anything...',
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
          focus={focus}
          maxRows={maxRows}
          placeholder={placeholder}
          {...(onSubmit ? { onSubmit } : {})}
          onDraftChange={next => {
            setDraft(next);
            onDraftChange?.(next.value);
          }}
        />
      </Box>
    </Box>
  );
}
