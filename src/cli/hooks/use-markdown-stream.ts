import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  appendMarkdown,
  finishMarkdown,
  startMarkdown,
  type MarkdownBuffer,
} from '../markdown/stream.ts';
import type { MarkdownBlock } from '../markdown/types.ts';

const MIN_DELAY = 40;
const MAX_DELAY = 160;
const COST_FACTOR = 4;

export function useMarkdownStream(
  source: string,
  streaming: boolean,
): MarkdownBlock[] {
  const cacheRef = useRef<MarkdownBuffer | null>(null);
  if (cacheRef.current === null) {
    cacheRef.current = startMarkdown(source);
  }
  const initial = cacheRef.current.view;
  const [blocks, setBlocks] = useState(initial);
  const latestRef = useRef(source);
  const doneRef = useRef(source);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const costRef = useRef(0);
  latestRef.current = source;

  useEffect(() => {
    if (!streaming) {
      clearTimer(timerRef);
      if (doneRef.current === source) {
        return;
      }
      const next = finishMarkdown(source);
      cacheRef.current = next;
      doneRef.current = source;
      setBlocks(next.view);
      return;
    }
    if (doneRef.current === source) {
      return;
    }

    function arm(wait: number): void {
      if (timerRef.current !== undefined) {
        return;
      }
      timerRef.current = setTimeout(run, wait);
    }

    function run(): void {
      timerRef.current = undefined;
      const text = latestRef.current;
      if (doneRef.current === text) {
        return;
      }
      const start = performance.now();
      const next = appendMarkdown(cacheRef.current!, text);
      const cost = performance.now() - start;
      cacheRef.current = next;
      doneRef.current = text;
      costRef.current = cost;
      setBlocks(next.view);
      if (latestRef.current !== text) {
        arm(delay(cost));
      }
    }

    arm(delay(costRef.current));
  }, [source, streaming]);

  useEffect(() => () => clearTimer(timerRef), []);

  return blocks;
}

function delay(cost: number): number {
  return Math.min(
    MAX_DELAY,
    Math.max(MIN_DELAY, Math.ceil(cost * COST_FACTOR)),
  );
}

function clearTimer(
  timer: React.RefObject<ReturnType<typeof setTimeout> | undefined>,
): void {
  if (timer.current !== undefined) {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
}
