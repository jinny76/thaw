// 恐慌热键：连按两次 ESC（窗口内）触发。

import { useEffect, useRef } from 'react';
import { PANIC_DOUBLE_ESC_WINDOW_MS } from '@thaw/shared';

export function usePanicKey(onPanic: () => void): void {
  const lastEscRef = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const now = Date.now();
      if (now - lastEscRef.current <= PANIC_DOUBLE_ESC_WINDOW_MS) {
        lastEscRef.current = 0;
        onPanic();
      } else {
        lastEscRef.current = now;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPanic]);
}
