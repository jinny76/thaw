import { describe, it, expect } from 'vitest';
import { pad, unpad, bucketFor, PAD_BUCKETS } from './padding.js';
import { utf8ToBytes, bytesToUtf8 } from './encoding.js';

describe('padding 定长填充', () => {
  it('bucketFor 选最小容纳桶（含 +1 分隔符）', () => {
    expect(bucketFor(0)).toBe(64);
    expect(bucketFor(63)).toBe(64); // 63+1=64 ⤳ 64
    expect(bucketFor(64)).toBe(256); // 64+1=65 > 64 ⤳ 256
    expect(bucketFor(255)).toBe(256);
    expect(bucketFor(1000)).toBe(1024);
    expect(bucketFor(4095)).toBe(4096);
  });

  it('超最大档按 4096 整数倍向上取整', () => {
    expect(bucketFor(4096)).toBe(8192); // 4097 ⤳ 8192
    expect(bucketFor(9000)).toBe(12288); // 9001 ⤳ 3×4096
  });

  it('pad 后长度是桶大小；unpad 精确还原', () => {
    for (const text of ['', '好', 'hello world', '一段中等长度的中文消息内容测试']) {
      const padded = pad(utf8ToBytes(text));
      expect(PAD_BUCKETS.includes(padded.length as (typeof PAD_BUCKETS)[number]) || padded.length % 4096 === 0).toBe(
        true,
      );
      expect(bytesToUtf8(unpad(padded))).toBe(text);
    }
  });

  it('不同短消息填充后长度相同（抗元数据核心）', () => {
    // "好" 和 "hi" 都很短 → 同一个桶 → 密文长度无法区分
    expect(pad(utf8ToBytes('好')).length).toBe(pad(utf8ToBytes('hi')).length);
    expect(pad(utf8ToBytes('好')).length).toBe(64);
  });

  it('损坏的填充（无分隔符）抛错', () => {
    const bad = new Uint8Array(64); // 全 0，无 0x80
    expect(() => unpad(bad)).toThrow();
  });

  it('含 0x00 的明文也能正确还原（分隔符从尾部找）', () => {
    const withNull = new Uint8Array([1, 2, 0, 3, 0, 0, 4]);
    const padded = pad(withNull);
    expect(Array.from(unpad(padded))).toEqual(Array.from(withNull));
  });
});
