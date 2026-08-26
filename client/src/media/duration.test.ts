import { describe, it, expect } from 'vitest';
import { computeMediaTtl } from './duration.js';

describe('computeMediaTtl', () => {
  it('视频 TTL = 时长 + 默认 TTL（播放期间不倒计时）', () => {
    expect(computeMediaTtl('video', 12, 300)).toBe(12 + 300);
    expect(computeMediaTtl('video', 120.4, 300)).toBe(121 + 300); // 向上取整
  });

  it('音频同理：时长 + 默认 TTL', () => {
    expect(computeMediaTtl('audio', 5, 300)).toBe(5 + 300);
  });

  it('读不出时长 → 回退默认 TTL', () => {
    expect(computeMediaTtl('video', null, 300)).toBe(300);
  });

  it('图片/文件 → 用默认 TTL（不按时长）', () => {
    expect(computeMediaTtl('image', 999, 300)).toBe(300);
    expect(computeMediaTtl('file', 999, 300)).toBe(300);
  });
});
