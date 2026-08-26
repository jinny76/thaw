import { describe, it, expect } from 'vitest';
import { isExpired, expiredIds, remainingMs } from './ttl.js';
import type { ChatMessage } from './types.js';

function textMsg(id: string, createdAt: number, ttl: number): ChatMessage {
  return { kind: 'text', id, author: 'me', text: 'x', createdAt, ttl, status: 'sent' };
}

describe('TTL burn logic', () => {
  it('message is not expired before ttl elapses', () => {
    const m = textMsg('a', 1_000, 300);
    expect(isExpired(m, 1_000 + 299_000)).toBe(false);
  });

  it('message is expired exactly at ttl', () => {
    const m = textMsg('a', 1_000, 300);
    expect(isExpired(m, 1_000 + 300_000)).toBe(true);
  });

  it('expiredIds returns only elapsed messages', () => {
    const now = 1_000_000;
    const msgs = [
      textMsg('old', now - 301_000, 300), // expired
      textMsg('fresh', now - 10_000, 300), // alive
      textMsg('exact', now - 300_000, 300), // expired (==)
    ];
    expect(expiredIds(msgs, now).sort()).toEqual(['exact', 'old']);
  });

  it('remainingMs counts down', () => {
    const m = textMsg('a', 1_000, 300);
    expect(remainingMs(m, 1_000)).toBe(300_000);
    expect(remainingMs(m, 1_000 + 150_000)).toBe(150_000);
    expect(remainingMs(m, 1_000 + 400_000)).toBeLessThan(0);
  });

  it('default ttl of 300s burns after 5 minutes', () => {
    const m = textMsg('a', 0, 300);
    expect(isExpired(m, 5 * 60 * 1000 - 1)).toBe(false);
    expect(isExpired(m, 5 * 60 * 1000)).toBe(true);
  });
});

describe('富媒体 TTL：传输中不焚毁，收完才起算', () => {
  function mediaMsg(over: Partial<ChatMessage> = {}): ChatMessage {
    return {
      kind: 'media',
      mediaKind: 'video',
      id: 'v1',
      author: 'peer',
      name: 'v.mp4',
      mime: 'video/mp4',
      size: 999,
      objectUrl: null,
      ready: false,
      progress: 0,
      readyAt: null,
      createdAt: 0,
      ttl: 30,
      status: 'received',
      ...over,
    } as ChatMessage;
  }

  it('传输中（未 ready）永不过期，即使超过 ttl', () => {
    const m = mediaMsg({ ready: false, progress: 0.5, readyAt: null });
    // 创建后过了很久，但仍在传 → 不焚毁
    expect(isExpired(m, 10 * 60 * 1000)).toBe(false);
  });

  it('收完后从 readyAt 起算 ttl', () => {
    const readyAt = 100_000;
    const m = mediaMsg({ ready: true, progress: 1, readyAt, ttl: 30 });
    expect(isExpired(m, readyAt + 30_000 - 1)).toBe(false);
    expect(isExpired(m, readyAt + 30_000)).toBe(true);
  });

  it('大文件传 60s 才收完，不会中途被 30s ttl 烧掉', () => {
    // createdAt=0，传输 60s；期间 isExpired 恒 false
    const transferring = mediaMsg({ createdAt: 0, ready: false, progress: 0.8, readyAt: null });
    expect(isExpired(transferring, 60_000)).toBe(false);
    // 60s 收完 → readyAt=60000，从此再算 30s
    const done = mediaMsg({ createdAt: 0, ready: true, progress: 1, readyAt: 60_000, ttl: 30 });
    expect(isExpired(done, 60_000 + 29_000)).toBe(false);
    expect(isExpired(done, 60_000 + 30_000)).toBe(true);
  });
});
