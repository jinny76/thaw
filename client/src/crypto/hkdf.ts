// HKDF —— 从 ECDH 共享密钥派生 AES-256-GCM 会话密钥。

import { utf8ToBytes, toBuffer } from './encoding.js';

/**
 * 从共享密钥比特派生会话密钥（AES-256-GCM CryptoKey）。
 * info 绑定 roomId，确保跨房间密钥隔离。
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
