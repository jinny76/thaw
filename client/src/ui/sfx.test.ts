import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as sfx from './sfx.js';

describe('ui/sfx', () => {
  beforeEach(() => {
    sfx.__resetForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sfx.__resetForTest();
  });

  it('默认非静音，setMuted/isMuted 可切换', () => {
    expect(sfx.isMuted()).toBe(false);
    sfx.setMuted(true);
    expect(sfx.isMuted()).toBe(true);
    sfx.setMuted(false);
    expect(sfx.isMuted()).toBe(false);
  });

  it('无 AudioContext 时播放音效不抛异常（安全降级）', () => {
    // jsdom 默认无 AudioContext；确保调用静默跳过。
    vi.stubGlobal('AudioContext', undefined);
    expect(() => {
      sfx.peerJoined();
      sfx.secure();
      sfx.messageIn();
      sfx.peerLeft();
      sfx.sendTick();
    }).not.toThrow();
  });

  it('有 AudioContext 时会创建振荡器并接线播放', () => {
    const started: number[] = [];
    const makeParam = () => ({
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    let oscCount = 0;
    const fakeCtx = {
      state: 'running',
      currentTime: 0,
      resume: vi.fn(),
      destination: {},
      createOscillator: () => {
        oscCount++;
        return {
          type: 'sine',
          frequency: makeParam(),
          connect: (n: unknown) => n,
          start: (t: number) => started.push(t),
          stop: vi.fn(),
        };
      },
      createGain: () => ({
        gain: makeParam(),
        connect: (n: unknown) => n,
      }),
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => fakeCtx),
    );

    sfx.peerJoined(); // 两个 tone → 两个振荡器
    expect(oscCount).toBe(2);
    expect(started.length).toBe(2);
  });

  it('静音时不创建振荡器', () => {
    const createOscillator = vi.fn();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ({
        state: 'running',
        currentTime: 0,
        resume: vi.fn(),
        destination: {},
        createOscillator,
        createGain: vi.fn(),
      })),
    );
    sfx.setMuted(true);
    sfx.messageIn();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('上下文被挂起时会尝试 resume', () => {
    const resume = vi.fn();
    const makeParam = () => ({
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ({
        state: 'suspended',
        currentTime: 0,
        resume,
        destination: {},
        createOscillator: () => ({
          type: 'sine',
          frequency: makeParam(),
          connect: (n: unknown) => n,
          start: vi.fn(),
          stop: vi.fn(),
        }),
        createGain: () => ({ gain: makeParam(), connect: (n: unknown) => n }),
      })),
    );
    sfx.messageIn();
    expect(resume).toHaveBeenCalled();
  });
});
