import { memo, useMemo } from 'react';
import { Box } from 'ink';
import { MarkdownBlockView } from './block.tsx';
import { MarkdownCursor } from './cursor.tsx';
import { blockSpacing } from './layout.ts';
import { parseMarkdown } from './parse.ts';
import { useBlocks } from '../hooks/use-blocks.ts';
import { useStream } from '../hooks/use-stream.ts';

interface MarkdownMessageProps {
  messageId: string;
  source: string;
  streaming?: boolean;
  color?: string | undefined;
}

export const MarkdownMessage = memo(function MarkdownMessage({
  messageId,
  source,
  streaming = false,
  color,
}: MarkdownMessageProps) {
  const displaySource = useStream(source, streaming);
  const parsed = useMemo(
    () => parseMarkdown(displaySource),
    [displaySource],
  );
  const blocks = useBlocks(parsed);
  if (blocks.length === 0) {
    return streaming
      ? (
        <Box {...blockSpacing(false)}>
          <MarkdownCursor />
        </Box>
      )
      : null;
  }

  return (
    <Box flexDirection='column'>
      {blocks.map((block, index) => (
        <MarkdownBlockView
          key={`${messageId}:block:${index}`}
          block={block}
          color={color}
          trailing={streaming && index === blocks.length - 1}
        />
      ))}
    </Box>
  );
});
