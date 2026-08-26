// 安全随机生成 —— 一律 crypto.getRandomValues，禁用 Math.random。
// 完整 crypto 模块（KDF/ECDH/AEAD）在 phase 5 落地；这两个生成器在 phase 3 即需。

import { ROOM_ID_LENGTH, PASSPHRASE_MIN_LENGTH } from '@thaw/shared';
import { ZH_WORDS } from './wordlist-zh.js';

/** 从数组无偏随机取一个元素（拒绝采样消除 mod 偏置）。 */
function pickUnbiased<T>(arr: readonly T[]): T {
  const n = arr.length;
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return arr[buf[0]! % n]!;
  }
}

/** 生成 9 位随机数字房间号（无前导偏置，拒绝采样）。 */
export function generateRoomId(): string {
  let out = '';
  const buf = new Uint8Array(1);
  while (out.length < ROOM_ID_LENGTH) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    // 拒绝 250..255 以消除 mod 10 偏置
    if (v < 250) out += String(v % 10);
  }
  return out;
}

// 高熵口令字符集（去除易混淆字符 0/O/1/l/I）。
const PASS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** 生成高熵口令，默认 ≥20 字符。 */
export function generatePassphrase(length = PASSPHRASE_MIN_LENGTH): string {
  const n = Math.max(PASSPHRASE_MIN_LENGTH, length);
  const out: string[] = [];
  const buf = new Uint8Array(1);
  const limit = 256 - (256 % PASS_ALPHABET.length);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) out.push(PASS_ALPHABET[v % PASS_ALPHABET.length]!);
  }
  return out.join('');
}

/** 生成随机 id（消息 id / token 占位），hex 字符串。 */
export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 生成 n 位随机数字串（用于默认昵称等）。 */
export function randomDigits(n: number): string {
  let out = '';
  const buf = new Uint8Array(1);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    if (buf[0]! < 250) out += String(buf[0]! % 10);
  }
  return out;
}

/** 默认昵称：神秘人 + 6 位随机数字。 */
export function defaultNickname(): string {
  return `神秘人${randomDigits(6)}`;
}

/** 生成中文房间号：3 个随机中文词拼接（如「青山流云寒江」）。可读、易念。 */
export function generateRoomIdZh(words = 3): string {
  let out = '';
  for (let i = 0; i < words; i++) out += pickUnbiased(ZH_WORDS);
  return out;
}

/**
 * 生成中文口令：默认 5 个随机中文词直接拼接（如「青山流云寒江孤舟残雪」）。
 * 纯汉字无分隔符——好输入、不会因符号打错。5 词 ≈ 40 bit 熵，配 Argon2id
 * 抗爆破足够；中文好记、好带外传递。
 */
export function generatePassphraseZh(words = 5): string {
  let out = '';
  for (let i = 0; i < words; i++) out += pickUnbiased(ZH_WORDS);
  return out;
}
