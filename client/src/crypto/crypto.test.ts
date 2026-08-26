import { describe, it, expect } from 'vitest';
import { deriveAuthKey } from './kdf.js';
import {
  generateEcdhKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedBits,
} from './ecdh.js';
import { deriveSessionKey } from './hkdf.js';
import {
  encryptString,
  decryptString,
  decrypt,
  NonceCounter,
  buildAad,
  type AeadPayload,
} from './aead.js';
import { computeAuthTag, verifyAuthTag, constantTimeEqual } from './auth.js';
import { bytesToBase64, base64ToBytes } from './encoding.js';

// ── KDF ─────────────────────────────────────────────
describe('KDF (deriveAuthKey)', () => {
  it('same passphrase + roomId → same authKey', async () => {
    const a = await deriveAuthKey('correct horse battery staple', '123456789');
    const b = await deriveAuthKey('correct horse battery staple', '123456789');
    expect(bytesToBase64(a)).toBe(bytesToBase64(b));
    expect(a.length).toBe(32);
  });

  it('different passphrase → different authKey', async () => {
    const a = await deriveAuthKey('passphrase-one', '123456789');
    const b = await deriveAuthKey('passphrase-two', '123456789');
    expect(bytesToBase64(a)).not.toBe(bytesToBase64(b));
  });

  it('different roomId (salt) → different authKey', async () => {
    const a = await deriveAuthKey('same-pass', '123456789');
    const b = await deriveAuthKey('same-pass', '987654321');
    expect(bytesToBase64(a)).not.toBe(bytesToBase64(b));
  });
});

// ── ECDH + HKDF ─────────────────────────────────────
describe('ECDH + HKDF session key', () => {
  it('two peers derive the same session key', async () => {
    const alice = await generateEcdhKeyPair();
    const bob = await generateEcdhKeyPair();
    const alicePub = await exportPublicKey(alice.publicKey);
    const bobPub = await exportPublicKey(bob.publicKey);

    const aliceShared = await deriveSharedBits(
      alice.privateKey,
      await importPublicKey(bobPub),
    );
    const bobShared = await deriveSharedBits(bob.privateKey, await importPublicKey(alicePub));
    expect(bytesToBase64(aliceShared)).toBe(bytesToBase64(bobShared));

    // 派生的 AES 密钥能互通（用一端加密另一端解密）
    const aliceKey = await deriveSessionKey(aliceShared, '123456789');
    const bobKey = await deriveSessionKey(bobShared, '123456789');
    const nc = new NonceCounter();
    const aad = buildAad('123456789', 'msg', 'm1');
    const payload = await encryptString(aliceKey, 'hello bob', nc.next(), aad);
    expect(await decryptString(bobKey, payload, aad)).toBe('hello bob');
  });

  it('different roomId in HKDF → non-interoperable keys', async () => {
    const alice = await generateEcdhKeyPair();
    const bob = await generateEcdhKeyPair();
    const shared = await deriveSharedBits(alice.privateKey, bob.publicKey);
    const keyRoomA = await deriveSessionKey(shared, '111111111');
    const keyRoomB = await deriveSessionKey(shared, '222222222');
    const nc = new NonceCounter();
    const aad = buildAad('111111111', 'msg', 'm1');
    const payload = await encryptString(keyRoomA, 'x', nc.next(), aad);
    await expect(decryptString(keyRoomB, payload, aad)).rejects.toBeDefined();
  });
});

// ── AEAD ────────────────────────────────────────────
describe('AES-256-GCM AEAD', () => {
  async function freshKey(): Promise<CryptoKey> {
    const a = await generateEcdhKeyPair();
    const b = await generateEcdhKeyPair();
    const shared = await deriveSharedBits(a.privateKey, b.publicKey);
    return deriveSessionKey(shared, 'room');
  }

  it('encrypts then decrypts back to the original text', async () => {
    const key = await freshKey();
    const nc = new NonceCounter();
    const aad = buildAad('room', 'msg', 'm1');
    const payload = await encryptString(key, '你好，世界 🌨', nc.next(), aad);
    expect(await decryptString(key, payload, aad)).toBe('你好，世界 🌨');
  });

  it('tampered ciphertext fails to decrypt', async () => {
    const key = await freshKey();
    const nc = new NonceCounter();
    const aad = buildAad('room', 'msg', 'm1');
    const payload = await encryptString(key, 'secret', nc.next(), aad);
    // 翻转密文一个字节
    const bytes = base64ToBytes(payload.ciphertext);
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;
    const tampered: AeadPayload = { nonce: payload.nonce, ciphertext: bytesToBase64(bytes) };
    await expect(decrypt(key, tampered, aad)).rejects.toBeDefined();
  });

  it('wrong AAD (roomId/msgId mismatch) fails to decrypt', async () => {
    const key = await freshKey();
    const nc = new NonceCounter();
    const payload = await encryptString(
      key,
      'secret',
      nc.next(),
      buildAad('room', 'msg', 'm1'),
    );
    await expect(decrypt(key, payload, buildAad('room', 'msg', 'DIFFERENT'))).rejects.toBeDefined();
  });

  it('NonceCounter produces unique, incrementing nonces', () => {
    const nc = new NonceCounter(new Uint8Array([1, 2, 3, 4]));
    const n1 = nc.next();
    const n2 = nc.next();
    expect(bytesToBase64(n1)).not.toBe(bytesToBase64(n2));
    expect(n1.length).toBe(12);
    // 计数器在第 5..12 字节递增
    expect(n2[11]!).toBe(1);
    expect(n1[11]!).toBe(0);
  });
});

// ── Auth (SAS / MITM 检测) ──────────────────────────
describe('口令认证 tag（防 MITM）', () => {
  it('correct passphrase → tag verifies', async () => {
    const authKey = await deriveAuthKey('shared-pass', '123456789');
    const aPub = bytesToBase64(new Uint8Array([1, 2, 3]));
    const bPub = bytesToBase64(new Uint8Array([4, 5, 6]));
    const tag = await computeAuthTag(authKey, aPub, bPub, '123456789');
    expect(await verifyAuthTag(authKey, aPub, bPub, '123456789', tag)).toBe(true);
  });

  it('wrong passphrase → tag does not verify', async () => {
    const good = await deriveAuthKey('shared-pass', '123456789');
    const bad = await deriveAuthKey('WRONG-pass', '123456789');
    const aPub = bytesToBase64(new Uint8Array([1, 2, 3]));
    const bPub = bytesToBase64(new Uint8Array([4, 5, 6]));
    const tag = await computeAuthTag(good, aPub, bPub, '123456789');
    expect(await verifyAuthTag(bad, aPub, bPub, '123456789', tag)).toBe(false);
  });

  it('swapped public key (MITM) → tag does not verify', async () => {
    const authKey = await deriveAuthKey('shared-pass', '123456789');
    const aPub = bytesToBase64(new Uint8Array([1, 2, 3]));
    const bPub = bytesToBase64(new Uint8Array([4, 5, 6]));
    const attackerPub = bytesToBase64(new Uint8Array([9, 9, 9]));
    const tag = await computeAuthTag(authKey, aPub, bPub, '123456789');
    // 服务器把 bPub 掉包成 attackerPub → 校验失败
    expect(await verifyAuthTag(authKey, aPub, attackerPub, '123456789', tag)).toBe(false);
  });

  it('constantTimeEqual: equal vs unequal vs length-mismatch', () => {
    const x = bytesToBase64(new Uint8Array([1, 2, 3, 4]));
    const y = bytesToBase64(new Uint8Array([1, 2, 3, 4]));
    const z = bytesToBase64(new Uint8Array([1, 2, 3, 5]));
    const shorter = bytesToBase64(new Uint8Array([1, 2, 3]));
    expect(constantTimeEqual(x, y)).toBe(true);
    expect(constantTimeEqual(x, z)).toBe(false);
    expect(constantTimeEqual(x, shorter)).toBe(false);
  });
});
