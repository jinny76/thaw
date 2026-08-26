// 拦截浏览器返回/移动端边缘返回手势——防止误触退出聊天室（退出即焚、无法重进）。
//
// 原理：进房时压一个占位 history 状态；用户触发返回 → popstate 被占位拦下，
// 页面不真的退，转而触发 onBack 回调（弹确认框）。确认后调用 release() 再真正走。

import { useEffect, useRef } from 'react';

export function useBackGuard(enabled: boolean, onBack: () => void): { release: () => void } {
  const releasingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    // 压占位状态：用户返回时先弹回这里，而不是离开页面。
    history.pushState({ thawGuard: true }, '');

    const onPop = () => {
      if (releasingRef.current) return; // 正在真正退出，放行
      // 用户按了返回/边缘手势 → 被占位拦下。再压一层占位维持拦截，弹确认。
      history.pushState({ thawGuard: true }, '');
      onBack();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled, onBack]);

  // 真正退出：标记放行，弹掉占位（触发真实返回）。
  const release = () => {
    releasingRef.current = true;
    history.back();
  };

  return { release };
}
