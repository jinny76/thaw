// WebSocket 帧协议定义 —— 客户端与服务器共享。
//
// 分两类：
//  - 控制帧：服务器可读，不含用户内容（房间生命周期、握手信令）。
//  - 内容帧：服务器只转发密文，不解析 ciphertext。
//
// 服务器对内容帧的处理 = 「查 roomId → 找对端 → 原样转发 → 不缓存」。

export type MediaKind = 'image' | 'audio' | 'video' | 'file';

// ── 客户端 → 服务器 ──────────────────────────────────────────────

export interface CreateRoomFrame {
  type: 'create_room';
  roomId: string;
}

export interface JoinRoomFrame {
  type: 'join_room';
  roomId: string;
}

export interface LeaveFrame {
  type: 'leave';
}

/** 关停请求：服务器校验来源已入房后，销毁本房间（默认不 process.exit）。 */
export interface ShutdownFrame {
  type: 'shutdown';
}

/** 握手失败信号（不含口令），供服务器限速计数。 */
export interface HandshakeFailedFrame {
  type: 'handshake_failed';
}

/** 断线重连：持握手时生成的 sessionToken 恢复。 */
export interface ReconnectFrame {
  type: 'reconnect';
  roomId: string;
  token: string;
}

// ── 服务器 → 客户端 ──────────────────────────────────────────────

export interface RoomStateFrame {
  type: 'room_state';
  roomId: string;
  peers: 0 | 1 | 2;
  /** 当前连接在房间中的角色槽位。 */
  slot: 'A' | 'B';
}

export interface PeerJoinedFrame {
  type: 'peer_joined';
}

export interface PeerLeftFrame {
  type: 'peer_left';
}

export interface RoomUnavailableFrame {
  type: 'room_unavailable';
  reason: 'not_found' | 'full' | 'destroyed' | 'room_taken' | 'rate_limited' | 'bad_token';
}

export interface RoomDestroyedFrame {
  type: 'room_destroyed';
}

// ── 握手信令（内容层，经服务器转发；服务器不解析载荷）──────────────

/** 交换 X25519 临时公钥。 */
export interface EcdhPubFrame {
  type: 'ecdh_pub';
  pubKey: string; // base64
}

/** 口令认证 HMAC，用于防 MITM。 */
export interface AuthTagFrame {
  type: 'auth_tag';
  tag: string; // base64
}

// ── 内容帧（服务器只转发密文）────────────────────────────────────

export interface MsgFrame {
  type: 'msg';
  msgId: string;
  nonce: string; // base64
  ciphertext: string; // base64
  ttl: number; // 秒
}

export interface MediaMetaFrame {
  type: 'media_meta';
  msgId: string;
  kind: MediaKind;
  nonce: string;
  ciphertext: string; // 加密的 { name, mime, size, totalChunks }
  ttl: number;
}

export interface MediaChunkFrame {
  type: 'media_chunk';
  msgId: string;
  seq: number;
  nonce: string;
  ciphertext: string; // base64
}

/**
 * 断点续传请求：接收方告诉发送方“这些 seq 我还没收到，请补发”。
 * 服务器只转发，不理解语义。
 */
export interface MediaResumeFrame {
  type: 'media_resume';
  msgId: string;
  /** 尚缺的块序号（升序）。空数组表示已收齐。 */
  missing: number[];
}

export interface TypingFrame {
  type: 'typing';
}

/** 加密的会话内昵称（E2EE，服务器看不到明文）。 */
export interface NickFrame {
  type: 'nick';
  nonce: string;
  ciphertext: string;
}

export interface BurnFrame {
  type: 'burn';
  msgId: string;
}

// ── 汇总联合类型 ─────────────────────────────────────────────────

export type ClientToServerFrame =
  | CreateRoomFrame
  | JoinRoomFrame
  | LeaveFrame
  | ShutdownFrame
  | HandshakeFailedFrame
  | ReconnectFrame
  | EcdhPubFrame
  | AuthTagFrame
  | MsgFrame
  | MediaMetaFrame
  | MediaChunkFrame
  | MediaResumeFrame
  | TypingFrame
  | NickFrame
  | BurnFrame;

export type ServerToClientFrame =
  | RoomStateFrame
  | PeerJoinedFrame
  | PeerLeftFrame
  | RoomUnavailableFrame
  | RoomDestroyedFrame
  | EcdhPubFrame
  | AuthTagFrame
  | MsgFrame
  | MediaMetaFrame
  | MediaChunkFrame
  | MediaResumeFrame
  | TypingFrame
  | NickFrame
  | BurnFrame;

export type AnyFrame = ClientToServerFrame | ServerToClientFrame;

/**
 * 内容帧类型集合 —— 服务器对这些帧只做原样转发，不解析 ciphertext。
 * 控制帧之外的一切都属于此集合。
 */
export const CONTENT_FRAME_TYPES: ReadonlySet<string> = new Set([
  'ecdh_pub',
  'auth_tag',
  'msg',
  'media_meta',
  'media_chunk',
  'media_resume',
  'typing',
  'nick',
  'burn',
]);

export function isContentFrame(type: string): boolean {
  return CONTENT_FRAME_TYPES.has(type);
}
