// WebSocket 中转服务器 —— 哑中转：只认房间号、只转密文、不解析内容、不落盘。
//
// 控制帧在此处理（房间生命周期）；内容帧只做「查对端 → 原样转发」。

import { WebSocketServer, WebSocket } from 'ws';
import {
  isContentFrame,
  type ClientToServerFrame,
  type ServerToClientFrame,
} from '@thaw/shared';
import { RoomManager, type Peer } from './rooms.js';
import {
  IpLimiter,
  FrameRateCounter,
  MAX_FRAME_BYTES,
  HEARTBEAT_INTERVAL_MS,
} from './ratelimit.js';
import { realIp, checkOrigin } from './net.js';

/** 是否允许恐慌热键真正关停进程（默认否，只关本房间）。 */
const ALLOW_PROCESS_KILL = process.env.THAW_ALLOW_PROCESS_KILL === '1';

interface WsPeer extends Peer {
  ws: WebSocket;
  ip: string;
  frames: FrameRateCounter;
  /** 本连接是否已占用一个活跃房间名额（用于离开时释放）。 */
  countedRoom: boolean;
}

let peerSeq = 0;

function wrapPeer(ws: WebSocket, ip: string): WsPeer {
  const id = `p${++peerSeq}`;
  return {
    id,
    ws,
    ip,
    frames: new FrameRateCounter(),
    countedRoom: false,
    send(data: string) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close() {
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
  };
}

function sendFrame(peer: Peer, frame: ServerToClientFrame): void {
  peer.send(JSON.stringify(frame));
}

export interface ThawServer {
  wss: WebSocketServer;
  rooms: RoomManager;
  close(): Promise<void>;
}

export function createServer(port: number): ThawServer {
  const wss = new WebSocketServer({
    port,
    maxPayload: MAX_FRAME_BYTES, // ws 层直接拒绝超大帧
    // 校验 Origin（防 CSWSH）；不通过则拒绝握手。
    verifyClient: ({ req }, done) => {
      if (!checkOrigin(req)) {
        done(false, 403, 'forbidden origin');
        return;
      }
      done(true);
    },
  });

  const rooms = new RoomManager(undefined, (roomId, _reason) => {
    void roomId;
  });
  const limiter = new IpLimiter();

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = realIp(req);
    // 单 IP 并发连接上限。
    if (!limiter.addConnection(ip)) {
      ws.close(1008, 'too many connections');
      return;
    }
    const peer = wrapPeer(ws, ip);

    ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      // 帧频率限制（防高频洪泛）。
      if (peer.frames.hit()) {
        ws.close(1008, 'rate limited');
        return;
      }
      // 二次大小校验（maxPayload 已挡，双保险）。
      const str = String(raw);
      if (str.length > MAX_FRAME_BYTES) {
        ws.close(1009, 'frame too large');
        return;
      }
      let frame: ClientToServerFrame;
      try {
        frame = JSON.parse(str) as ClientToServerFrame;
      } catch {
        return; // 非法帧，忽略
      }
      handleFrame(peer, frame);
    });

    ws.on('pong', () => {
      (ws as { _thawPending?: boolean })._thawPending = false;
    });

    ws.on('close', () => {
      limiter.removeConnection(ip);
      if (peer.countedRoom) limiter.recordLeaveRoom(ip);
      const other = rooms.handleDisconnect(peer, null);
      if (other) sendFrame(other, { type: 'peer_left' });
    });

    ws.on('error', () => {
      // 静默处理传输错误（不打印内容/IP）
    });
  });

  // 心跳：定期 ping，未回 pong 的僵尸连接踢死。
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as WebSocket & { _thawAlive?: boolean };
      // 用 ws 自身标记（peer 在闭包里，这里用连接级近似）
      if (ws.readyState !== WebSocket.OPEN) continue;
      if ((ws as { _thawPending?: boolean })._thawPending) {
        ws.terminate();
        continue;
      }
      (ws as { _thawPending?: boolean })._thawPending = true;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  function handleFrame(peer: WsPeer, frame: ClientToServerFrame): void {
    switch (frame.type) {
      case 'create_room': {
        // IP 建房速率 / 活跃房间数限制。
        if (!limiter.canCreate(peer.ip)) {
          sendFrame(peer, { type: 'room_unavailable', reason: 'rate_limited' });
          return;
        }
        const res = rooms.createRoom(frame.roomId, peer);
        if (!res.ok) {
          sendFrame(peer, { type: 'room_unavailable', reason: res.reason });
          return;
        }
        limiter.recordCreate(peer.ip);
        peer.countedRoom = true;
        sendFrame(peer, { type: 'room_state', roomId: frame.roomId, peers: 1, slot: res.slot });
        return;
      }

      case 'join_room': {
        // IP 活跃房间数限制。
        if (!peer.countedRoom && !limiter.recordJoin(peer.ip)) {
          sendFrame(peer, { type: 'room_unavailable', reason: 'rate_limited' });
          return;
        }
        const res = rooms.joinRoom(frame.roomId, peer);
        if (!res.ok) {
          // join 失败要回退刚占的名额（除非本就已计数）。
          if (!peer.countedRoom) limiter.recordLeaveRoom(peer.ip);
          sendFrame(peer, { type: 'room_unavailable', reason: res.reason });
          return;
        }
        peer.countedRoom = true;
        // 通知双方到齐（各自用自己真实的槽位，支持重进后槽位不固定）。
        sendFrame(peer, { type: 'room_state', roomId: frame.roomId, peers: 2, slot: res.slot });
        const other = rooms.getOtherPeer(peer);
        if (other) {
          const otherSlot = rooms.slotOf(other) ?? 'A';
          sendFrame(other, { type: 'peer_joined' });
          sendFrame(other, {
            type: 'room_state',
            roomId: frame.roomId,
            peers: 2,
            slot: otherSlot,
          });
        }
        return;
      }

      case 'reconnect': {
        const res = rooms.reconnect(frame.roomId, frame.token, peer);
        if (!res.ok) {
          sendFrame(peer, { type: 'room_unavailable', reason: 'bad_token' });
          return;
        }
        sendFrame(peer, { type: 'room_state', roomId: frame.roomId, peers: 2, slot: res.slot });
        const other = rooms.getOtherPeer(peer);
        if (other) sendFrame(other, { type: 'peer_joined' });
        return;
      }

      case 'handshake_failed': {
        const roomId = rooms.roomIdOf(peer);
        if (roomId) {
          const destroyed = rooms.recordHandshakeFailure(roomId);
          if (destroyed) {
            // 通知并断开房间内所有连接
            broadcastDestroy(peer);
          }
        }
        return;
      }

      case 'leave': {
        const other = rooms.getOtherPeer(peer);
        rooms.handleDisconnect(peer, null);
        if (other) sendFrame(other, { type: 'peer_left' });
        return;
      }

      case 'shutdown': {
        // 仅接受来自已入房连接的 shutdown（校验来源）
        const roomId = rooms.roomIdOf(peer);
        if (!roomId) return; // 未入房，忽略
        broadcastDestroy(peer);
        rooms.destroyRoom(roomId, 'panic_shutdown');
        if (ALLOW_PROCESS_KILL) {
          // 仅在显式开启时才真正关停进程（单圈子独占部署）
          setTimeout(() => process.exit(0), 50);
        }
        return;
      }

      default: {
        // 内容帧：只转发，不解析 ciphertext
        if (isContentFrame(frame.type)) {
          const other = rooms.getOtherPeer(peer);
          if (other) other.send(JSON.stringify(frame));
        }
        return;
      }
    }
  }

  /** 向 peer 所在房间双方广播 room_destroyed 并关闭连接。 */
  function broadcastDestroy(peer: Peer): void {
    const other = rooms.getOtherPeer(peer);
    sendFrame(peer, { type: 'room_destroyed' });
    if (other) {
      sendFrame(other, { type: 'room_destroyed' });
      other.close();
    }
    peer.close();
  }

  return {
    wss,
    rooms,
    close() {
      return new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}

// track sessionToken hashes announced by clients (for reconnect grace).
// Exposed via a side-channel frame in later phases; declared here for shape.
export type { WsPeer };
