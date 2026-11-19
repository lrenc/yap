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

type Timer = ReturnType<typeof setTimeout>;

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
  const parsedRef = useRef(source);
  const finalizedRef = useRef<string | undefined>(
    streaming ? undefined : source,
  );
  const timerRef = useRef<Timer | undefined>(undefined);
  const costRef = useRef(0);
  latestRef.current = source;

  const update = (): void => {
    timerRef.current = undefined;
    const text = latestRef.current;
    if (parsedRef.current === text) {
      return;
    }
    const started = performance.now();
    const next = appendMarkdown(cacheRef.current!, text);
    costRef.current = performance.now() - started;
    cacheRef.current = next;
    parsedRef.current = text;
    setBlocks(next.view);
    if (latestRef.current !== text) {
      timerRef.current = setTimeout(update, delay(costRef.current));
    }
  };

  useEffect(() => {
    if (!streaming) {
      clearTimer(timerRef);
      if (finalizedRef.current === source) {
        return;
      }
      const next = finishMarkdown(source);
      cacheRef.current = next;
      parsedRef.current = source;
      finalizedRef.current = source;
      setBlocks(next.view);
      return;
    }
    finalizedRef.current = undefined;
    if (
      parsedRef.current !== source
      && timerRef.current === undefined
    ) {
      timerRef.current = setTimeout(update, delay(costRef.current));
    }
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
  timer: React.RefObject<Timer | undefined>,
): void {
  if (timer.current !== undefined) {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
}
