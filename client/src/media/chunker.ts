// 富媒体分块加密 / 重组。每块单独 AES-GCM，AAD 绑定 msgId+seq。
// 接收端在重组缓冲层强制上限、校验 seq 连续、块数不超 meta 声明。

import { CHUNK_SIZE, MAX_FILE_SIZE, type MediaKind } from '@thaw/shared';
import { encrypt, decrypt, buildAad, type AeadPayload } from '../crypto/aead.js';
import { bytesToBase64, base64ToBytes, utf8ToBytes, bytesToUtf8 } from '../crypto/encoding.js';
import type { EcdhCrypto } from '../crypto/ecdh-crypto.js';

export interface MediaMetaPlain {
  name: string;
  mime: string;
  size: number;
  totalChunks: number;
  kind: MediaKind;
}

export interface EncryptedMeta {
  nonce: string;
  ciphertext: string;
}

export interface EncryptedChunk {
  seq: number;
  nonce: string;
  ciphertext: string;
}

/** 把文件字节按 CHUNK_SIZE 切块。 */
export function splitChunks(bytes: Uint8Array, chunkSize = CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let off = 0; off < bytes.length; off += chunkSize) {
    chunks.push(bytes.slice(off, Math.min(off + chunkSize, bytes.length)));
  }
  // 空文件也产出一个空块，保证 totalChunks ≥ 1
  if (chunks.length === 0) chunks.push(new Uint8Array(0));
  return chunks;
}

/** 加密 meta（AAD 绑定 msgId）。 */
export async function encryptMeta(
  crypto: EcdhCrypto,
  msgId: string,
  meta: MediaMetaPlain,
): Promise<EncryptedMeta> {
  const aad = buildAad(msgId, 'media_meta', msgId);
  const payload = await encrypt(
    crypto.sessionKey,
    utf8ToBytes(JSON.stringify(meta)),
    crypto.nextNonce(),
    aad,
  );
  return payload;
}

/** 解密 meta。 */
export async function decryptMeta(
  crypto: EcdhCrypto,
  msgId: string,
  enc: EncryptedMeta,
): Promise<MediaMetaPlain> {
  const aad = buildAad(msgId, 'media_meta', msgId);
  const bytes = await decrypt(crypto.sessionKey, enc as AeadPayload, aad);
  return JSON.parse(bytesToUtf8(bytes)) as MediaMetaPlain;
}

/** 加密单块（AAD 绑定 msgId+seq）。 */
export async function encryptChunk(
  crypto: EcdhCrypto,
  msgId: string,
  seq: number,
  chunk: Uint8Array,
): Promise<EncryptedChunk> {
  const aad = buildAad(msgId, 'media_chunk', `${seq}`);
  const payload = await encrypt(crypto.sessionKey, chunk, crypto.nextNonce(), aad);
  return { seq, nonce: payload.nonce, ciphertext: payload.ciphertext };
}

/** 解密单块。 */
export async function decryptChunk(
  crypto: EcdhCrypto,
  msgId: string,
  seq: number,
  enc: EncryptedChunk,
): Promise<Uint8Array> {
  const aad = buildAad(msgId, 'media_chunk', `${seq}`);
  return decrypt(
    crypto.sessionKey,
    { nonce: enc.nonce, ciphertext: enc.ciphertext },
    aad,
  );
}

export type ReassembleError =
  | 'over_limit'
  | 'too_many_chunks'
  | 'bad_seq'
  | 'decrypt_failed';

/**
 * 接收端重组器：逐块解密、校验、限内存。累计超上限或异常立即作废。
 */
export class MediaReassembler {
  private chunks: (Uint8Array | undefined)[];
  private received = 0;
  private bytesSoFar = 0;
  private failed = false;

  constructor(
    private readonly crypto: EcdhCrypto,
    private readonly msgId: string,
    private readonly meta: MediaMetaPlain,
    private readonly maxSize = MAX_FILE_SIZE,
  ) {
    this.chunks = new Array(meta.totalChunks).fill(undefined);
  }

  get isFailed(): boolean {
    return this.failed;
  }
  get isComplete(): boolean {
    return !this.failed && this.received === this.meta.totalChunks;
  }
  get receivedCount(): number {
    return this.received;
  }
  get totalChunks(): number {
    return this.meta.totalChunks;
  }

  /** 尚缺的块序号（升序），供断点续传请求。 */
  missingSeqs(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      if (this.chunks[i] === undefined) out.push(i);
    }
    return out;
  }

  /** 接收并校验一块。返回错误码或 null（成功）。 */
  async accept(enc: EncryptedChunk): Promise<ReassembleError | null> {
    if (this.failed) return 'decrypt_failed';
    // seq 范围校验（防越界/谎报）
    if (enc.seq < 0 || enc.seq >= this.meta.totalChunks) {
      this.fail();
      return 'bad_seq';
    }
    if (this.chunks[enc.seq] !== undefined) {
      // 重复块，忽略（不算错误）
      return null;
    }
    let plain: Uint8Array;
    try {
      plain = await decryptChunk(this.crypto, this.msgId, enc.seq, enc);
    } catch {
      this.fail();
      return 'decrypt_failed';
    }
    // 累计大小上限强制（即便 meta 谎报）
    if (this.bytesSoFar + plain.length > this.maxSize) {
      this.fail();
      return 'over_limit';
    }
    this.chunks[enc.seq] = plain;
    this.bytesSoFar += plain.length;
    this.received += 1;
    return null;
  }

  /** 重组为连续字节（仅在 complete 时）。 */
  toBytes(): Uint8Array | null {
    if (!this.isComplete) return null;
    const total = this.chunks.reduce((n, c) => n + (c?.length ?? 0), 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      if (c) {
        out.set(c, off);
        off += c.length;
      }
    }
    return out;
  }

  /** 重组为 Blob（仅在 complete 时）。 */
  toBlob(): Blob | null {
    const bytes = this.toBytes();
    if (!bytes) return null;
    return new Blob([bytes as BlobPart], { type: this.meta.mime });
  }

  private fail(): void {
    this.failed = true;
    this.chunks = [];
    this.bytesSoFar = 0;
  }
}

export { bytesToBase64, base64ToBytes };
