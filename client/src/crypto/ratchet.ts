// 对称棘轮（前向保密）——文字消息每条用独立、不可逆推的密钥。
//
// 从握手会话密钥 sk 派生根，收发各一条链：
//   messageKey_i = HKDF(chainKey_i, "thaw:mk")
//   chainKey_{i+1} = HKDF(chainKey_i, "thaw:ck")   —— 单向推进，旧链不可回推
// 消息带 seq 计数；接收方推进本地链到对应 seq 再解密。
//
// 效果：某条消息密钥泄露只暴露该条——之前的（链已推过、密钥已弃）解不了，
// 之后的（需要后续链态）也推不出。
//
// 说明：这是简化的对称棘轮（双方在线、共享 sk），非完整 Double Ratchet 的
// DH 棘轮。会话内前向保密由链单向推进保证；跨会话前向保密由 ECDH 临时密钥
// + 会话结束丢弃 sk 保证（见 ARCHITECTURE §3.3）。

import { utf8ToBytes, toBuffer } from './encoding.js';

async function hkdfExpand(chainKey: Uint8Array, label: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', toBuffer(chainKey), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: utf8ToBytes(label),
    },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * 从棘轮根字节导出某条方向链的初始链密钥。
 * 方向用固定标签 'a2b' / 'b2a'，双方对同一方向算出相同链——
 * A 的发送链(a2b) == B 的接收链(a2b)，配对成功。
 */
export async function initialChainKey(
  root: Uint8Array,
  dirLabel: 'a2b' | 'b2a',
): Promise<Uint8Array> {
  return hkdfExpand(root, `thaw:chain-init:${dirLabel}`);
}

/** 单向推进一条链：返回 { messageKey, nextChainKey }。 */
export async function ratchetStep(
  chainKey: Uint8Array,
): Promise<{ messageKey: Uint8Array; nextChainKey: Uint8Array }> {
  const messageKey = await hkdfExpand(chainKey, 'thaw:mk');
  const nextChainKey = await hkdfExpand(chainKey, 'thaw:ck');
  return { messageKey, nextChainKey };
}

/** 把 32 字节 messageKey 导入为 AES-256-GCM CryptoKey。 */
export async function importMessageKey(mk: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBuffer(mk), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * 发送链：每调用一次 next() 推进一步，返回该条消息的 (seq, key)。
 */
export class SendRatchet {
  private chainKey: Uint8Array;
  private seq = 0;
  private constructor(chainKey: Uint8Array) {
    this.chainKey = chainKey;
  }
  /** slot=A 的发送链是 a2b；slot=B 的发送链是 b2a。 */
  static async create(root: Uint8Array, slot: 'A' | 'B'): Promise<SendRatchet> {
    return new SendRatchet(await initialChainKey(root, slot === 'A' ? 'a2b' : 'b2a'));
  }
  async next(): Promise<{ seq: number; key: CryptoKey }> {
    const { messageKey, nextChainKey } = await ratchetStep(this.chainKey);
    // 弃旧链态（前向保密：旧 chainKey 覆盖，无法回推）。
    this.chainKey = nextChainKey;
    const key = await importMessageKey(messageKey);
    return { seq: this.seq++, key };
  }
}

/**
 * 接收链：按消息 seq 推进本地链到对应位置，取出该条 messageKey。
 * 支持乱序/跳号（推进并缓存跳过的 messageKey，供迟到消息使用）。
 */
export class RecvRatchet {
  private chainKey: Uint8Array;
  private nextSeq = 0;
  /** 已推进但尚未用到的 messageKey（seq → key raw），供乱序到达。 */
  private skipped = new Map<number, Uint8Array>();
  /** 跳号上限，防恶意巨大 seq 触发大量派生（DoS）。 */
  private static readonly MAX_SKIP = 256;

  private constructor(chainKey: Uint8Array) {
    this.chainKey = chainKey;
  }
  /** slot=A 的接收链是 b2a（收 B 发来的）；slot=B 的接收链是 a2b。 */
  static async create(root: Uint8Array, slot: 'A' | 'B'): Promise<RecvRatchet> {
    return new RecvRatchet(await initialChainKey(root, slot === 'A' ? 'b2a' : 'a2b'));
  }

  /** 取出第 seq 条的 messageKey；按需推进链、缓存跳过的。失败返回 null。 */
  async keyFor(seq: number): Promise<CryptoKey | null> {
    if (seq < this.nextSeq) {
      // 迟到消息：从缓存取。
      const mk = this.skipped.get(seq);
      if (!mk) return null;
      this.skipped.delete(seq);
      return importMessageKey(mk);
    }
    if (seq - this.nextSeq > RecvRatchet.MAX_SKIP) return null; // 跳太多，拒绝
    // 推进到 seq，缓存中间跳过的。
    while (this.nextSeq <= seq) {
      const { messageKey, nextChainKey } = await ratchetStep(this.chainKey);
      this.chainKey = nextChainKey;
      if (this.nextSeq === seq) {
        this.nextSeq++;
        return importMessageKey(messageKey);
      }
      this.skipped.set(this.nextSeq, messageKey);
      this.nextSeq++;
    }
    return null;
  }
}
