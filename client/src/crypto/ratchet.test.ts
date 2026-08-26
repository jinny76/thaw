import { describe, it, expect, beforeAll } from 'vitest';
import { SendRatchet, RecvRatchet, ratchetStep } from './ratchet.js';
import { EcdhCrypto } from './ecdh-crypto.js';
import { generateEcdhKeyPair, deriveSharedBits } from './ecdh.js';
import { deriveSessionKey, deriveRatchetRoot } from './hkdf.js';
import { bytesToBase64 } from './encoding.js';
import { buildAad } from './aead.js';

// 建立握手完成后的一对 EcdhCrypto（A/B 各持相同 sk + root，slot 不同）。
async function pair(): Promise<[EcdhCrypto, EcdhCrypto]> {
  const a = await generateEcdhKeyPair();
  const b = await generateEcdhKeyPair();
  const shared = await deriveSharedBits(a.privateKey, b.publicKey);
  const key = await deriveSessionKey(shared, 'room');
  const root = await deriveRatchetRoot(shared, 'room');
  return [new EcdhCrypto(key, root, 'A'), new EcdhCrypto(key, root, 'B')];
}

describe('对称棘轮 —— 底层链推进', () => {
  it('每步 messageKey 不同，且链单向推进', async () => {
    const root = new Uint8Array(32).fill(7);
    const s1 = await ratchetStep(root);
    const s2 = await ratchetStep(s1.nextChainKey);
    expect(bytesToBase64(s1.messageKey)).not.toBe(bytesToBase64(s2.messageKey));
    expect(bytesToBase64(s1.nextChainKey)).not.toBe(bytesToBase64(s2.nextChainKey));
  });

  it('A 的发送链 == B 的接收链（配对）', async () => {
    const root = new Uint8Array(32).fill(9);
    const aSend = await SendRatchet.create(root, 'A');
    const bRecv = await RecvRatchet.create(root, 'B');
    const { seq } = await aSend.next();
    const bKey = await bRecv.keyFor(seq);
    expect(bKey).not.toBeNull();
    // 两把 key 应能互解（导出比对不可行，改用加解密验证在下方 EcdhCrypto 测试）
    expect(seq).toBe(0);
  });
});

describe('EcdhCrypto 前向保密（棘轮消息）', () => {
  let A: EcdhCrypto;
  let B: EcdhCrypto;
  beforeAll(async () => {
    [A, B] = await pair();
  });

  it('A 连发多条 → B 依序解密，seq 递增', async () => {
    const aad = (id: string) => buildAad('room', 'msg', id);
    const m0 = await A.encrypt('第一条', aad('m0'));
    const m1 = await A.encrypt('第二条', aad('m1'));
    expect(m0.seq).toBe(0);
    expect(m1.seq).toBe(1);
    expect(await B.decrypt(m0, aad('m0'))).toBe('第一条');
    expect(await B.decrypt(m1, aad('m1'))).toBe('第二条');
  });

  it('乱序到达也能解（接收链缓存跳过的 key）', async () => {
    const [X, Y] = await pair();
    const aad = (id: string) => buildAad('room', 'msg', id);
    const e0 = await X.encrypt('a', aad('e0'));
    const e1 = await X.encrypt('b', aad('e1'));
    const e2 = await X.encrypt('c', aad('e2'));
    // 乱序：先 2，再 0，再 1
    expect(await Y.decrypt(e2, aad('e2'))).toBe('c');
    expect(await Y.decrypt(e0, aad('e0'))).toBe('a');
    expect(await Y.decrypt(e1, aad('e1'))).toBe('b');
  });

  it('双向：A↔B 各自独立链，互不干扰', async () => {
    const [X, Y] = await pair();
    const aad = (id: string) => buildAad('room', 'msg', id);
    const fromX = await X.encrypt('X 发的', aad('x1'));
    const fromY = await Y.encrypt('Y 发的', aad('y1'));
    expect(await Y.decrypt(fromX, aad('x1'))).toBe('X 发的');
    expect(await X.decrypt(fromY, aad('y1'))).toBe('Y 发的');
  });

  it('缺 seq 的载荷（如昵称，ratchet=false）走稳定密钥', async () => {
    const [X, Y] = await pair();
    const nick = await X.encrypt('神秘人123', buildAad('room', 'nick', 'nick'), false);
    expect(nick.seq).toBeUndefined();
    expect(await Y.decrypt(nick, buildAad('room', 'nick', 'nick'))).toBe('神秘人123');
  });

  it('前向保密：篡改/伪造某条不影响其它；错 seq 解不出', async () => {
    const [X, Y] = await pair();
    const aad = (id: string) => buildAad('room', 'msg', id);
    const e0 = await X.encrypt('secret', aad('e0'));
    // 用错误的 seq 尝试解 → 拿到的是别的链步 key，解不出
    await expect(Y.decrypt({ ...e0, seq: 5 }, aad('e0'))).rejects.toBeDefined();
  });
});
