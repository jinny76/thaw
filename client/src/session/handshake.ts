// E2EE 握手编排：ECDH 公钥交换 + 口令 HMAC 认证（防 MITM）。
//
// 公钥顺序固定：slot A 的公钥在前、slot B 在后，两端据此算出一致的 auth tag。
// 服务器掉包任一方公钥 → 两端 aPub‖bPub 不一致 → tag 不符 → 握手失败。

import {
  generateEcdhKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedBits,
  type EcdhKeyPair,
} from '../crypto/ecdh.js';
import { deriveSessionKey } from '../crypto/hkdf.js';
import { deriveAuthKey } from '../crypto/kdf.js';
import { computeAuthTag, verifyAuthTag } from '../crypto/auth.js';
import { EcdhCrypto } from '../crypto/ecdh-crypto.js';
import { randomId } from '../crypto/random.js';

export type HandshakeStatus = 'idle' | 'exchanging' | 'authenticating' | 'done' | 'failed';

export interface HandshakeOutcome {
  status: 'done' | 'failed';
  crypto?: EcdhCrypto;
  sessionToken?: string;
}

export interface HandshakeDeps {
  roomId: string;
  passphrase: string;
  slot: 'A' | 'B';
  sendPub(pubB64: string): void;
  sendTag(tagB64: string): void;
}

/**
 * 握手编排器。上层在握手阶段把收到的 ecdh_pub / auth_tag 帧喂进来，
 * 完成或失败时 resolve。
 */
export class Handshake {
  private status: HandshakeStatus = 'idle';
  private keyPair: EcdhKeyPair | null = null;
  private myPub = '';
  private peerPub: string | null = null;
  private myTag = '';
  private peerTag: string | null = null;
  private sessionKey: CryptoKey | null = null;
  private authKey: Uint8Array | null = null;
  private resolveOutcome!: (o: HandshakeOutcome) => void;
  private outcome = new Promise<HandshakeOutcome>((res) => {
    this.resolveOutcome = res;
  });

  constructor(private deps: HandshakeDeps) {}

  /** 启动：生成密钥对并发出公钥。 */
  async start(): Promise<void> {
    this.status = 'exchanging';
    this.keyPair = await generateEcdhKeyPair();
    this.myPub = await exportPublicKey(this.keyPair.publicKey);
    this.authKey = await deriveAuthKey(this.deps.passphrase, this.deps.roomId);
    this.deps.sendPub(this.myPub);
    await this.maybeAdvance();
  }

  /** 收到对端公钥。 */
  async onPeerPub(pubB64: string): Promise<void> {
    this.peerPub = pubB64;
    await this.maybeAdvance();
  }

  /** 收到对端 auth tag。 */
  async onPeerTag(tagB64: string): Promise<void> {
    this.peerTag = tagB64;
    await this.maybeVerify();
  }

  /** 等待握手结果。 */
  result(): Promise<HandshakeOutcome> {
    return this.outcome;
  }

  private orderedPubs(): { aPub: string; bPub: string } {
    // slot A 公钥在前
    if (this.deps.slot === 'A') {
      return { aPub: this.myPub, bPub: this.peerPub! };
    }
    return { aPub: this.peerPub!, bPub: this.myPub };
  }

  /** 公钥齐了 → 派生会话密钥 + 发出 auth tag。 */
  private async maybeAdvance(): Promise<void> {
    if (this.status !== 'exchanging') return;
    if (!this.keyPair || !this.peerPub || !this.authKey) return;

    const shared = await deriveSharedBits(
      this.keyPair.privateKey,
      await importPublicKey(this.peerPub),
    );
    this.sessionKey = await deriveSessionKey(shared, this.deps.roomId);

    const { aPub, bPub } = this.orderedPubs();
    this.myTag = await computeAuthTag(this.authKey, aPub, bPub, this.deps.roomId);
    this.status = 'authenticating';
    this.deps.sendTag(this.myTag);
    await this.maybeVerify();
  }

  /** tag 齐了 → 常数时间校验。 */
  private async maybeVerify(): Promise<void> {
    if (this.status !== 'authenticating') return;
    if (!this.peerTag || !this.authKey || !this.sessionKey) return;

    const { aPub, bPub } = this.orderedPubs();
    const ok = await verifyAuthTag(
      this.authKey,
      aPub,
      bPub,
      this.deps.roomId,
      this.peerTag,
    );
    if (!ok) {
      this.status = 'failed';
      this.resolveOutcome({ status: 'failed' });
      return;
    }
    this.status = 'done';
    this.resolveOutcome({
      status: 'done',
      crypto: new EcdhCrypto(this.sessionKey),
      sessionToken: randomId(16),
    });
  }
}
