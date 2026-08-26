import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomManager, type Peer } from './rooms.js';

function fakePeer(id: string): Peer {
  return { id, send: vi.fn(), close: vi.fn() };
}

describe('RoomManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a room and occupies slot A', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const res = rm.createRoom('123456789', a);
    expect(res).toEqual({ ok: true, slot: 'A' });
    expect(rm.hasRoom('123456789')).toBe(true);
    expect(rm.peerCount('123456789')).toBe(1);
  });

  it('rejects duplicate room id (room_taken)', () => {
    const rm = new RoomManager();
    rm.createRoom('123456789', fakePeer('a'));
    const res = rm.createRoom('123456789', fakePeer('a2'));
    expect(res).toEqual({ ok: false, reason: 'room_taken' });
  });

  it('joins into slot B and pairs two peers', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    const res = rm.joinRoom('123456789', b);
    expect(res).toEqual({ ok: true, slot: 'B' });
    expect(rm.peerCount('123456789')).toBe(2);
    expect(rm.getOtherPeer(a)).toBe(b);
    expect(rm.getOtherPeer(b)).toBe(a);
  });

  it('join on unknown room → not_found', () => {
    const rm = new RoomManager();
    expect(rm.joinRoom('999999999', fakePeer('x'))).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('join on full room → full', () => {
    const rm = new RoomManager();
    rm.createRoom('123456789', fakePeer('a'));
    rm.joinRoom('123456789', fakePeer('b'));
    expect(rm.joinRoom('123456789', fakePeer('c'))).toEqual({
      ok: false,
      reason: 'full',
    });
  });

  it('one peer leaving notifies the other via getOtherPeer', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    rm.joinRoom('123456789', b);
    const other = rm.handleDisconnect(a, null);
    expect(other).toBe(b);
    expect(rm.peerCount('123456789')).toBe(1);
  });

  it('a peer can rejoin after leaving (creator leaves, B stays, someone re-enters)', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    rm.joinRoom('123456789', b);
    // A (slot A) 离开，B 仍在
    rm.handleDisconnect(a, null);
    expect(rm.peerCount('123456789')).toBe(1);
    expect(rm.hasRoom('123456789')).toBe(true);
    // 新人（或 A）再进 → 应能填补空出的 slot A
    const a2 = fakePeer('a2');
    const res = rm.joinRoom('123456789', a2);
    expect(res.ok).toBe(true);
    expect(rm.peerCount('123456789')).toBe(2);
    expect(rm.getOtherPeer(b)).toBe(a2);
    expect(rm.getOtherPeer(a2)).toBe(b);
  });

  it('B can rejoin after B leaves while A stays', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    rm.joinRoom('123456789', b);
    rm.handleDisconnect(b, null); // B 离开
    expect(rm.peerCount('123456789')).toBe(1);
    const b2 = fakePeer('b2');
    expect(rm.joinRoom('123456789', b2).ok).toBe(true);
    expect(rm.peerCount('123456789')).toBe(2);
  });

  it('both peers leaving destroys the room', () => {
    const onDestroy = vi.fn();
    const rm = new RoomManager(undefined, onDestroy);
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    rm.joinRoom('123456789', b);
    rm.handleDisconnect(a, null);
    rm.handleDisconnect(b, null);
    expect(rm.hasRoom('123456789')).toBe(false);
    expect(onDestroy).toHaveBeenCalledWith('123456789', 'both_left');
  });

  it('re-joining a destroyed room returns not_found', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    rm.createRoom('123456789', a);
    rm.handleDisconnect(a, null); // sole peer leaves → destroyed
    expect(rm.joinRoom('123456789', fakePeer('b'))).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('destroys room after HANDSHAKE_FAIL_LIMIT failures in window', () => {
    const onDestroy = vi.fn();
    const rm = new RoomManager(undefined, onDestroy);
    rm.createRoom('123456789', fakePeer('a'));
    // 4 failures: not yet destroyed
    for (let i = 0; i < 4; i++) {
      expect(rm.recordHandshakeFailure('123456789')).toBe(false);
    }
    // 5th failure hits the limit
    expect(rm.recordHandshakeFailure('123456789')).toBe(true);
    expect(rm.hasRoom('123456789')).toBe(false);
    expect(onDestroy).toHaveBeenCalledWith('123456789', 'handshake_rate_limit');
  });

  it('auto-destroys a room that nobody joins before idle timeout', () => {
    const onDestroy = vi.fn();
    const rm = new RoomManager(undefined, onDestroy);
    rm.createRoom('123456789', fakePeer('a'));
    // advance past ROOM_IDLE_TIMEOUT_MS
    vi.advanceTimersByTime(10 * 60 * 1000 + 100);
    expect(rm.hasRoom('123456789')).toBe(false);
    expect(onDestroy).toHaveBeenCalledWith('123456789', 'idle_timeout');
  });

  it('reconnect with correct token hash restores the slot', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    rm.joinRoom('123456789', b);
    rm.handleDisconnect(a, 'tokenhash-abc'); // A drops with grace token
    expect(rm.peerCount('123456789')).toBe(1);
    const a2 = fakePeer('a2');
    const res = rm.reconnect('123456789', 'tokenhash-abc', a2);
    expect(res).toEqual({ ok: true, slot: 'A' });
    expect(rm.peerCount('123456789')).toBe(2);
  });

  it('reconnect with wrong token hash is rejected', () => {
    const rm = new RoomManager();
    const a = fakePeer('a');
    const b = fakePeer('b');
    rm.createRoom('123456789', a);
    rm.joinRoom('123456789', b);
    rm.handleDisconnect(a, 'tokenhash-abc');
    const res = rm.reconnect('123456789', 'WRONG', fakePeer('a2'));
    expect(res).toEqual({ ok: false, reason: 'bad_token' });
  });
});
