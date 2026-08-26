// 口令认证串（SAS）—— 防 MITM。
//
// tag = HMAC-SHA256(authKey, aPub ‖ bPub ‖ roomId)。双方交换并常数时间比对。
// 服务器掉包任一方公钥 → 两端看到的 aPub‖bPub 不一致 → HMAC 对不上 → 握手失败。

import { bytesToBase64, base64ToBytes, utf8ToBytes, concatBytes, toBuffer } from './encoding.js';

/**
 * 计算认证 tag。aPub/bPub 为双方公钥的 base64（顺序固定：发起方在前）。
 * 返回 base64 tag。
 */
export async function computeAuthTag(
  authKey: Uint8Array,
  aPubB64: string,
  bPubB64: string,
  roomId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    toBuffer(authKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const msg = concatBytes(
    base64ToBytes(aPubB64),
    base64ToBytes(bPubB64),
    utf8ToBytes(roomId),
  );
  const sig = await crypto.subtle.sign('HMAC', key, msg);
  return bytesToBase64(new Uint8Array(sig));
}

/**
 * 常数时间比对两个 base64 串（等长逐字节 XOR 累加）。
 * 长度不同直接判否（长度本身非秘密）。
 */
export function constantTimeEqual(aB64: string, bB64: string): boolean {
  const a = base64ToBytes(aB64);
  const b = base64ToBytes(bB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/**
 * 校验对端 tag 是否与本地计算一致（常数时间）。
 */
export async function verifyAuthTag(
  authKey: Uint8Array,
  aPubB64: string,
  bPubB64: string,
  roomId: string,
  peerTagB64: string,
): Promise<boolean> {
  const expected = await computeAuthTag(authKey, aPubB64, bPubB64, roomId);
  return constantTimeEqual(expected, peerTagB64);
}
