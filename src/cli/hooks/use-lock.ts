import { useRef, useState } from 'react';

export function useLock() {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);

  return {
    locked,
    run: async (
      action: () => Promise<void>,
      onError: (error: unknown) => void,
    ): Promise<boolean> => {
      if (lockedRef.current) {
        return false;
      }
      lockedRef.current = true;
      setLocked(true);
      try {
        await action();
        return true;
      } catch (error) {
        onError(error);
        return false;
      } finally {
        lockedRef.current = false;
        setLocked(false);
      }
    },
  };
}
