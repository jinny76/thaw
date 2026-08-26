// 反截屏威慑（诚实定位：威慑/溯源，不保证截不了 —— Web 无法阻止 OS 层截屏）。
//
//  - 失焦/切后台 → 消息区模糊（挡"切到截图工具再回来截"）。
//  - PrintScreen 键 → 焚毁当前可见消息 + 回调（象征性威慑，仅桌面部分场景）。

import { useEffect, useState } from 'react';

export interface AntiCaptureOptions {
  /** 按下 PrintScreen 时的回调（可用于焚毁 + 通知对方）。 */
  onPrintScreen?: () => void;
}

export function useAntiCapture(opts: AntiCaptureOptions = {}): { obscured: boolean } {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const hide = () => setObscured(true);
    const show = () => setObscured(false);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
      else show();
    };
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    document.addEventListener('visibilitychange', onVisibility);

    const onKey = (e: KeyboardEvent) => {
      // PrintScreen 常无 keydown，用 keyup 捕捉；部分平台 key 为 'PrintScreen'
      if (e.key === 'PrintScreen') {
        opts.onPrintScreen?.();
      }
    };
    window.addEventListener('keyup', onKey);

    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', show);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keyup', onKey);
    };
  }, [opts]);

  return { obscured };
}
