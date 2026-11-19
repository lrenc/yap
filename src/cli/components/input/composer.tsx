import { useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { Input } from './input.tsx';
import { createDraft } from '../../state/input.ts';
import { useTheme } from '../../theme/index.ts';
import type { Draft, DraftChangeReason } from '../../types.ts';

interface ComposerProps {
  focus?: boolean;
  initialValue?: string;
  newOutput?: boolean;
  onDraftChange?: (value: string, reason: DraftChangeReason) => void;
  onNavigate?: (direction: 'up' | 'down') => boolean;
  placeholder?: string;
  onEscape?: () => void;
  onSubmit?: (value: string) => void;
}

export function Composer({
  focus = true,
  initialValue = '',
  newOutput = false,
  onDraftChange,
  onNavigate,
  placeholder = 'Ask anything...',
  onEscape,
  onSubmit,
}: ComposerProps) {
  const theme = useTheme();
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
      backgroundColor={theme.colors.surface.composer}
      flexDirection='column'
      flexShrink={0}
    >
      <Box
        paddingX={1}
        paddingY={1}
        alignItems='flex-start'
        flexDirection='row'
      >
        <Box width={2} flexShrink={0}>
          <Text color={newOutput
            ? theme.colors.markdown.cursor
            : theme.colors.role.userPrompt}
          >
            {newOutput ? '↓ ' : '› '}
          </Text>
        </Box>
        <Input
          draft={draft}
          focus={focus}
          maxRows={maxRows}
          placeholder={placeholder}
          onSubmit={onSubmit}
          onNavigate={onNavigate}
          onEscape={onEscape}
          onDraftChange={(next, reason) => {
            setDraft(next);
            onDraftChange?.(next.value, reason);
          }}
        />
      </Box>
    </Box>
  );
}
