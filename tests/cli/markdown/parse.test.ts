import { describe, expect, test } from 'bun:test';
import { parseMarkdown } from '../../../src/cli/markdown/parse.ts';

describe('Markdown parser', () => {
  test('normalizes headings, paragraphs, and inline styles', () => {
    const blocks = parseMarkdown(
      '# Title\n\nHello **bold** and *italic* with `code`.',
    );

    expect(blocks).toEqual([
      {
        type: 'heading',
        depth: 1,
        children: [{ type: 'text', text: 'Title' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Hello ' },
          {
            type: 'strong',
            children: [{ type: 'text', text: 'bold' }],
          },
          { type: 'text', text: ' and ' },
          {
            type: 'em',
            children: [{ type: 'text', text: 'italic' }],
          },
          { type: 'text', text: ' with ' },
          { type: 'code', text: 'code' },
          { type: 'text', text: '.' },
        ],
      },
    ]);
  });

  test('parses lists, quotes, links, and fenced code', () => {
    const blocks = parseMarkdown(
      '- one\n- two\n\n> quoted\n\n[site](https://example.com)\n\n'
      + '```ts\nconst x = 1;\n```',
    );

    expect(blocks.map(block => block.type)).toEqual([
      'list',
      'quote',
      'paragraph',
      'code',
    ]);
    expect(blocks[3]).toEqual({
      type: 'code',
      text: 'const x = 1;',
    });
  });

  test('tolerates an unfinished fenced code block while streaming', () => {
    const blocks = parseMarkdown('```ts\nconst value = 1');

    expect(blocks).toEqual([{
      type: 'code',
      text: 'const value = 1',
    }]);
  });

  test('recognizes tables and fenced directory trees', () => {
    const blocks = parseMarkdown([
      '| Name | Type |',
      '| :--- | ---: |',
      '| foo | bar |',
      '',
      '```text',
      'src/',
      '├── cli/',
      '└── app/',
      '```',
    ].join('\n'));

    expect(blocks.map(block => block.type)).toEqual(['table', 'tree']);
    expect(blocks[0]).toMatchObject({
      type: 'table',
      align: ['left', 'right'],
    });
    expect(blocks[1]).toEqual({
      type: 'tree',
      text: 'src/\n├── cli/\n└── app/',
    });
  });

  test('preserves task-list checked state', () => {
    const blocks = parseMarkdown('- [x] done\n- [ ] todo');

    expect(blocks).toMatchObject([{
      type: 'list',
      items: [
        [{
          type: 'paragraph',
          children: [{ type: 'text', text: '[x] done' }],
        }],
        [{
          type: 'paragraph',
          children: [{ type: 'text', text: '[ ] todo' }],
        }],
      ],
    }]);
  });
});
