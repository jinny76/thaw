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

/** 是否允许恐慌热键真正关停进程（默认否，只关本房间）。 */
const ALLOW_PROCESS_KILL = process.env.THAW_ALLOW_PROCESS_KILL === '1';

interface WsPeer extends Peer {
  ws: WebSocket;
}

let peerSeq = 0;

function wrapPeer(ws: WebSocket): WsPeer {
  const id = `p${++peerSeq}`;
  return {
    id,
    ws,
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
  const wss = new WebSocketServer({ port });

  const rooms = new RoomManager(undefined, (roomId, _reason) => {
    // 房间销毁回调：无需额外动作（连接关闭在 destroy 流程外单独处理）。
    void roomId;
  });

  wss.on('connection', (ws: WebSocket) => {
    const peer = wrapPeer(ws);

    ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let frame: ClientToServerFrame;
      try {
        frame = JSON.parse(String(raw)) as ClientToServerFrame;
      } catch {
        return; // 非法帧，忽略
      }
      handleFrame(peer, frame);
    });

    ws.on('close', () => {
      // 断线恢复的 token 宣告在 phase 6 接入；此阶段无 token（断开即释放槽位）。
      const other = rooms.handleDisconnect(peer, null);
      if (other) sendFrame(other, { type: 'peer_left' });
    });

    ws.on('error', () => {
      // 静默处理传输错误（不打印内容/IP）
    });
  });

  function handleFrame(peer: Peer, frame: ClientToServerFrame): void {
    switch (frame.type) {
      case 'create_room': {
        const res = rooms.createRoom(frame.roomId, peer);
        if (!res.ok) {
          sendFrame(peer, { type: 'room_unavailable', reason: res.reason });
          return;
        }
        sendFrame(peer, { type: 'room_state', roomId: frame.roomId, peers: 1, slot: res.slot });
        return;
      }

      case 'join_room': {
        const res = rooms.joinRoom(frame.roomId, peer);
        if (!res.ok) {
          sendFrame(peer, { type: 'room_unavailable', reason: res.reason });
          return;
        }
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
