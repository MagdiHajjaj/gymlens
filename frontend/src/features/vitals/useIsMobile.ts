import { useEffect, useState } from 'react';

/**
 * True when the device is mobile-like: coarse pointer (touch) or a
 * narrow viewport. Used to switch the vitals flow to the pulse-first,
 * battery-friendly mobile variant.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768,
  );

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () =>
      setIsMobile(coarse.matches || window.innerWidth < 768);
    coarse.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      coarse.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return isMobile;
}
