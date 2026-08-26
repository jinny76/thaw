// 会话加密适配器接口 —— phase 3 用明文直通实现；phase 6 换成真正的
// ECDH + AES-GCM 实现。UI/传输层只依赖此接口，加密接入时无需改动它们。

export interface EncryptedPayload {
  nonce: string; // base64
  ciphertext: string; // base64
  /** 棘轮序号（文字消息用，标识用哪一步的 messageKey）；富媒体不设。 */
  seq?: number;
}

export interface SessionCrypto {
  /** 是否已建立安全会话（握手完成）。 */
  readonly ready: boolean;
  /** 加密一段明文（含 AAD 绑定 msgId）。ratchet=false 走稳定密钥（控制消息）。 */
  encrypt(plaintext: string, aad: string, ratchet?: boolean): Promise<EncryptedPayload>;
  /** 解密。失败抛错。 */
  decrypt(payload: EncryptedPayload, aad: string): Promise<string>;
}

/**
 * Phase 3 明文直通实现：不加密，仅 base64 编码占位，nonce 恒为空。
 * 让通道先跑通；phase 6 用 Ecdh 实现替换。
 */
export class PlaintextCrypto implements SessionCrypto {
  readonly ready = true;

  async encrypt(
    plaintext: string,
    _aad: string,
    _ratchet = true,
  ): Promise<EncryptedPayload> {
    return { nonce: '', ciphertext: btoa(unescape(encodeURIComponent(plaintext))) };
  }

  async decrypt(payload: EncryptedPayload, _aad: string): Promise<string> {
    return decodeURIComponent(escape(atob(payload.ciphertext)));
  }
}
