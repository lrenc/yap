import { memo } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { MarkdownTable } from './table.tsx';
import { InlineContent } from './inline.tsx';
import { blockSpacing } from './layout.ts';
import { MarkdownCursor } from './cursor.tsx';
import { MarkdownTree } from './tree.tsx';
import { useTheme, type Theme } from '../theme/index.ts';
import type { InlineNode, MarkdownBlock } from './types.ts';

interface BlockProps {
  block: MarkdownBlock;
  color: string | undefined;
  compact?: boolean;
  trailing?: boolean;
}

type MarkdownColors = Theme['colors']['markdown'];

export const MarkdownBlockView = memo(function MarkdownBlockView({
  block,
  color,
  compact = false,
  trailing = false,
}: BlockProps) {
  const markdown = useTheme().colors.markdown;
  switch (block.type) {
    case 'paragraph': {
      return paragraph(block.children, color, compact, trailing);
    }
    case 'quote': {
      return quote(block.blocks, color, markdown, compact, trailing);
    }
    case 'heading': {
      return heading(block, color, markdown, compact, trailing);
    }
    case 'code': {
      return code(block.text, color, markdown, compact, trailing);
    }
    case 'list': {
      return list(block, color, markdown, compact, trailing);
    }
    case 'table': {
      return (
        <MarkdownTable
          header={block.header}
          rows={block.rows}
          align={block.align}
          color={color}
          compact={compact}
          trailing={trailing}
        />
      );
    }
    case 'tree': {
      return (
        <MarkdownTree
          text={block.text}
          compact={compact}
          trailing={trailing}
        />
      );
    }
    case 'hr': {
      return horizontalRule(compact, trailing);
    }
  }
});

function MarkdownBlockSequence({
  blocks,
  color,
  compact = false,
  trailing = false,
}: {
  blocks: readonly MarkdownBlock[];
  color: string | undefined;
  compact?: boolean;
  trailing?: boolean;
}) {
  return blocks.map((block, index) => (
    <MarkdownBlockView
      key={index}
      block={block}
      color={color}
      compact={compact}
      trailing={trailing && index === blocks.length - 1}
    />
  ));
}

function paragraph(
  children: readonly InlineNode[],
  color: string | undefined,
  compact: boolean,
  trailing: boolean,
) {
  return (
    <Box {...blockSpacing(compact)}>
      <Text {...(color ? { color } : {})} wrap='wrap'>
        <InlineContent nodes={children} />
        {trailing ? <MarkdownCursor /> : null}
      </Text>
    </Box>
  );
}

function heading(
  block: Extract<MarkdownBlock, { type: 'heading' }>,
  color: string | undefined,
  markdown: MarkdownColors,
  compact: boolean,
  trailing: boolean,
) {
  return (
    <Box {...blockSpacing(compact)}>
      <Text
        bold
        color={color ?? (block.depth === 1
          ? markdown.heading
          : markdown.subheading)}
        underline={block.depth === 1}
        wrap='wrap'
      >
        <InlineContent nodes={block.children} />
        {trailing ? <MarkdownCursor /> : null}
      </Text>
    </Box>
  );
}

function code(
  value: string,
  color: string | undefined,
  markdown: MarkdownColors,
  compact: boolean,
  trailing: boolean,
) {
  return (
    <Box
      {...blockSpacing(compact)}
      backgroundColor={markdown.codeBackground}
      paddingX={compact ? 1 : undefined}
      flexDirection='column'
    >
      <Text color={color ?? markdown.codeText} wrap='wrap'>
        {value}
        {trailing ? <MarkdownCursor /> : null}
      </Text>
    </Box>
  );
}

function list(
  block: Extract<MarkdownBlock, { type: 'list' }>,
  color: string | undefined,
  markdown: MarkdownColors,
  compact: boolean,
  trailing: boolean,
) {
  const markerWidth = block.ordered
    ? `${block.start + block.items.length - 1}. `.length
    : 2;
  return (
    <Box
      {...blockSpacing(compact)}
      flexDirection='column'
    >
      {block.items.map((item, index) => (
        <Box key={index} alignItems='flex-start' flexDirection='row'>
          <Box width={markerWidth} flexShrink={0}>
            <Text color={markdown.treeBranch}>
              {block.ordered ? `${block.start + index}. ` : '• '}
            </Text>
          </Box>
          <Box flexDirection='column' flexGrow={1} minWidth={0}>
            <MarkdownBlockSequence
              blocks={item}
              color={color}
              compact
              trailing={trailing && index === block.items.length - 1}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function quote(
  blocks: readonly MarkdownBlock[],
  color: string | undefined,
  markdown: MarkdownColors,
  compact: boolean,
  trailing: boolean,
) {
  return (
    <Box
      {...blockSpacing(compact)}
      alignItems='flex-start'
      flexDirection='row'
    >
      <Box width={2} flexShrink={0}>
        <Text color={markdown.cursor}>│ </Text>
      </Box>
      <Box flexDirection='column' flexGrow={1} minWidth={0}>
        <MarkdownBlockSequence
          blocks={blocks}
          color={color}
          compact
          trailing={trailing}
        />
      </Box>
    </Box>
  );
}

function horizontalRule(compact: boolean, trailing: boolean) {
  return <MarkdownRule compact={compact} trailing={trailing} />;
}

function MarkdownRule({
  compact,
  trailing,
}: {
  compact: boolean;
  trailing: boolean;
}) {
  const markdown = useTheme().colors.markdown;
  const { columns } = useWindowSize();
  return (
    <Box {...blockSpacing(compact)}>
      <Text color={markdown.tableRowRule} wrap='truncate-end'>
        {'─'.repeat(Math.max(
          1,
          columns - (compact ? 0 : 5),
        ))}
        {trailing ? <MarkdownCursor /> : null}
      </Text>
    </Box>
  );
}
