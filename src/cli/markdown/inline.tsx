import { Fragment, type ReactNode } from 'react';
import { Text } from 'ink';
import { useTheme, type Theme } from '../theme/index.ts';
import type { InlineNode } from './types.ts';

type MarkdownColors = Theme['colors']['markdown'];

export function InlineContent({
  nodes,
}: {
  nodes: readonly InlineNode[];
}) {
  const markdown = useTheme().colors.markdown;
  return nodes.map((node, index) => (
    <Fragment key={index}>{renderInlineNode(node, markdown)}</Fragment>
  ));
}

export function inlineText(nodes: readonly InlineNode[]): string {
  let text = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'code': {
        text += node.text;
        break;
      }
      case 'break': {
        text += '\n';
        break;
      }
      case 'link': {
        const { label, destination } = linkParts(node);
        text += destination === undefined
          ? label
          : `${label} (${destination})`;
        break;
      }
      default: {
        text += inlineText(node.children);
      }
    }
  }
  return text;
}

function renderInlineNode(
  node: InlineNode,
  markdown: MarkdownColors,
): ReactNode {
  switch (node.type) {
    case 'text': {
      return node.text;
    }
    case 'code': {
      return (
        <Text
          color={markdown.inlineCode}
          backgroundColor={markdown.inlineCodeBackground}
        >
          {node.text}
        </Text>
      );
    }
    case 'strong': {
      return (
        <Text bold>
          <InlineContent nodes={node.children} />
        </Text>
      );
    }
    case 'em': {
      return (
        <Text italic>
          <InlineContent nodes={node.children} />
        </Text>
      );
    }
    case 'del': {
      return (
        <Text strikethrough>
          <InlineContent nodes={node.children} />
        </Text>
      );
    }
    case 'link': {
      const { destination } = linkParts(node);
      return (
        <>
          <Text color={markdown.link} underline>
            <InlineContent nodes={node.children} />
          </Text>
          {destination !== undefined ? (
            <Text dimColor> ({destination})</Text>
          ) : null}
        </>
      );
    }
    case 'break': {
      return '\n';
    }
  }
}

function linkParts(
  node: Extract<InlineNode, { type: 'link' }>,
): {
  label: string;
  destination: string | undefined;
} {
  const label = inlineText(node.children);
  return {
    label,
    destination: label === node.href ? undefined : node.href,
  };
}
