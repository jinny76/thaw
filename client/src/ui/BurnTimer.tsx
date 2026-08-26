// 每条消息的焚毁倒计时燃尽条。显示剩余存活时间，到期触发 onExpire。
// 计时基准用本地时间，不依赖服务器时钟。
//
// 起算时刻 startAt：文字=createdAt，富媒体=收/发完成时刻(readyAt)。传输中传 null
// → 不倒计时（大文件没传完不会被烧）。
// 方向 mine：己方消息(右侧)燃尽条从左烧到右；对方(左侧)从右烧到左。

import { useEffect, useState } from 'react';

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function BurnTimer({
  startAt,
  ttl,
  mine,
  onExpire,
}: {
  startAt: number | null;
  ttl: number;
  mine: boolean;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState<number>(() =>
    startAt === null ? ttl * 1000 : startAt + ttl * 1000 - Date.now(),
  );

  useEffect(() => {
    if (startAt === null) {
      // 传输中：不倒计时，显示满条。
      setLeft(ttl * 1000);
      return;
    }
    const tick = () => {
      const r = startAt + ttl * 1000 - Date.now();
      setLeft(r);
      if (r <= 0) onExpire();
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startAt, ttl, onExpire]);

  const total = ttl * 1000;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));

  return (
    <span
      className={`burn${mine ? ' burn--mine' : ''}`}
      title="剩余存活时间"
      aria-label={`剩余 ${fmt(left)}`}
    >
      <span className="burn__bar" style={{ width: `${pct}%` }} />
      <span className="burn__label">{fmt(left)}</span>
    </span>
  );
}
