import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from './useChat.js';

// 轻量 mock WebSocket，驱动 useChat 的连接/消息流。
class MockWS {
  static instances: MockWS[] = [];
  static OPEN = 1;
  readyState = MockWS.OPEN;
  url: string;
  sent: string[] = [];
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    // 立即 open
    queueMicrotask(() => this.emit('open', {}));
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.emit('close', {});
  }
  emit(type: string, ev: unknown) {
    (this.listeners[type] ?? []).forEach((cb) => cb(ev));
  }
  receive(frame: unknown) {
    this.emit('message', { data: JSON.stringify(frame) });
  }
}

describe('useChat', () => {
  beforeEach(() => {
    MockWS.instances = [];
    vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends create_room on open and reaches connected on room_state(2)', async () => {
    const { result } = renderHook(() =>
      useChat({ kind: 'create', roomId: '123456789', passphrase: 'p'.repeat(20), nickname: '神秘人100001' }),
    );
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    const ws = MockWS.instances[0]!;
    await waitFor(() => expect(ws.sent.some((s) => s.includes('create_room'))).toBe(true));

    act(() => ws.receive({ type: 'room_state', roomId: '123456789', peers: 2, slot: 'A' }));
    await waitFor(() => expect(result.current.session.phase).toBe('connected'));
  });

  it('receives a peer msg and adds it to the in-memory list', async () => {
    const { result } = renderHook(() =>
      useChat({ kind: 'join', roomId: '123456789', passphrase: 'p'.repeat(20), nickname: '神秘人100001' }),
    );
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    const ws = MockWS.instances[0]!;
    act(() => ws.receive({ type: 'room_state', roomId: '123456789', peers: 2, slot: 'B' }));

    // PlaintextCrypto: ciphertext 是 base64(明文)
    const ciphertext = btoa(unescape(encodeURIComponent('hello from peer')));
    act(() => ws.receive({ type: 'msg', msgId: 'm1', nonce: '', ciphertext, ttl: 300 }));

    await waitFor(() => {
      expect(result.current.messages.some((m) => m.kind === 'text' && m.text === 'hello from peer')).toBe(
        true,
      );
    });
  });

  it('sendText adds a local message and sends a msg frame', async () => {
    const { result } = renderHook(() =>
      useChat({ kind: 'create', roomId: '123456789', passphrase: 'p'.repeat(20), nickname: '神秘人100001' }),
    );
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    const ws = MockWS.instances[0]!;
    act(() => ws.receive({ type: 'room_state', roomId: '123456789', peers: 2, slot: 'A' }));

    act(() => result.current.sendText('hi there'));
    expect(result.current.messages.some((m) => m.kind === 'text' && m.text === 'hi there')).toBe(true);
    await waitFor(() => expect(ws.sent.some((s) => s.includes('"type":"msg"'))).toBe(true));
  });

  it('room_destroyed clears all messages (退出即焚 via server)', async () => {
    const { result } = renderHook(() =>
      useChat({ kind: 'create', roomId: '123456789', passphrase: 'p'.repeat(20), nickname: '神秘人100001' }),
    );
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    const ws = MockWS.instances[0]!;
    act(() => ws.receive({ type: 'room_state', roomId: '123456789', peers: 2, slot: 'A' }));
    act(() => result.current.sendText('secret'));
    expect(result.current.messages.length).toBe(1);

    act(() => ws.receive({ type: 'room_destroyed' }));
    await waitFor(() => expect(result.current.messages.length).toBe(0));
    expect(result.current.session.phase).toBe('closed');
  });

  it('TTL sweep burns a message after its ttl elapses', async () => {
    const { result } = renderHook(() =>
      useChat({ kind: 'create', roomId: '123456789', passphrase: 'p'.repeat(20), nickname: '神秘人100001' }),
    );
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    const ws = MockWS.instances[0]!;
    act(() => ws.receive({ type: 'room_state', roomId: '123456789', peers: 2, slot: 'A' }));

    // 收到一条 ttl=1s 的消息
    const ciphertext = btoa(unescape(encodeURIComponent('ephemeral')));
    act(() => ws.receive({ type: 'msg', msgId: 'mX', nonce: '', ciphertext, ttl: 1 }));
    await waitFor(() => expect(result.current.messages.length).toBe(1));

    // 真实等待：sweep 每秒跑一次，1s TTL 到期 → 标 burning → 600ms 后移除
    await waitFor(() => expect(result.current.messages.length).toBe(0), { timeout: 4000 });
  });

  it('panicShutdown clears messages and sends shutdown when connected', async () => {
    const { result } = renderHook(() =>
      useChat({ kind: 'create', roomId: '123456789', passphrase: 'p'.repeat(20), nickname: '神秘人100001' }),
    );
    await waitFor(() => expect(MockWS.instances.length).toBe(1));
    const ws = MockWS.instances[0]!;
    act(() => ws.receive({ type: 'room_state', roomId: '123456789', peers: 2, slot: 'A' }));
    act(() => result.current.sendText('secret'));

    act(() => result.current.panicShutdown());
    expect(result.current.messages.length).toBe(0);
    expect(ws.sent.some((s) => s.includes('"type":"shutdown"'))).toBe(true);
  });
});
