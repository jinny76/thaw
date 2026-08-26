import { describe, it, expect } from 'vitest';
import { computeMediaTtl, MEDIA_TTL_BUFFER_SECONDS } from './duration.js';

describe('computeMediaTtl', () => {
  it('视频 TTL = 时长 + 30s 缓冲', () => {
    expect(computeMediaTtl('video', 12, 30)).toBe(12 + MEDIA_TTL_BUFFER_SECONDS);
    expect(computeMediaTtl('video', 120.4, 30)).toBe(121 + 30); // 向上取整
  });

  it('音频同理', () => {
    expect(computeMediaTtl('audio', 5, 30)).toBe(5 + 30);
  });

  it('读不出时长 → 回退默认 TTL', () => {
    expect(computeMediaTtl('video', null, 30)).toBe(30);
  });

  it('图片/文件 → 用默认 TTL（不按时长）', () => {
    expect(computeMediaTtl('image', 999, 30)).toBe(30);
    expect(computeMediaTtl('file', 999, 30)).toBe(30);
  });
});
