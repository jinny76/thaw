// HKDF —— 从 ECDH 共享密钥派生 AES-256-GCM 会话密钥 + 棘轮根。

import { utf8ToBytes, toBuffer } from './encoding.js';

/**
 * 从共享密钥比特派生会话密钥（AES-256-GCM CryptoKey，非可导出）。
 * info 绑定 roomId，确保跨房间密钥隔离。富媒体分块用它。
 */
export async function deriveSessionKey(
  sharedBits: Uint8Array,
  roomId: string,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', toBuffer(sharedBits), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8ToBytes(`thaw:hkdf:${roomId}`),
      info: utf8ToBytes('thaw:session-key:v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 派生棘轮根字节（32B，与会话密钥用不同 info 隔离）。
 * 文字消息棘轮从这里起步——独立于非可导出的 AES 会话密钥。
 */
export async function deriveRatchetRoot(
  sharedBits: Uint8Array,
  roomId: string,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', toBuffer(sharedBits), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8ToBytes(`thaw:hkdf:${roomId}`),
      info: utf8ToBytes('thaw:ratchet-root:v1'),
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}
