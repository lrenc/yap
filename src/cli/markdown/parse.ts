import { marked, type Token, type Tokens } from 'marked';
import type { InlineNode, MarkdownBlock } from './types.ts';

export function parseMarkdown(source: string): MarkdownBlock[] {
  const tokens = marked.lexer(source, {
    breaks: false,
    gfm: true,
  });
  return normalizeBlocks(tokens);
}

function normalizeBlocks(tokens: readonly Token[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'paragraph': {
        blocks.push(paragraph(token as Tokens.Paragraph));
        break;
      }
      case 'text': {
        blocks.push(paragraph(token as Tokens.Text));
        break;
      }
      case 'heading': {
        blocks.push(heading(token as Tokens.Heading));
        break;
      }
      case 'code': {
        blocks.push(code(token as Tokens.Code));
        break;
      }
      case 'list': {
        blocks.push(list(token as Tokens.List));
        break;
      }
      case 'blockquote': {
        blocks.push({
          type: 'quote',
          blocks: normalizeBlocks((token as Tokens.Blockquote).tokens ?? []),
        });
        break;
      }
      case 'table': {
        blocks.push(table(token as Tokens.Table));
        break;
      }
      case 'hr': {
        blocks.push({ type: 'hr' });
        break;
      }
      case 'html': {
        const children = normalizeInline([token]);
        if (children.length > 0) {
          blocks.push({ type: 'paragraph', children });
        }
        break;
      }
      case 'space':
      case 'def': {
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          const children = normalizeInline(token.tokens);
          if (children.length > 0) {
            blocks.push({ type: 'paragraph', children });
          }
        }
      }
    }
  }
  return blocks;
}

function paragraph(
  token: Tokens.Paragraph | Tokens.Text,
): MarkdownBlock {
  if (isTreeText(token.text)) {
    return {
      type: 'tree',
      text: token.text,
    };
  }
  return {
    type: 'paragraph',
    children: token.tokens
      ? normalizeInline(token.tokens)
      : [{ type: 'text', text: token.text }],
  };
}

function heading(token: Tokens.Heading): MarkdownBlock {
  return {
    type: 'heading',
    depth: Math.max(1, Math.min(6, token.depth)),
    children: normalizeInline(token.tokens),
  };
}

function code(token: Tokens.Code): MarkdownBlock {
  if (
    isTreeText(token.text)
    && (token.lang === undefined || token.lang === 'text')
  ) {
    return {
      type: 'tree',
      text: token.text,
    };
  }
  return {
    type: 'code',
    language: token.lang || undefined,
    text: token.text,
  };
}

function list(token: Tokens.List): MarkdownBlock {
  return {
    type: 'list',
    ordered: token.ordered,
    start: token.start === '' ? 1 : token.start,
    items: token.items.map(item => {
      const blocks = normalizeBlocks(item.tokens);
      const task = item.task
        ? item.checked ? '[x] ' : '[ ] '
        : '';
      if (task) {
        const first = blocks[0];
        if (first?.type === 'paragraph') {
          const child = first.children[0];
          if (child?.type === 'text') {
            child.text = `${task}${child.text}`;
          } else {
            first.children.unshift({ type: 'text', text: task });
          }
        } else {
          blocks.unshift({
            type: 'paragraph',
            children: [{ type: 'text', text: task.trimEnd() }],
          });
        }
      }
      return blocks;
    }),
  };
}

function table(token: Tokens.Table): MarkdownBlock {
  return {
    type: 'table',
    header: token.header.map(cell => normalizeInline(cell.tokens)),
    rows: token.rows.map(row => (
      row.map((cell): InlineNode[] => normalizeInline(cell.tokens))
    )),
    align: token.align,
  };
}

function isTreeText(text: string): boolean {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.length >= 2
    && lines.slice(1).filter(line => (
      /^\s*(?:[├└]──|[|`]--)/u.test(line)
    )).length >= 1
    && lines.every(line => !/^\s*```/u.test(line));
}

function normalizeInline(tokens: readonly Token[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape':
      case 'html': {
        appendText(nodes, token.text);
        break;
      }
      case 'strong':
      case 'em':
      case 'del': {
        nodes.push({
          type: token.type,
          children: normalizeInline(
            (token as Tokens.Strong | Tokens.Em | Tokens.Del).tokens ?? [],
          ),
        });
        break;
      }
      case 'codespan': {
        nodes.push({
          type: 'code',
          text: token.text,
        });
        break;
      }
      case 'br': {
        nodes.push({ type: 'break' });
        break;
      }
      case 'link': {
        nodes.push({
          type: 'link',
          href: token.href,
          children: normalizeInline((token as Tokens.Link).tokens ?? []),
        });
        break;
      }
      case 'image': {
        nodes.push({
          type: 'link',
          href: token.href,
          children: [{
            type: 'text',
            text: token.text || token.href,
          }],
        });
        break;
      }
      case 'checkbox': {
        appendText(nodes, token.checked ? '[x] ' : '[ ] ');
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          nodes.push(...normalizeInline(token.tokens));
        } else if ('text' in token && typeof token.text === 'string') {
          appendText(nodes, token.text);
        }
      }
    }
  }
  return nodes;
}

function appendText(nodes: InlineNode[], text: string): void {
  if (!text) {
    return;
  }
  const previous = nodes.at(-1);
  if (previous?.type === 'text') {
    previous.text += text;
  } else {
    nodes.push({ type: 'text', text });
  }
}
