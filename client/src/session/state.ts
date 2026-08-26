// 房间会话状态机（纯函数 reducer，便于单测）。
//
// idle → creating/joining → (waiting_room) → waiting_peer → connected → closed
// waiting_room：受邀方先到、房间尚未被主人开启 → 等待并重试。
// 附带 error 态用于「口令错误 / 房间已满/已毁 等不可恢复情形」。

export type SessionPhase =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'waiting_room'
  | 'waiting_peer'
  | 'connected'
  | 'closed'
  | 'error';

export interface SessionState {
  phase: SessionPhase;
  roomId: string | null;
  slot: 'A' | 'B' | null;
  peers: 0 | 1 | 2;
  /** 是否已完成 E2EE 握手（phase 6 起有意义；phase 3 视 connected 即 true）。 */
  secure: boolean;
  /** 对方的会话内昵称（经 E2EE 交换；未收到则为 null）。 */
  peerNickname: string | null;
  errorReason: string | null;
}

export const initialSession: SessionState = {
  phase: 'idle',
  roomId: null,
  slot: null,
  peers: 0,
  secure: false,
  peerNickname: null,
  errorReason: null,
};

export type SessionAction =
  | { type: 'CREATE'; roomId: string }
  | { type: 'JOIN'; roomId: string }
  | { type: 'ROOM_STATE'; peers: 0 | 1 | 2; slot: 'A' | 'B' }
  | { type: 'PEER_JOINED' }
  | { type: 'PEER_LEFT' }
  | { type: 'SECURE' }
  | { type: 'PEER_NICK'; nickname: string }
  | { type: 'WAITING_ROOM' }
  | { type: 'UNAVAILABLE'; reason: string }
  | { type: 'DESTROYED' }
  | { type: 'CLOSE' };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'CREATE':
      return { ...initialSession, phase: 'creating', roomId: action.roomId };

    case 'JOIN':
      return { ...initialSession, phase: 'joining', roomId: action.roomId };

    case 'ROOM_STATE': {
      const connected = action.peers === 2;
      return {
        ...state,
        peers: action.peers,
        slot: action.slot,
        phase: connected ? 'connected' : 'waiting_peer',
      };
    }

    case 'PEER_JOINED':
      return { ...state, peers: 2, phase: 'connected' };

    case 'PEER_LEFT':
      return { ...state, peers: 1, phase: 'waiting_peer', secure: false, peerNickname: null };

    case 'SECURE':
      return { ...state, secure: true };

    case 'PEER_NICK':
      return { ...state, peerNickname: action.nickname };

    case 'WAITING_ROOM':
      return { ...state, phase: 'waiting_room', errorReason: null };

    case 'UNAVAILABLE':
      return { ...state, phase: 'error', errorReason: action.reason };

    case 'DESTROYED':
      return { ...initialSession, phase: 'closed' };

    case 'CLOSE':
      return { ...initialSession, phase: 'closed' };

    default:
      return state;
  }
}
