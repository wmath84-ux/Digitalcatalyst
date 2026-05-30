import { useEffect } from 'react';

let lockCount = 0;
let previousOverflow = '';

export const useBodyScrollLock = (locked: boolean = true) => {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.classList.add('overflow-hidden');
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.classList.remove('overflow-hidden');
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [locked]);
};
