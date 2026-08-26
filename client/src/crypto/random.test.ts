import { describe, it, expect } from 'vitest';
import { generateRoomId, generatePassphrase, randomId } from './random.js';

describe('crypto/random', () => {
  it('generateRoomId returns 9 digits', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomId()).toMatch(/^\d{9}$/);
    }
  });

  it('generateRoomId is not obviously constant', () => {
    const set = new Set(Array.from({ length: 20 }, () => generateRoomId()));
    expect(set.size).toBeGreaterThan(1);
  });

  it('generatePassphrase is at least 20 chars and high-entropy-ish', () => {
    const p = generatePassphrase();
    expect(p.length).toBeGreaterThanOrEqual(20);
    const another = generatePassphrase();
    expect(p).not.toBe(another);
  });

  it('generatePassphrase honors a larger requested length', () => {
    expect(generatePassphrase(32).length).toBe(32);
  });

  it('randomId returns hex of expected length', () => {
    expect(randomId(16)).toMatch(/^[0-9a-f]{32}$/);
  });
});
