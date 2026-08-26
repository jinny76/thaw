// 读取视频/音频时长（秒）。用于动态 TTL：视频消息存活 = 时长 + 缓冲。
// 读不出时长（编码不支持等）则返回 null，回退默认 TTL。

/** 视频/音频消息的额外缓冲秒数（看完之后再留这么久）。 */
export const MEDIA_TTL_BUFFER_SECONDS = 30;

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
 * 视频/音频：时长 + 缓冲（保证能看完再留 30s）；否则用默认 TTL。
 */
export function computeMediaTtl(
  kind: string,
  durationSec: number | null,
  defaultTtl: number,
): number {
  if ((kind === 'video' || kind === 'audio') && durationSec !== null) {
    return Math.ceil(durationSec) + MEDIA_TTL_BUFFER_SECONDS;
  }
  return defaultTtl;
}
