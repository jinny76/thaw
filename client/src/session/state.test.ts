import { describe, it, expect } from 'vitest';
import { sessionReducer, initialSession } from './state.js';

describe('sessionReducer', () => {
  it('CREATE moves to creating with roomId', () => {
    const s = sessionReducer(initialSession, { type: 'CREATE', roomId: '123456789' });
    expect(s.phase).toBe('creating');
    expect(s.roomId).toBe('123456789');
  });

  it('JOIN moves to joining', () => {
    const s = sessionReducer(initialSession, { type: 'JOIN', roomId: '123456789' });
    expect(s.phase).toBe('joining');
  });

  it('ROOM_STATE with 1 peer → waiting_peer', () => {
    const s = sessionReducer(
      { ...initialSession, phase: 'creating', roomId: '123456789' },
      { type: 'ROOM_STATE', peers: 1, slot: 'A' },
    );
    expect(s.phase).toBe('waiting_peer');
    expect(s.slot).toBe('A');
  });

  it('ROOM_STATE with 2 peers → connected', () => {
    const s = sessionReducer(initialSession, { type: 'ROOM_STATE', peers: 2, slot: 'B' });
    expect(s.phase).toBe('connected');
    expect(s.peers).toBe(2);
  });

  it('PEER_JOINED → connected', () => {
    const s = sessionReducer(
      { ...initialSession, phase: 'waiting_peer' },
      { type: 'PEER_JOINED' },
    );
    expect(s.phase).toBe('connected');
    expect(s.peers).toBe(2);
  });

  it('PEER_LEFT → waiting_peer and drops secure', () => {
    const s = sessionReducer(
      { ...initialSession, phase: 'connected', peers: 2, secure: true },
      { type: 'PEER_LEFT' },
    );
    expect(s.phase).toBe('waiting_peer');
    expect(s.secure).toBe(false);
  });

  it('UNAVAILABLE → error with reason', () => {
    const s = sessionReducer(initialSession, { type: 'UNAVAILABLE', reason: 'not_found' });
    expect(s.phase).toBe('error');
    expect(s.errorReason).toBe('not_found');
  });

  it('DESTROYED and CLOSE reset to closed', () => {
    expect(sessionReducer(initialSession, { type: 'DESTROYED' }).phase).toBe('closed');
    expect(sessionReducer(initialSession, { type: 'CLOSE' }).phase).toBe('closed');
  });

  it('SECURE sets secure flag', () => {
    const s = sessionReducer(
      { ...initialSession, phase: 'connected' },
      { type: 'SECURE' },
    );
    expect(s.secure).toBe(true);
  });

  it('PEER_NICK stores peer nickname; PEER_LEFT clears it', () => {
    const withNick = sessionReducer(
      { ...initialSession, phase: 'connected', peers: 2 },
      { type: 'PEER_NICK', nickname: '神秘人123456' },
    );
    expect(withNick.peerNickname).toBe('神秘人123456');
    const left = sessionReducer(withNick, { type: 'PEER_LEFT' });
    expect(left.peerNickname).toBeNull();
  });

  it('WAITING_ROOM → 等待房间开启（非错误态）', () => {
    const s = sessionReducer(
      { ...initialSession, phase: 'joining' },
      { type: 'WAITING_ROOM' },
    );
    expect(s.phase).toBe('waiting_room');
    expect(s.errorReason).toBeNull();
  });
});
