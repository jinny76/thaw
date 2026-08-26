// ECDH 密钥交换 —— 用 ECDH P-256（Web Crypto 原生、非实验、全浏览器支持）。
//
// 说明：X25519 在部分运行时仍是实验特性；P-256 提供同级(~128-bit)安全且稳定，
// 故本项目主用 P-256。会话密钥由 ECDH 共享密钥经 HKDF 派生（见 hkdf.ts）。

import { bytesToBase64, base64ToBytes } from './encoding.js';

const ALG = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface EcdhKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/** 生成临时 ECDH 密钥对。 */
export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const kp = (await crypto.subtle.generateKey(ALG, true, ['deriveBits'])) as CryptoKeyPair;
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** 导出公钥为 base64（raw 格式，用于经服务器交换）。 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

/** 从 base64 导入对端公钥。 */
export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(b64), ALG, false, []);
}

/** ECDH 派生共享密钥原始比特（256 bit）。 */
export async function deriveSharedBits(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}
