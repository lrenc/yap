import { useRef, useState } from 'react';

export function useLock() {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);

  return {
    locked,
    tryLock: () => {
      if (lockedRef.current) {
        return false;
      }
      lockedRef.current = true;
      setLocked(true);
      return true;
    },
    unlock: () => {
      lockedRef.current = false;
      setLocked(false);
    },
  };
}
