// 真正的会话加密实现（替换 phase 3 的 PlaintextCrypto）。
//
// 文字消息：走对称棘轮——每条用独立、单向推进、不可逆推的 messageKey（前向保密）。
// 富媒体分块：用稳定的会话密钥 sessionKey（一个文件多块需同一密钥，AAD 逐块绑定）。

import { encrypt, decrypt, type AeadPayload } from './aead.js';
import { NonceCounter } from './aead.js';
import { SendRatchet, RecvRatchet } from './ratchet.js';
import { utf8ToBytes } from './encoding.js';
import { pad, unpad } from './padding.js';
import type { SessionCrypto, EncryptedPayload } from './session-crypto.js';

export class EcdhCrypto implements SessionCrypto {
  readonly ready = true;
  private readonly nonces: NonceCounter;
  private sendRatchet: SendRatchet | null = null;
  private recvRatchet: RecvRatchet | null = null;

  constructor(
    private readonly key: CryptoKey,
    private readonly ratchetRoot: Uint8Array,
    private readonly slot: 'A' | 'B' = 'A',
  ) {
    this.nonces = new NonceCounter();
  }

  private async ensureSend(): Promise<SendRatchet> {
    if (!this.sendRatchet) this.sendRatchet = await SendRatchet.create(this.ratchetRoot, this.slot);
    return this.sendRatchet;
  }
  private async ensureRecv(): Promise<RecvRatchet> {
    if (!this.recvRatchet) this.recvRatchet = await RecvRatchet.create(this.ratchetRoot, this.slot);
    return this.recvRatchet;
  }

  /**
   * 加密：默认走棘轮（文字消息流，前向保密）。
   * 控制类一次性消息（如昵称）传 ratchet=false，用稳定会话密钥。
   */
  async encrypt(plaintext: string, aad: string, ratchet = true): Promise<EncryptedPayload> {
    const nonce = this.nonces.next();
    // 定长填充：明文补到固定桶大小，密文长度不泄露真实消息长短。
    const padded = pad(utf8ToBytes(plaintext));
    if (!ratchet) {
      // 稳定密钥路径（昵称等控制消息）。
      return encrypt(this.key, padded, nonce, aad);
    }
    const { seq, key } = await (await this.ensureSend()).next();
    // AAD 额外绑定 seq，防重排/重放。
    const payload = await encrypt(key, padded, nonce, `${aad}|${seq}`);
    return { ...payload, seq };
  }

  /** 解密：payload 带 seq → 走棘轮；无 seq → 稳定会话密钥（昵称等）。剥离填充。 */
  async decrypt(payload: EncryptedPayload, aad: string): Promise<string> {
    const seq = payload.seq;
    if (seq === undefined) {
      const bytes = await decrypt(this.key, payload as AeadPayload, aad);
      return new TextDecoder().decode(unpad(bytes));
    }
    const key = await (await this.ensureRecv()).keyFor(seq);
    if (!key) throw new Error('no message key for seq');
    const bytes = await decrypt(key, payload as AeadPayload, `${aad}|${seq}`);
    return new TextDecoder().decode(unpad(bytes));
  }

  /** 供富媒体分块使用：拿到一个新 nonce。 */
  nextNonce(): Uint8Array {
    return this.nonces.next();
  }

  /** 底层会话密钥（富媒体逐块加密复用，不走棘轮）。 */
  get sessionKey(): CryptoKey {
    return this.key;
  }
}
