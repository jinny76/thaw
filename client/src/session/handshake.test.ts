import { describe, it, expect } from 'vitest';
import { Handshake } from './handshake.js';
import { buildAad } from '../crypto/aead.js';

// 用一对内存信道把 A、B 两个 Handshake 连起来跑完整握手。
interface Wire {
  pub: string[];
  tag: string[];
}

async function runHandshake(passA: string, passB: string, roomId = '123456789') {
  const aWire: Wire = { pub: [], tag: [] };
  const bWire: Wire = { pub: [], tag: [] };

  const a = new Handshake({
    roomId,
    passphrase: passA,
    slot: 'A',
    sendPub: (p) => aWire.pub.push(p),
    sendTag: (t) => aWire.tag.push(t),
  });
  const b = new Handshake({
    roomId,
    passphrase: passB,
    slot: 'B',
    sendPub: (p) => bWire.pub.push(p),
    sendTag: (t) => bWire.tag.push(t),
  });

  await a.start();
  await b.start();
  // 交换公钥
  await a.onPeerPub(bWire.pub[0]!);
  await b.onPeerPub(aWire.pub[0]!);
  // 交换 tag
  await a.onPeerTag(bWire.tag[0]!);
  await b.onPeerTag(aWire.tag[0]!);

  return { a: await a.result(), b: await b.result() };
}

describe('Handshake (ECDH + 口令认证)', () => {
  it('matching passphrase → both succeed and can talk', async () => {
    const { a, b } = await runHandshake('correct-horse-staple', 'correct-horse-staple');
    expect(a.status).toBe('done');
    expect(b.status).toBe('done');
    expect(a.crypto).toBeDefined();
    expect(b.crypto).toBeDefined();

    // A 加密 → B 解密
    const aad = buildAad('123456789', 'msg', 'm1');
    const enc = await a.crypto!.encrypt('E2EE works', aad);
    expect(await b.crypto!.decrypt(enc, aad)).toBe('E2EE works');
    // 双向
    const enc2 = await b.crypto!.encrypt('reply', buildAad('123456789', 'msg', 'm2'));
    expect(await a.crypto!.decrypt(enc2, buildAad('123456789', 'msg', 'm2'))).toBe('reply');

    // 每端有独立 sessionToken
    expect(a.sessionToken).toBeTruthy();
    expect(b.sessionToken).toBeTruthy();
  });

  it('mismatched passphrase → both fail (口令错误)', async () => {
    const { a, b } = await runHandshake('right-pass', 'WRONG-pass');
    expect(a.status).toBe('failed');
    expect(b.status).toBe('failed');
    expect(a.crypto).toBeUndefined();
  });
});

describe('Handshake MITM 检测', () => {
  it('server swapping a public key → auth tag fails, handshake aborts', async () => {
    const roomId = '123456789';
    const pass = 'shared-secret-pass';
    const aWire: string[] = [];
    const bWire: string[] = [];
    const aTag: string[] = [];
    const bTag: string[] = [];

    const a = new Handshake({
      roomId,
      passphrase: pass,
      slot: 'A',
      sendPub: (p) => aWire.push(p),
      sendTag: (t) => aTag.push(t),
    });
    const b = new Handshake({
      roomId,
      passphrase: pass,
      slot: 'B',
      sendPub: (p) => bWire.push(p),
      sendTag: (t) => bTag.push(t),
    });

    // 攻击者(第三方)生成自己的密钥对，把 B 看到的 A 公钥掉包成攻击者的
    const mitm = new Handshake({
      roomId,
      passphrase: 'attacker-doesnt-know',
      slot: 'A',
      sendPub: () => {},
      sendTag: () => {},
    });
    await mitm.start();
    const attackerPub = (mitm as unknown as { myPub: string }).myPub;

    await a.start();
    await b.start();
    // A 收到 B 真实公钥；B 收到「被掉包」的攻击者公钥
    await a.onPeerPub(bWire[0]!);
    await b.onPeerPub(attackerPub);
    await a.onPeerTag(bTag[0]!);
    await b.onPeerTag(aTag[0]!);

    const bOutcome = await b.result();
    // B 的 tag 基于攻击者公钥算出，与 A 期望不符 → 至少一端失败
    const aOutcome = await a.result();
    expect(aOutcome.status === 'failed' || bOutcome.status === 'failed').toBe(true);
  });
});
