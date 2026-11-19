import type { Links } from 'marked';
import { parseMarkdownTail } from './parse.ts';
import type { MarkdownBlock } from './types.ts';

export interface MarkdownBuffer {
  len: number;
  cut: number;
  head: MarkdownBlock[];
  view: MarkdownBlock[];
  links: Links;
}

export function startMarkdown(source: string): MarkdownBuffer {
  return sliceMarkdown(source, 0, [], undefined);
}

export function appendMarkdown(
  state: MarkdownBuffer,
  source: string,
): MarkdownBuffer {
  if (source.length <= state.len) {
    return startMarkdown(source);
  }
  return sliceMarkdown(source, state.cut, state.head, state.links);
}

export function finishMarkdown(source: string): MarkdownBuffer {
  const state = startMarkdown(source);
  return {
    len: source.length,
    cut: source.length,
    head: state.view,
    view: state.view,
    links: state.links,
  };
}

function sliceMarkdown(
  source: string,
  start: number,
  prev: MarkdownBlock[],
  links: Links | undefined,
): MarkdownBuffer {
  const part = parseMarkdownTail(source.slice(start), links);
  const head = part.head.length === 0
    ? prev
    : prev.concat(part.head);
  return {
    len: source.length,
    cut: start + part.cut,
    head,
    view: head.concat(part.tail),
    links: part.links,
  };
}
