import { useEffect, useRef, useState } from 'react';

function clamp(index: number, count: number): number {
  return Math.max(0, Math.min(index, Math.max(0, count - 1)));
}

export function useSelection(
  count: number,
  initialIndex = 0,
) {
  const [index, setIndex] = useState(() => clamp(initialIndex, count));
  const indexRef = useRef(index);

  const select = (next: number, total = count) => {
    const value = clamp(next, total);
    indexRef.current = value;
    setIndex(value);
  };

  useEffect(() => {
    const value = clamp(indexRef.current, count);
    if (value !== indexRef.current) {
      indexRef.current = value;
      setIndex(value);
    }
  }, [count]);

  return {
    index,
    current: () => indexRef.current,
    next: () => select(indexRef.current + 1),
    previous: () => select(indexRef.current - 1),
    select,
  };
}
