// 读取视频/音频时长（秒）。用于动态 TTL：视频/音频消息存活 = 时长 + 默认 TTL。
// 读不出时长（编码不支持等）则返回 null，回退默认 TTL。

/** 从 ObjectURL 读取时长（秒）。失败返回 null。 */
export function readMediaDuration(url: string, kind: 'video' | 'audio'): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      el.src = '';
      resolve(v);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    el.onerror = () => finish(null);
    // 超时兜底
    setTimeout(() => finish(null), 4000);
    el.src = url;
  });
}

/**
 * 计算富媒体消息的 TTL（秒）。
 * 视频/音频：时长 + 默认 TTL（保证播放期间不倒计时，播完仍留完整设定时长）；
 * 其他类型直接用默认 TTL。这样所有消息的「可用停留时间」与设定一致。
 */
export function computeMediaTtl(
  kind: string,
  durationSec: number | null,
  defaultTtl: number,
): number {
  if ((kind === 'video' || kind === 'audio') && durationSec !== null) {
    return Math.ceil(durationSec) + defaultTtl;
  }
  return defaultTtl;
}
