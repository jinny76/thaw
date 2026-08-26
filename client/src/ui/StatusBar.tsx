// 顶部状态栏（等宽终端风）：房间号 + 加密/在线状态。

import type { SessionPhase } from '../session/state.js';

export function StatusBar({
  roomId,
  peers,
  secure,
  phase,
}: {
  roomId: string | null;
  peers: 0 | 1 | 2;
  secure: boolean;
  phase: SessionPhase;
}) {
  const online = peers === 2;
  return (
    <header className="statusbar">
      <span className="statusbar__room">{roomId ? `ROOM ${roomId}` : 'THAW'}</span>
      <span className={`statusbar__e2ee ${secure ? 'is-on' : 'is-off'}`}>
        {secure ? 'E2EE ACTIVE' : 'E2EE PENDING'}
      </span>
      <span
        className={`statusbar__peer ${online ? 'is-online' : 'is-waiting'}`}
        data-phase={phase}
      >
        {online ? 'PEER ONLINE' : 'PEER —'} · {peers}/2
      </span>
    </header>
  );
}
