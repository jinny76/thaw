// AES-256-GCM 认证加密。
//
// nonce：12 字节，前 4 字节随机前缀（每密钥一次）+ 后 8 字节递增计数器，
// 避免同密钥下 nonce 碰撞。AAD 绑定 roomId + 消息类型 + msgId，防重放/串扰/
// 跨房间重用。

import { bytesToBase64, base64ToBytes, utf8ToBytes, concatBytes, toBuffer } from './encoding.js';

export interface AeadPayload {
  nonce: string; // base64（12 字节）
  ciphertext: string; // base64
}

/** 递增计数器 nonce 生成器。每个会话密钥应配一个实例。 */
export class NonceCounter {
  private readonly prefix: Uint8Array;
  private counter = 0n;

  constructor(prefix?: Uint8Array) {
    if (prefix && prefix.length === 4) {
      this.prefix = prefix;
    } else {
      this.prefix = crypto.getRandomValues(new Uint8Array(4));
    }
  }

  next(): Uint8Array {
    const nonce = new Uint8Array(12);
    nonce.set(this.prefix, 0);
    const view = new DataView(nonce.buffer);
    view.setBigUint64(4, this.counter, false);
    this.counter += 1n;
    return nonce;
  }
}

function aadBytes(aad: string): Uint8Array {
  return utf8ToBytes(aad);
}

/** 用给定 nonce 加密明文。 */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  nonce: Uint8Array,
  aad: string,
): Promise<AeadPayload> {
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(nonce), additionalData: toBuffer(aadBytes(aad)) },
    key,
    toBuffer(plaintext),
  );
  return { nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(new Uint8Array(ct)) };
}

/** 加密字符串（便捷封装）。 */
export async function encryptString(
  key: CryptoKey,
  text: string,
  nonce: Uint8Array,
  aad: string,
): Promise<AeadPayload> {
  return encrypt(key, utf8ToBytes(text), nonce, aad);
}

/** 解密。tag/AAD 校验失败会抛错。 */
export async function decrypt(
  key: CryptoKey,
  payload: AeadPayload,
  aad: string,
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.nonce), additionalData: toBuffer(aadBytes(aad)) },
    key,
    base64ToBytes(payload.ciphertext),
  );
  return new Uint8Array(pt);
}

/** 解密为字符串。 */
export async function decryptString(
  key: CryptoKey,
  payload: AeadPayload,
  aad: string,
): Promise<string> {
  const bytes = await decrypt(key, payload, aad);
  return new TextDecoder().decode(bytes);
}

/** 供测试/工具：拼接 AAD 各部分。 */
export function buildAad(roomId: string, msgType: string, msgId: string): string {
  return `${roomId}|${msgType}|${msgId}`;
}

export { concatBytes };
