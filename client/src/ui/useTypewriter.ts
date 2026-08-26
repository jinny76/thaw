// 打字机效果：逐字符输出一行文本。

import { useEffect, useState } from 'react';

export function useTypewriter(text: string, speedMs = 28): string {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown('');
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, speedMs);
    return () => clearInterval(iv);
  }, [text, speedMs]);
  return shown;
}
