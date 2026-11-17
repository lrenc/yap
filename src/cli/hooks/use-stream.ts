import {
  useEffect,
  useRef,
  useState,
} from 'react';

const STREAM_PARSE_INTERVAL = 40;

export function useStream(
  source: string,
  streaming: boolean,
): string {
  const [snapshot, setSnapshot] = useState(source);
  const pendingRef = useRef(source);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    pendingRef.current = source;
    if (!streaming) {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      setSnapshot(source);
      return;
    }
    if (timerRef.current !== undefined) {
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setSnapshot(pendingRef.current);
    }, STREAM_PARSE_INTERVAL);
  }, [source, streaming]);

  useEffect(() => () => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
    }
  }, []);

  return streaming ? snapshot : source;
}
