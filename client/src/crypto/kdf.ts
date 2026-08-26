// 口令派生（KDF）—— 用于口令认证的 authKey，不直接当加密密钥。
//
// 主 KDF：Argon2id（hash-wasm 提供的预编译 WASM，内存硬、抗 GPU/ASIC 爆破）。
// 回退：若 WASM 不可用（极老浏览器/加载失败），退化为 Web Crypto 原生 PBKDF2。
// salt = SHA-256("thaw:v1:"+roomId)，双方可独立算出。
// 接口 deriveAuthKey(passphrase, roomId) 不变——加密链路其余部分零改动。

import { argon2id } from 'hash-wasm';
import {
  KDF_ITERATIONS,
  ARGON2_MEMORY_KIB,
  ARGON2_ITERATIONS,
  ARGON2_PARALLELISM,
} from '@thaw/shared';
import { utf8ToBytes, toBuffer } from './encoding.js';

async function saltForRoom(roomId: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', toBuffer(utf8ToBytes(`thaw:v1:${roomId}`)));
  return new Uint8Array(digest);
}

/** Argon2id 派生（主路径）。 */
async function deriveArgon2(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const hash = await argon2id({
    password: passphrase,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: 32,
    outputType: 'binary',
  });
  return hash;
}

/** PBKDF2 派生（回退路径，Web Crypto 原生）。 */
async function derivePbkdf2(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(utf8ToBytes(passphrase)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toBuffer(salt), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

/** 当前会话实际用的 KDF 算法（供 UI 提示 / 调试）。 */
export type KdfAlgo = 'argon2id' | 'pbkdf2';
let lastAlgo: KdfAlgo = 'argon2id';
export function lastKdfAlgo(): KdfAlgo {
  return lastAlgo;
}

/**
 * 从口令 + 房间号派生 32 字节 authKey（用于 HMAC 认证串）。
 * 相同 (口令, roomId) → 相同 authKey；任一不同 → 不同。
 * 双方必须用同一算法，否则派生结果不同、握手会失败——故只在 Argon2 抛错时
 * 才回退 PBKDF2，且这属于极端兼容情形。
 */
export async function deriveAuthKey(passphrase: string, roomId: string): Promise<Uint8Array> {
  const salt = await saltForRoom(roomId);
  try {
    const key = await deriveArgon2(passphrase, salt);
    lastAlgo = 'argon2id';
    return key;
  } catch {
    // WASM 加载/执行失败 → 回退 PBKDF2（保证功能可用）。
    const key = await derivePbkdf2(passphrase, salt);
    lastAlgo = 'pbkdf2';
    return key;
  }
}
