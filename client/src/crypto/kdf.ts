// 口令派生（KDF）—— 用于口令认证的 authKey，不直接当加密密钥。
//
// M3：PBKDF2-HMAC-SHA256（Web Crypto 原生），salt = SHA-256("thaw:v1:"+roomId)。
// M3.5：可把此模块换成 Rust→WASM 的 Argon2id，接口不变。

import { KDF_ITERATIONS } from '@thaw/shared';
import { utf8ToBytes, toBuffer } from './encoding.js';

async function saltForRoom(roomId: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', toBuffer(utf8ToBytes(`thaw:v1:${roomId}`)));
  return new Uint8Array(digest);
}

/**
 * 从口令 + 房间号派生 32 字节 authKey（用于 HMAC 认证串）。
 * 相同 (口令, roomId) → 相同 authKey；任一不同 → 不同。
 */
export async function deriveAuthKey(passphrase: string, roomId: string): Promise<Uint8Array> {
  const salt = await saltForRoom(roomId);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(utf8ToBytes(passphrase)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}
