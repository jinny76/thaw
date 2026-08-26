import { describe, it, expect, beforeAll } from 'vitest';
import {
  splitChunks,
  encryptMeta,
  decryptMeta,
  encryptChunk,
  MediaReassembler,
  type MediaMetaPlain,
} from './chunker.js';
import { EcdhCrypto } from '../crypto/ecdh-crypto.js';
import { generateEcdhKeyPair, deriveSharedBits } from '../crypto/ecdh.js';
import { deriveSessionKey } from '../crypto/hkdf.js';

// 建立一对共享同一会话密钥的 EcdhCrypto（模拟握手完成后的双方）。
async function sharedCryptoPair(): Promise<[EcdhCrypto, EcdhCrypto]> {
  const a = await generateEcdhKeyPair();
  const b = await generateEcdhKeyPair();
  const shared = await deriveSharedBits(a.privateKey, b.publicKey);
  const key = await deriveSessionKey(shared, 'room');
  // 同一 key 两个实例（各自独立 nonce 计数器；解密不依赖计数器）
  return [new EcdhCrypto(key), new EcdhCrypto(key)];
}

let sender: EcdhCrypto;
let receiver: EcdhCrypto;

beforeAll(async () => {
  [sender, receiver] = await sharedCryptoPair();
});

describe('splitChunks', () => {
  it('splits into ceil(size/chunkSize) chunks', () => {
    const bytes = new Uint8Array(200);
    expect(splitChunks(bytes, 64).length).toBe(4); // 64,64,64,8
  });
  it('empty input yields one empty chunk', () => {
    expect(splitChunks(new Uint8Array(0)).length).toBe(1);
  });
});

describe('media meta + chunk round-trip', () => {
  it('encrypts and decrypts meta', async () => {
    const meta: MediaMetaPlain = {
      name: 'photo.png',
      mime: 'image/png',
      size: 1234,
      totalChunks: 3,
      kind: 'image',
    };
    const enc = await encryptMeta(sender, 'mid1', meta);
    const dec = await decryptMeta(receiver, 'mid1', enc);
    expect(dec).toEqual(meta);
  });

  it('reassembles a file byte-for-byte', async () => {
    // 造一个跨多块的文件
    const original = new Uint8Array(200_000);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7) % 256;
    const chunks = splitChunks(original);
    const meta: MediaMetaPlain = {
      name: 'blob.bin',
      mime: 'application/octet-stream',
      size: original.length,
      totalChunks: chunks.length,
      kind: 'file',
    };
    const reasm = new MediaReassembler(receiver, 'mid2', meta);
    for (let seq = 0; seq < chunks.length; seq++) {
      const enc = await encryptChunk(sender, 'mid2', seq, chunks[seq]!);
      const err = await reasm.accept(enc);
      expect(err).toBeNull();
    }
    expect(reasm.isComplete).toBe(true);
    const roundtrip = reasm.toBytes()!;
    expect(roundtrip.length).toBe(original.length);
    expect(Array.from(roundtrip.slice(0, 100))).toEqual(Array.from(original.slice(0, 100)));
    // 抽查尾部也一致
    expect(Array.from(roundtrip.slice(-50))).toEqual(Array.from(original.slice(-50)));
  });
});

describe('MediaReassembler memory guards', () => {
  it('rejects an out-of-range seq (bad_seq)', async () => {
    const meta: MediaMetaPlain = { name: 'x', mime: 'text/plain', size: 10, totalChunks: 2, kind: 'file' };
    const reasm = new MediaReassembler(receiver, 'mid3', meta);
    const enc = await encryptChunk(sender, 'mid3', 5, new Uint8Array([1, 2, 3]));
    expect(await reasm.accept(enc)).toBe('bad_seq');
    expect(reasm.isFailed).toBe(true);
  });

  it('enforces max size cap even if meta under-reports', async () => {
    const big = new Uint8Array(1000);
    const meta: MediaMetaPlain = { name: 'x', mime: 'app/bin', size: 1, totalChunks: 1, kind: 'file' };
    // maxSize 设很小，模拟超限
    const reasm = new MediaReassembler(receiver, 'mid4', meta, 100);
    const enc = await encryptChunk(sender, 'mid4', 0, big);
    expect(await reasm.accept(enc)).toBe('over_limit');
    expect(reasm.isFailed).toBe(true);
  });

  it('fails on a corrupted chunk (decrypt_failed)', async () => {
    const meta: MediaMetaPlain = { name: 'x', mime: 'app/bin', size: 3, totalChunks: 1, kind: 'file' };
    const reasm = new MediaReassembler(receiver, 'mid5', meta);
    const enc = await encryptChunk(sender, 'mid5', 0, new Uint8Array([1, 2, 3]));
    // 篡改密文
    const corrupted = { ...enc, ciphertext: enc.ciphertext.slice(0, -4) + 'AAAA' };
    expect(await reasm.accept(corrupted)).toBe('decrypt_failed');
    expect(reasm.isFailed).toBe(true);
  });

  it('ignores duplicate chunks without failing', async () => {
    const meta: MediaMetaPlain = { name: 'x', mime: 'app/bin', size: 3, totalChunks: 1, kind: 'file' };
    const reasm = new MediaReassembler(receiver, 'mid6', meta);
    const enc = await encryptChunk(sender, 'mid6', 0, new Uint8Array([9, 9, 9]));
    expect(await reasm.accept(enc)).toBeNull();
    expect(await reasm.accept(enc)).toBeNull(); // 重复，忽略
    expect(reasm.isComplete).toBe(true);
  });
});
