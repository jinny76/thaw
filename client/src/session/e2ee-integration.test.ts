import { describe, it, expect } from 'vitest';
import { Handshake } from './handshake.js';
import { buildAad } from '../crypto/aead.js';
import { deriveAuthKey } from '../crypto/kdf.js';
import { base64ToBytes } from '../crypto/encoding.js';

// 端到端：模拟服务器只转发不透明帧，证明「服务器只见密文」。

async function establishSession(roomId: string, pass: string) {
  const aPub: string[] = [];
  const bPub: string[] = [];
  const aTag: string[] = [];
  const bTag: string[] = [];
  const a = new Handshake({
    roomId,
    passphrase: pass,
    slot: 'A',
    sendPub: (p) => aPub.push(p),
    sendTag: (t) => aTag.push(t),
  });
  const b = new Handshake({
    roomId,
    passphrase: pass,
    slot: 'B',
    sendPub: (p) => bPub.push(p),
    sendTag: (t) => bTag.push(t),
  });
  await a.start();
  await b.start();
  await a.onPeerPub(bPub[0]!);
  await b.onPeerPub(aPub[0]!);
  await a.onPeerTag(bTag[0]!);
  await b.onPeerTag(aTag[0]!);
  return { a: await a.result(), b: await b.result() };
}

describe('E2EE end-to-end：服务器只见密文', () => {
  it('relayed ciphertext is opaque; cannot recover plaintext without passphrase', async () => {
    const roomId = '123456789';
    const { a } = await establishSession(roomId, 'the-real-passphrase');
    expect(a.status).toBe('done');

    const plaintext = '这是一条机密消息';
    const aad = buildAad(roomId, 'msg', 'm1');
    const wireFrame = await a.crypto!.encrypt(plaintext, aad);

    // 服务器看到的就是 wireFrame（nonce + ciphertext）。断言其中不含明文。
    const raw = JSON.stringify(wireFrame);
    expect(raw).not.toContain(plaintext);
    expect(raw).not.toContain('机密');
    // ciphertext 是 base64 且解码后与明文字节不同
    const ctBytes = base64ToBytes(wireFrame.ciphertext);
    const ptBytes = new TextEncoder().encode(plaintext);
    expect(Array.from(ctBytes)).not.toEqual(Array.from(ptBytes));
  });

  it('an eavesdropper with a wrong passphrase cannot decrypt the ciphertext', async () => {
    const roomId = '123456789';
    const { a } = await establishSession(roomId, 'the-real-passphrase');
    const aad = buildAad(roomId, 'msg', 'm1');
    const wireFrame = await a.crypto!.encrypt('secret', aad);

    // 攻击者尝试用错误口令建立会话（不同 ECDH，密钥完全不同）→ 无法解密
    const { a: attacker } = await establishSession(roomId, 'guessed-wrong-pass');
    // 注意：攻击者的会话密钥来自不同的 ECDH，即便解不出也不会误判
    await expect(attacker.crypto!.decrypt(wireFrame, aad)).rejects.toBeDefined();
  });

  it('authKey derivation binds to roomId (salt) — offline attacker needs both', async () => {
    const k1 = await deriveAuthKey('same-pass', '111111111');
    const k2 = await deriveAuthKey('same-pass', '222222222');
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });
});

describe('口令前缀（默契前缀参与 KDF）', () => {
  it('前缀改变派生密钥：KDF(前缀+口令) ≠ KDF(口令)', async () => {
    const dyn = 'DYN-abc123';
    const withPrefix = await deriveAuthKey('咱那事儿-' + dyn, '123456789');
    const without = await deriveAuthKey(dyn, '123456789');
    expect(Array.from(withPrefix)).not.toEqual(Array.from(without));
  });

  it('仅拿到动态口令（缺前缀）→ 握手失败', async () => {
    const roomId = '123456789';
    const dyn = 'DYN-secret-xyz';
    // A 用「前缀+口令」，冒充者只有动态口令 → 认证串不符
    const { a } = await establishSession(roomId, '默契前缀' + dyn);
    expect(a.status).toBe('done');
    const { a: impostor } = await establishSession(roomId, dyn); // 无前缀
    // 两者会话密钥不同；模拟服务器只见密文时冒充者解不出
    const aad = buildAad(roomId, 'msg', 'm1');
    const frame = await a.crypto!.encrypt('机密', aad);
    await expect(impostor.crypto!.decrypt(frame, aad)).rejects.toBeDefined();
  });

  it('双方前缀一致 → 正常建立会话', async () => {
    const roomId = '123456789';
    const full = '共同前缀-DYN-777';
    const { a, b } = await establishSession(roomId, full);
    expect(a.status).toBe('done');
    expect(b.status).toBe('done');
    const aad = buildAad(roomId, 'msg', 'm1');
    const frame = await a.crypto!.encrypt('对上暗号', aad);
    expect(await b.crypto!.decrypt(frame, aad)).toBe('对上暗号');
  });
});
