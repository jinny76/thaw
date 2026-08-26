// 可续传的富媒体发送管理器。
//
// 发送方在内存保留原文件块，逐块加密发出；记录已发块。断线重连后，接收方
// 通过 media_resume 告知“还缺哪些块”，本管理器只补发缺块（不重头）。
// 全程受服务器零存储约束：块不落服务器，续传仅在收发双方之间进行。

import {
  MAX_FILE_SIZE,
  type MediaKind,
  type MediaMetaFrame,
  type MediaChunkFrame,
} from '@thaw/shared';
import type { EcdhCrypto } from '../crypto/ecdh-crypto.js';
import { splitChunks, encryptMeta, encryptChunk, type MediaMetaPlain } from './chunker.js';
import { randomId } from '../crypto/random.js';

export function classifyKind(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export interface TransferDeps {
  crypto: EcdhCrypto;
  sendMeta(frame: MediaMetaFrame): void;
  sendChunk(frame: MediaChunkFrame): void;
  /** 背压：返回当前 ws.bufferedAmount。 */
  bufferedAmount(): number;
  /** 是否仍连通（断线时暂停发送，等重连/续传）。 */
  isOpen(): boolean;
  /** 进度回调：sent/total。 */
  onProgress(sent: number, total: number): void;
  ttl: number;
}

export class OutgoingTransfer {
  readonly msgId: string;
  readonly meta: MediaMetaPlain;
  private readonly chunks: Uint8Array[];
  /** 已成功发出的块序号。 */
  private readonly acked = new Set<number>();
  private sending = false;
  private done = false;

  private constructor(
    private deps: TransferDeps,
    msgId: string,
    meta: MediaMetaPlain,
    chunks: Uint8Array[],
  ) {
    this.msgId = msgId;
    this.meta = meta;
    this.chunks = chunks;
  }

  static async create(deps: TransferDeps, blob: Blob, name: string): Promise<OutgoingTransfer> {
    if (blob.size > MAX_FILE_SIZE) throw new Error('file_too_large');
    const mime = blob.type || 'application/octet-stream';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = splitChunks(bytes);
    const meta: MediaMetaPlain = {
      name,
      mime,
      size: blob.size,
      totalChunks: chunks.length,
      kind: classifyKind(mime),
    };
    return new OutgoingTransfer(deps, randomId(12), meta, chunks);
  }

  get totalChunks(): number {
    return this.meta.totalChunks;
  }
  get sentCount(): number {
    return this.acked.size;
  }
  get isComplete(): boolean {
    return this.done;
  }

  /** 首次发送：先发 meta，再顺序发所有块。 */
  async start(): Promise<void> {
    const encMeta = await encryptMeta(this.deps.crypto, this.msgId, this.meta);
    this.deps.sendMeta({
      type: 'media_meta',
      msgId: this.msgId,
      kind: this.meta.kind,
      nonce: encMeta.nonce,
      ciphertext: encMeta.ciphertext,
      ttl: this.deps.ttl,
    });
    await this.pump(
      Array.from({ length: this.meta.totalChunks }, (_, i) => i),
    );
  }

  /**
   * 续传：接收方报告 missing 缺块 → 只补发这些。
   * missing 为空表示对方已收齐 → 标记完成。
   */
  async resume(missing: number[]): Promise<void> {
    if (missing.length === 0) {
      this.markAllAcked();
      return;
    }
    // 重新发送时先把这些块从 acked 移除（它们其实没到）
    for (const seq of missing) this.acked.delete(seq);
    await this.pump(missing);
  }

  /** 逐块加密发送给定序列，带背压与断线暂停。 */
  private async pump(seqs: number[]): Promise<void> {
    if (this.sending) return; // 避免并发泵
    this.sending = true;
    try {
      for (const seq of seqs) {
        if (this.acked.has(seq)) continue;
        // 断线：暂停，等待重连后由 resume 再次驱动
        if (!this.deps.isOpen()) break;
        // 背压
        let guard = 0;
        while (this.deps.bufferedAmount() > 4 * 1024 * 1024 && guard < 1000) {
          await new Promise((r) => setTimeout(r, 20));
          guard++;
        }
        const enc = await encryptChunk(this.deps.crypto, this.msgId, seq, this.chunks[seq]!);
        this.deps.sendChunk({
          type: 'media_chunk',
          msgId: this.msgId,
          seq,
          nonce: enc.nonce,
          ciphertext: enc.ciphertext,
        });
        this.acked.add(seq);
        this.deps.onProgress(this.acked.size, this.meta.totalChunks);
      }
      if (this.acked.size === this.meta.totalChunks) this.done = true;
    } finally {
      this.sending = false;
    }
  }

  private markAllAcked(): void {
    for (let i = 0; i < this.meta.totalChunks; i++) this.acked.add(i);
    this.done = true;
    this.deps.onProgress(this.acked.size, this.meta.totalChunks);
  }
}
