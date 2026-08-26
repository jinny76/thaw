// 进房过场：DECRYPTING… → ACCESS GRANTED 的短动画（约 1.1s）。

import { useEffect, useState } from 'react';

export function AccessGranted({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'decrypting' | 'granted'>('decrypting');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('granted'), 650);
    const t2 = setTimeout(onDone, 1150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div className="access" role="status" aria-live="polite">
      <div className="crt" aria-hidden="true" />
      {phase === 'decrypting' ? (
        <pre className="access__line access__line--dec">
          {'> DECRYPTING'}
          <span className="access__dots" />
        </pre>
      ) : (
        <pre className="access__line access__line--ok">{'> ACCESS GRANTED'}</pre>
      )}
    </div>
  );
}
