import { describe, it, expect } from 'vitest';
import {
  generateRoomId,
  generatePassphrase,
  generateRoomIdZh,
  generatePassphraseZh,
  randomId,
} from './random.js';

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

  it('generateRoomIdZh 生成纯中文房间号', () => {
    for (let i = 0; i < 20; i++) {
      const r = generateRoomIdZh();
      expect(r).toMatch(/^[一-鿿]+$/);
      expect(r.length).toBeGreaterThanOrEqual(4); // 至少 3 词 × 2 字
    }
  });

  it('generatePassphraseZh 生成纯汉字口令（无分隔符）', () => {
    const p = generatePassphraseZh();
    expect(p).toMatch(/^[一-鿿]+$/); // 纯汉字，无 · 空格等
    expect(p).not.toContain('·');
    expect(p.length).toBeGreaterThanOrEqual(8); // 至少 5 词 × 2 字 = 10
    expect(generatePassphraseZh()).not.toBe(generatePassphraseZh()); // 随机
  });

  it('中文房间号/口令内部词互不重复（不得重复）', () => {
    // 词表为双字词，按每 2 字切分后应无重复项。
    const splitWords = (s: string) => s.match(/.{2}/gu) ?? [];
    for (let i = 0; i < 100; i++) {
      const idWords = splitWords(generateRoomIdZh());
      expect(new Set(idWords).size).toBe(idWords.length);
      const passWords = splitWords(generatePassphraseZh());
      expect(new Set(passWords).size).toBe(passWords.length);
    }
  });

  it('中文房间号匹配路由正则（可作为 roomId）', () => {
    const ROOMID_RE = /^(?:\d{9}|[一-鿿]{2,16})$/;
    for (let i = 0; i < 10; i++) {
      expect(ROOMID_RE.test(generateRoomIdZh())).toBe(true);
    }
  });

  it('randomId returns hex of expected length', () => {
    expect(randomId(16)).toMatch(/^[0-9a-f]{32}$/);
  });
});
