// 真正的会话加密实现（替换 phase 3 的 PlaintextCrypto）。
// 握手完成后持有 AES-256-GCM 会话密钥 + 递增 nonce 计数器。

import { NonceCounter, encryptString, decryptString, type AeadPayload } from './aead.js';
import type { SessionCrypto, EncryptedPayload } from './session-crypto.js';

export class EcdhCrypto implements SessionCrypto {
  readonly ready = true;
  private readonly nonces: NonceCounter;

  constructor(private readonly key: CryptoKey) {
    this.nonces = new NonceCounter();
  }

  async encrypt(plaintext: string, aad: string): Promise<EncryptedPayload> {
    const payload = await encryptString(this.key, plaintext, this.nonces.next(), aad);
    return payload;
  }

  async decrypt(payload: EncryptedPayload, aad: string): Promise<string> {
    return decryptString(this.key, payload as AeadPayload, aad);
  }

  /** 供富媒体分块使用：拿到一个新 nonce。 */
  nextNonce(): Uint8Array {
    return this.nonces.next();
  }

  /** 底层会话密钥（富媒体逐块加密复用）。 */
  get sessionKey(): CryptoKey {
    return this.key;
  }
}
