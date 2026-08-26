// 内存房间管理 —— 服务器唯一的状态，进程退出即清。无 DB、无文件、无快照。
//
// 每个房间两个槽位 A/B。只有两槽都在线才允许收发。握手失败限速：窗口内
// 失败达阈值即销毁房间。房间创建后无人正确加入超时自动销毁。

import {
  HANDSHAKE_FAIL_LIMIT,
  HANDSHAKE_FAIL_WINDOW_MS,
  ROOM_IDLE_TIMEOUT_MS,
  RECONNECT_GRACE_MS,
} from '@thaw/shared';

export type Slot = 'A' | 'B';

/** 抽象的连接句柄，便于测试（真实为 ws.WebSocket）。 */
export interface Peer {
  send(data: string): void;
  close(): void;
  /** 稳定标识，用于日志/去重（不落盘、不外泄）。 */
  readonly id: string;
}

interface RoomSlot {
  peer: Peer | null;
  /** 断线后待恢复的 sessionToken 哈希；null 表示无待恢复。 */
  pendingTokenHash: string | null;
  /** 断线宽限期计时器。 */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  roomId: string;
  slots: Record<Slot, RoomSlot>;
  createdAt: number;
  /** 握手失败时间戳（滑动窗口）。 */
  failTimes: number[];
  /** 无人正确加入的自动过期计时器。 */
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export type CreateResult =
  | { ok: true; slot: Slot }
  | { ok: false; reason: 'room_taken' };

export type JoinResult =
  | { ok: true; slot: Slot }
  | { ok: false; reason: 'not_found' | 'full' | 'destroyed' };

export type ReconnectResult =
  | { ok: true; slot: Slot }
  | { ok: false; reason: 'not_found' | 'bad_token' };

/** 时钟注入，便于测试。 */
export interface Clock {
  now(): number;
}

const realClock: Clock = { now: () => Date.now() };

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private clock: Clock = realClock,
    /** 房间被销毁时的回调（用于广播 room_destroyed / 关闭连接）。 */
    private onDestroy: (roomId: string, reason: string) => void = () => {},
  ) {}

  /** 仅供测试/内部检查：房间是否存在。 */
  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /** 仅供测试：房间在线人数。 */
  peerCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return (room.slots.A.peer ? 1 : 0) + (room.slots.B.peer ? 1 : 0);
  }

  createRoom(roomId: string, peer: Peer): CreateResult {
    if (this.rooms.has(roomId)) {
      return { ok: false, reason: 'room_taken' };
    }
    const room: Room = {
      roomId,
      slots: {
        A: { peer, pendingTokenHash: null, graceTimer: null },
        B: { peer: null, pendingTokenHash: null, graceTimer: null },
      },
      createdAt: this.clock.now(),
      failTimes: [],
      idleTimer: null,
    };
    room.idleTimer = setTimeout(() => {
      // 无人正确加入 → 自动销毁
      if (this.peerCount(roomId) < 2) {
        this.destroyRoom(roomId, 'idle_timeout');
      }
    }, ROOM_IDLE_TIMEOUT_MS);
    // 允许进程在仅剩此计时器时退出
    room.idleTimer.unref?.();
    this.rooms.set(roomId, room);
    return { ok: true, slot: 'A' };
  }

  joinRoom(roomId: string, peer: Peer): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: 'not_found' };
    // 已在房中（同一 peer 重复 join）忽略。
    if (room.slots.A.peer === peer || room.slots.B.peer === peer) {
      return { ok: false, reason: 'full' };
    }
    // 填充任一空槽位（支持一方离开后另一人/本人再进）。
    let slot: Slot;
    if (room.slots.B.peer === null) slot = 'B';
    else if (room.slots.A.peer === null) slot = 'A';
    else return { ok: false, reason: 'full' };

    room.slots[slot].peer = peer;
    room.slots[slot].pendingTokenHash = null;
    if (room.slots[slot].graceTimer) {
      clearTimeout(room.slots[slot].graceTimer!);
      room.slots[slot].graceTimer = null;
    }
    // 两人到齐，取消空闲过期
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = null;
    }
    return { ok: true, slot };
  }

  /** 找到 peer 所在的房间与槽位。 */
  private locate(peer: Peer): { room: Room; slot: Slot } | null {
    for (const room of this.rooms.values()) {
      if (room.slots.A.peer === peer) return { room, slot: 'A' };
      if (room.slots.B.peer === peer) return { room, slot: 'B' };
    }
    return null;
  }

  /** 返回房间中另一槽位的 peer（用于转发）。 */
  getOtherPeer(peer: Peer): Peer | null {
    const found = this.locate(peer);
    if (!found) return null;
    const other = found.slot === 'A' ? found.room.slots.B : found.room.slots.A;
    return other.peer;
  }

  roomIdOf(peer: Peer): string | null {
    return this.locate(peer)?.room.roomId ?? null;
  }

  /** peer 当前所在槽位（不在房则 null）。 */
  slotOf(peer: Peer): Slot | null {
    return this.locate(peer)?.slot ?? null;
  }

  /**
   * peer 断开：释放其槽位，进入宽限期等待重连；宽限期内可用 token 恢复。
   * 返回被通知的对端（若在线），供上层广播 peer_left。
   * @param tokenHash 若提供，宽限期内允许持此 token 重连恢复。
   */
  handleDisconnect(peer: Peer, tokenHash: string | null = null): Peer | null {
    const found = this.locate(peer);
    if (!found) return null;
    const { room, slot } = found;
    const slotState = room.slots[slot];
    slotState.peer = null;
    slotState.pendingTokenHash = tokenHash;

    const other = slot === 'A' ? room.slots.B.peer : room.slots.A.peer;

    if (tokenHash) {
      // 宽限期等待重连
      slotState.graceTimer = setTimeout(() => {
        slotState.pendingTokenHash = null;
        slotState.graceTimer = null;
        // 宽限期到，若房间已空则销毁
        if (this.peerCount(room.roomId) === 0) {
          this.destroyRoom(room.roomId, 'both_left');
        }
      }, RECONNECT_GRACE_MS);
      slotState.graceTimer.unref?.();
    } else if (this.peerCount(room.roomId) === 0) {
      this.destroyRoom(room.roomId, 'both_left');
    }
    return other;
  }

  /** 持 token 重连恢复。 */
  reconnect(roomId: string, tokenHash: string, peer: Peer): ReconnectResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: 'not_found' };
    for (const slot of ['A', 'B'] as Slot[]) {
      const s = room.slots[slot];
      if (s.peer === null && s.pendingTokenHash && s.pendingTokenHash === tokenHash) {
        s.peer = peer;
        s.pendingTokenHash = null;
        if (s.graceTimer) {
          clearTimeout(s.graceTimer);
          s.graceTimer = null;
        }
        return { ok: true, slot };
      }
    }
    return { ok: false, reason: 'bad_token' };
  }

  /**
   * 记录一次握手失败。若窗口内失败达阈值 → 销毁房间（防口令在线爆破）。
   * 返回是否触发了销毁。
   */
  recordHandshakeFailure(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const now = this.clock.now();
    room.failTimes = room.failTimes.filter((t) => now - t < HANDSHAKE_FAIL_WINDOW_MS);
    room.failTimes.push(now);
    if (room.failTimes.length >= HANDSHAKE_FAIL_LIMIT) {
      this.destroyRoom(roomId, 'handshake_rate_limit');
      return true;
    }
    return false;
  }

  /** 销毁房间：清计时器、通知上层、从 Map 删除。 */
  destroyRoom(roomId: string, reason: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const slot of ['A', 'B'] as Slot[]) {
      const s = room.slots[slot];
      if (s.graceTimer) clearTimeout(s.graceTimer);
    }
    if (room.idleTimer) clearTimeout(room.idleTimer);
    this.rooms.delete(roomId);
    this.onDestroy(roomId, reason);
  }
}
