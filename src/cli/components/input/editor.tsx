import { Box, Text } from 'ink';
import type { Draft } from '../../types.ts';
import { Input } from './input.tsx';

export interface EditorProps {
  draft: Draft;
  focus: boolean;
  maxRows: number;
  placeholder: string;
  onDraftChange: (draft: Draft) => void;
  onEscape?: () => void;
  onSubmit?: (value: string) => void;
}

export function Editor({
  draft,
  focus,
  maxRows,
  placeholder,
  onDraftChange,
  onEscape,
  onSubmit,
}: EditorProps) {
  return (
    <Box marginTop={1}>
      <Text>› </Text>
      <Input
        draft={draft}
        focus={focus}
        maxRows={maxRows}
        onDraftChange={onDraftChange}
        {...(onEscape ? { onEscape } : {})}
        {...(onSubmit ? { onSubmit } : {})}
        placeholder={placeholder}
      />
    </Box>
  );
}
