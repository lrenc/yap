import { describe, expect, test } from 'bun:test';
import { parseMarkdown } from '../../../src/cli/markdown/parse.ts';
import {
  appendMarkdown,
  finishMarkdown,
  startMarkdown,
} from '../../../src/cli/markdown/stream.ts';

describe('Markdown stream', () => {
  test('reparses only the last top-level block', () => {
    const first = startMarkdown('first\n\nsecond');
    const next = appendMarkdown(
      first,
      'first\n\nsecond\n\nthird',
    );

    expect(next.head[0]).toBe(first.view[0]);
    expect(next.view.map(block => block.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
    expect(next).toMatchObject({
      cut: 'first\n\nsecond\n\n'.length,
    });
  });

  test('keeps lists open across a blank line', () => {
    const first = startMarkdown('- one\n\n- two');
    expect(first.head).toEqual([]);

    const next = appendMarkdown(
      first,
      '- one\n\n- two\n\n# done',
    );
    expect(next.head.map(block => block.type)).toEqual(['list']);
    expect(next.view.map(block => block.type)).toEqual([
      'list',
      'heading',
    ]);
  });

  test('keeps CRLF offsets aligned with the original source', () => {
    const state = startMarkdown('one\r\n\r\ntwo');

    expect(state.cut).toBe('one\r\n\r\n'.length);
    expect(state.view.map(block => block.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });

  test('rebuilds when source is replaced at the same length', () => {
    const next = appendMarkdown(
      startMarkdown('first\n\nsecond'),
      'first\n\nSECOND',
    );

    expect(next.view.at(-1)).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', text: 'SECOND' }],
    });
  });

  test('reuses definitions from the committed prefix', () => {
    const next = appendMarkdown(
      startMarkdown('[site]: /url\n\n[site]'),
      '[site]: /url\n\n[site]\n\nnext',
    );

    expect(next.view[0]).toMatchObject({
      type: 'paragraph',
      children: [{
        type: 'link',
        href: '/url',
      }],
    });
  });

  test('finishes with an authoritative full parse', () => {
    const source = '[site]\n\nheading\n\n[site]: https://example.com';
    const streamed = appendMarkdown(
      startMarkdown('[site]\n\nheading'),
      source,
    );

    expect(streamed.view).not.toEqual(parseMarkdown(source));
    expect(finishMarkdown(source).view).toEqual(parseMarkdown(source));
  });
});
