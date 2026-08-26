import { describe, it, expect } from 'vitest';
import {
  IpLimiter,
  FrameRateCounter,
  MAX_CONN_PER_IP,
  CREATE_LIMIT,
  MAX_ROOMS_PER_IP,
  FRAME_LIMIT,
  type Clock,
} from './ratelimit.js';

function fakeClock(start = 0): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('IpLimiter 并发连接', () => {
  it('单 IP 超过并发上限后拒绝', () => {
    const l = new IpLimiter();
    for (let i = 0; i < MAX_CONN_PER_IP; i++) {
      expect(l.addConnection('1.2.3.4')).toBe(true);
    }
    expect(l.addConnection('1.2.3.4')).toBe(false); // 超限
    // 不同 IP 不受影响
    expect(l.addConnection('5.6.7.8')).toBe(true);
  });

  it('断开释放名额', () => {
    const l = new IpLimiter();
    for (let i = 0; i < MAX_CONN_PER_IP; i++) l.addConnection('1.2.3.4');
    l.removeConnection('1.2.3.4');
    expect(l.addConnection('1.2.3.4')).toBe(true); // 释放了一个
  });
});

describe('IpLimiter 建房限制', () => {
  it('窗口内建房超速率被拒', () => {
    const clock = fakeClock();
    const l = new IpLimiter(clock);
    for (let i = 0; i < CREATE_LIMIT; i++) {
      expect(l.canCreate('ip')).toBe(true);
      l.recordCreate('ip');
    }
    expect(l.canCreate('ip')).toBe(false); // 速率超限
  });

  it('活跃房间数超上限被拒', () => {
    const l = new IpLimiter();
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
      expect(l.recordJoin('ip')).toBe(true);
    }
    expect(l.recordJoin('ip')).toBe(false); // 房间数超限
    expect(l.canCreate('ip')).toBe(false);
    l.recordLeaveRoom('ip');
    expect(l.recordJoin('ip')).toBe(true); // 释放后可再进
  });

  it('建房速率窗口滑动后恢复', () => {
    const clock = fakeClock();
    const l = new IpLimiter(clock);
    for (let i = 0; i < CREATE_LIMIT; i++) l.recordCreate('ip');
    expect(l.canCreate('ip')).toBe(false);
    clock.advance(61_000); // 超过窗口
    // 房间数仍占用，先释放
    for (let i = 0; i < CREATE_LIMIT; i++) l.recordLeaveRoom('ip');
    expect(l.canCreate('ip')).toBe(true);
  });
});

describe('FrameRateCounter 帧频率', () => {
  it('窗口内超帧数被标记超限', () => {
    const clock = fakeClock();
    const c = new FrameRateCounter(clock);
    for (let i = 0; i < FRAME_LIMIT; i++) {
      expect(c.hit()).toBe(false);
    }
    expect(c.hit()).toBe(true); // 第 FRAME_LIMIT+1 帧超限
  });

  it('窗口滑动后恢复', () => {
    const clock = fakeClock();
    const c = new FrameRateCounter(clock);
    for (let i = 0; i < FRAME_LIMIT + 5; i++) c.hit();
    clock.advance(1100); // 超过 1s 窗口
    expect(c.hit()).toBe(false); // 旧帧过期，恢复
  });
});
