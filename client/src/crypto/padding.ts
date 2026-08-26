// 消息定长填充（抗元数据）——把明文补到固定桶大小再加密，
// 使密文长度只落在几个离散档位，观察者无法从密文大小推断真实消息长短。
//
// 填充格式（ISO/IEC 7816-4 风格，无歧义）：
//   [明文字节...][0x80][0x00 × N]  → 总长 = 某个桶大小
// 解密后从尾部跳过 0x00、遇到第一个 0x80 即明文边界。

/** 桶档位（字节）。超过最大档按其整数倍向上取整。 */
export const PAD_BUCKETS = [64, 256, 1024, 4096] as const;
const MAX_BUCKET = 4096;

/** 选择容纳 (len + 1 字节分隔符) 的最小桶。 */
export function bucketFor(plaintextLen: number): number {
  const need = plaintextLen + 1; // +1 给 0x80 分隔符
  for (const b of PAD_BUCKETS) {
    if (need <= b) return b;
  }
  // 超最大档：按 MAX_BUCKET 的整数倍向上取整。
  return Math.ceil(need / MAX_BUCKET) * MAX_BUCKET;
}

/** 把明文字节填充到桶大小。 */
export function pad(plaintext: Uint8Array): Uint8Array {
  const size = bucketFor(plaintext.length);
  const out = new Uint8Array(size);
  out.set(plaintext, 0);
  out[plaintext.length] = 0x80; // 分隔符
  // 其余已是 0x00（Uint8Array 默认清零）
  return out;
}

/** 从填充数据剥离出原明文。找不到分隔符则抛错（防篡改）。 */
export function unpad(padded: Uint8Array): Uint8Array {
  // 从尾部向前跳过 0x00，第一个非 0x00 必须是 0x80。
  let i = padded.length - 1;
  while (i >= 0 && padded[i] === 0x00) i--;
  if (i < 0 || padded[i] !== 0x80) {
    throw new Error('invalid padding');
  }
  return padded.slice(0, i);
}
