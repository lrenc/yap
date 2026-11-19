import { memo } from 'react';
import { Box } from 'ink';
import { MarkdownBlockView } from './block.tsx';
import { MarkdownCursor } from './cursor.tsx';
import { blockSpacing } from './layout.ts';
import { useMarkdownStream } from '../hooks/use-markdown.ts';
import type { MarkdownBlock } from './types.ts';

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
  const blocks = useMarkdownStream(source, streaming);
  return (
    <MarkdownBlocks
      messageId={messageId}
      blocks={blocks}
      streaming={streaming}
      color={color}
    />
  );
});

const MarkdownBlocks = memo(function MarkdownBlocks({
  messageId,
  blocks,
  streaming,
  color,
}: {
  messageId: string;
  blocks: readonly MarkdownBlock[];
  streaming: boolean;
  color?: string | undefined;
}) {
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
