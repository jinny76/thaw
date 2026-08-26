import { describe, it, expect, beforeAll } from 'vitest';
import { OutgoingTransfer, classifyKind } from './transfer.js';
import { MediaReassembler, decryptMeta } from './chunker.js';
import { EcdhCrypto } from '../crypto/ecdh-crypto.js';
import { generateEcdhKeyPair, deriveSharedBits } from '../crypto/ecdh.js';
import { deriveSessionKey } from '../crypto/hkdf.js';
import type { MediaMetaFrame, MediaChunkFrame } from '@thaw/shared';

async function sharedPair(): Promise<[EcdhCrypto, EcdhCrypto]> {
  const a = await generateEcdhKeyPair();
  const b = await generateEcdhKeyPair();
  const shared = await deriveSharedBits(a.privateKey, b.publicKey);
  const key = await deriveSessionKey(shared, 'room');
  const root = new Uint8Array(32); // 媒体不走棘轮
  return [new EcdhCrypto(key, root, 'A'), new EcdhCrypto(key, root, 'B')];
}

let sender: EcdhCrypto;
let receiver: EcdhCrypto;
beforeAll(async () => {
  [sender, receiver] = await sharedPair();
});

describe('classifyKind', () => {
  it('识别 video/image/audio/file', () => {
    expect(classifyKind('video/mp4')).toBe('video');
    expect(classifyKind('image/png')).toBe('image');
    expect(classifyKind('audio/webm')).toBe('audio');
    expect(classifyKind('application/pdf')).toBe('file');
  });
});

describe('OutgoingTransfer + 断点续传', () => {
  it('report progress and complete on full send', async () => {
    const blob = new Blob([new Uint8Array(200_000)], { type: 'image/png' });
    const chunks: MediaChunkFrame[] = [];
    let meta: MediaMetaFrame | null = null;
    const progress: number[] = [];
    const t = await OutgoingTransfer.create(
      {
        crypto: sender,
        sendMeta: (f) => (meta = f),
        sendChunk: (f) => chunks.push(f),
        bufferedAmount: () => 0,
        isOpen: () => true,
        onProgress: (sent, total) => progress.push(sent / total),
        ttl: 30,
      },
      blob,
      'p.png',
    );
    await t.start();
    expect(meta).not.toBeNull();
    expect(t.isComplete).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);
    expect(chunks.length).toBe(t.totalChunks);
  });

  it('resume 只补发缺块（模拟丢块后续传）', async () => {
    const original = new Uint8Array(200_000);
    for (let i = 0; i < original.length; i++) original[i] = (i * 5) % 256;
    const blob = new Blob([original], { type: 'application/octet-stream' });

    const chunks: MediaChunkFrame[] = [];
    let metaFrame: MediaMetaFrame | null = null;
    const t = await OutgoingTransfer.create(
      {
        crypto: sender,
        sendMeta: (f) => (metaFrame = f),
        sendChunk: (f) => chunks.push(f),
        bufferedAmount: () => 0,
        isOpen: () => true,
        onProgress: () => {},
        ttl: 30,
      },
      blob,
      'blob.bin',
    );
    await t.start();
    const total = t.totalChunks;
    expect(chunks.length).toBe(total);

    // 接收端：故意“丢掉” seq 1 和 3，其余接收
    const meta = await decryptMeta(receiver, metaFrame!.msgId, {
      nonce: metaFrame!.nonce,
      ciphertext: metaFrame!.ciphertext,
    });
    const reasm = new MediaReassembler(receiver, metaFrame!.msgId, meta);
    const dropped = new Set([1, 3]);
    for (const c of chunks) {
      if (dropped.has(c.seq)) continue;
      await reasm.accept({ seq: c.seq, nonce: c.nonce, ciphertext: c.ciphertext });
    }
    expect(reasm.isComplete).toBe(false);
    const missing = reasm.missingSeqs();
    expect(missing.sort()).toEqual([1, 3]);

    // 续传：发送方只补发缺块
    const before = chunks.length;
    await t.resume(missing);
    const resent = chunks.slice(before);
    expect(resent.map((c) => c.seq).sort()).toEqual([1, 3]);

    // 接收端补收 → 完整还原
    for (const c of resent) {
      await reasm.accept({ seq: c.seq, nonce: c.nonce, ciphertext: c.ciphertext });
    }
    expect(reasm.isComplete).toBe(true);
    const roundtrip = reasm.toBytes()!;
    expect(roundtrip.length).toBe(original.length);
    expect(Array.from(roundtrip.slice(0, 50))).toEqual(Array.from(original.slice(0, 50)));
  });

  it('resume([]) 表示对方已收齐 → 标记完成', async () => {
    const blob = new Blob([new Uint8Array(1000)], { type: 'image/png' });
    const t = await OutgoingTransfer.create(
      {
        crypto: sender,
        sendMeta: () => {},
        sendChunk: () => {},
        bufferedAmount: () => 0,
        isOpen: () => true,
        onProgress: () => {},
        ttl: 30,
      },
      blob,
      'x.png',
    );
    await t.resume([]);
    expect(t.isComplete).toBe(true);
  });
});
