import { useMemo, useRef } from 'react';
import type { MarkdownBlock } from '../markdown/types.ts';

interface BlockCache {
  signatures: string[];
  blocks: MarkdownBlock[];
}

export function useBlocks(
  blocks: readonly MarkdownBlock[],
): MarkdownBlock[] {
  const cacheRef = useRef<BlockCache>({
    signatures: [],
    blocks: [],
  });
  return useMemo(() => {
    const previous = cacheRef.current;
    const signatures = blocks.map(block => JSON.stringify(block));
    const stable = blocks.map((block, index) => (
      signatures[index] === previous.signatures[index]
        ? previous.blocks[index] ?? block
        : block
    ));
    cacheRef.current = { signatures, blocks: stable };
    return stable;
  }, [blocks]);
}
