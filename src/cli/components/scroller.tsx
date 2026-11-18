import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EventEmitter } from 'node:events';
import {
  Box,
  measureElement,
  useBoxMetrics,
  useInput,
  type DOMElement,
} from 'ink';

const WHEEL_STEP = 1;
const WHEEL_FRAME = 16;
const WHEEL_MAX_PENDING = 9;

export interface ScrollerProps {
  children: ReactNode;
  maxHeight?: number;
  onNewOutputChange?: (hasNewOutput: boolean) => void;
  scrollActive?: boolean;
  wheelEvents?: EventEmitter;
}

export function Scroller({
  children,
  maxHeight,
  onNewOutputChange,
  scrollActive = true,
  wheelEvents,
}: ScrollerProps) {
  const scrollerRef = useRef<DOMElement>(null);
  const contentRef = useRef<DOMElement>(null);
  const viewport = useBoxMetrics(scrollerRef);
  const content = useBoxMetrics(contentRef);
  const [offset, setOffset] = useState(0);
  const [following, setFollowing] = useState(true);
  const [hasNewOutput, setHasNewOutput] = useState(false);
  const offsetRef = useRef(0);
  const wheelPendingRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const previousHeightRef = useRef(content.height);
  const followingRef = useRef(following);
  followingRef.current = following;
  const maxOffset = Math.max(0, content.height - viewport.clientHeight);
  const maxOffsetRef = useRef(maxOffset);
  maxOffsetRef.current = maxOffset;

  const getMaxOffset = useCallback(() => {
    const scroller = scrollerRef.current;
    const contents = contentRef.current;
    if (!scroller || !contents) {
      return maxOffsetRef.current;
    }
    return Math.max(
      0,
      measureElement(contents).height - measureElement(scroller).height,
    );
  }, []);

  useLayoutEffect(() => {
    if (
      content.height > previousHeightRef.current
      && !followingRef.current
    ) {
      setHasNewOutput(true);
    }
    previousHeightRef.current = content.height;
  }, [content.height]);

  useLayoutEffect(() => {
    if (viewport.clientHeight === 0) {
      return;
    }
    const next = following
      ? maxOffset
      : Math.min(offsetRef.current, maxOffset);
    offsetRef.current = next;
    if (following) {
      setHasNewOutput(false);
    }
    setOffset(previous => next === previous ? previous : next);
  }, [following, maxOffset, viewport.clientHeight]);

  const scrollTo = useCallback((
    next: number,
    limit = getMaxOffset(),
  ) => {
    const clamped = Math.max(0, Math.min(next, limit));
    offsetRef.current = clamped;
    followingRef.current = clamped === limit;
    if (clamped === limit) {
      setHasNewOutput(false);
    }
    setOffset(clamped);
    setFollowing(clamped === limit);
  }, [getMaxOffset]);

  const cancelWheel = useCallback(() => {
    if (wheelTimerRef.current !== undefined) {
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = undefined;
    }
    wheelPendingRef.current = 0;
  }, []);

  useEffect(() => {
    onNewOutputChange?.(hasNewOutput);
  }, [hasNewOutput, onNewOutputChange]);

  useEffect(() => {
    if (!wheelEvents || !scrollActive) {
      return;
    }
    const stepWheel = (knownLimit?: number) => {
      wheelTimerRef.current = undefined;
      if (wheelPendingRef.current === 0) {
        return;
      }
      const limit = knownLimit ?? getMaxOffset();
      const current = offsetRef.current;
      const direction = Math.sign(wheelPendingRef.current);
      const available = direction < 0
        ? current
        : Math.max(0, limit - current);
      const pending = Math.min(
        Math.abs(wheelPendingRef.current),
        available,
      );
      if (pending === 0) {
        wheelPendingRef.current = 0;
        return;
      }
      const step = direction * Math.min(
        pending,
        pending <= WHEEL_STEP ? 1 : Math.ceil(pending / 2),
      );
      wheelPendingRef.current -= step;
      scrollTo(current + step, limit);
      if (wheelPendingRef.current !== 0) {
        wheelTimerRef.current = setTimeout(stepWheel, WHEEL_FRAME);
      }
    };
    const onWheel = (direction: -1 | 1) => {
      const current = offsetRef.current;
      const limit = maxOffsetRef.current;
      if (
        (direction < 0 && current <= 0)
        || (direction > 0 && current >= limit)
      ) {
        return;
      }
      const pending = wheelPendingRef.current;
      if (pending !== 0 && Math.sign(pending) !== direction) {
        wheelPendingRef.current = 0;
      }
      wheelPendingRef.current = Math.max(
        -WHEEL_MAX_PENDING,
        Math.min(
          wheelPendingRef.current + direction * WHEEL_STEP,
          WHEEL_MAX_PENDING,
        ),
      );
      if (wheelTimerRef.current === undefined) {
        stepWheel(limit);
        if (wheelTimerRef.current === undefined) {
          wheelTimerRef.current = setTimeout(stepWheel, WHEEL_FRAME);
        }
      }
    };
    wheelEvents.on('wheel', onWheel);
    return () => {
      wheelEvents.off('wheel', onWheel);
      cancelWheel();
    };
  }, [
    cancelWheel,
    getMaxOffset,
    scrollActive,
    scrollTo,
    wheelEvents,
  ]);

  useInput((_input, key) => {
    if (key.eventType === 'release') {
      return;
    }
    const page = Math.max(1, viewport.clientHeight - 1);
    if (key.ctrl && key.home) {
      cancelWheel();
      scrollTo(0);
      return;
    }
    if (key.ctrl && key.end) {
      cancelWheel();
      scrollTo(Number.MAX_SAFE_INTEGER);
      return;
    }
    if (key.pageUp) {
      cancelWheel();
      scrollTo(offsetRef.current - page);
      return;
    }
    if (key.pageDown) {
      cancelWheel();
      scrollTo(offsetRef.current + page);
    }
  }, { isActive: scrollActive });

  return (
    <Box
      ref={scrollerRef}
      flexDirection='column'
      flexShrink={1}
      minHeight={0}
      overflow='hidden'
      {...(maxHeight === undefined ? {} : { maxHeight })}
    >
      <Box
        flexDirection='column'
        flexShrink={1}
        minHeight={0}
        overflow='hidden'
        contentOffsetY={offset}
      >
        <Box ref={contentRef} flexDirection='column' flexShrink={0}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
