import { describe, it, expect } from 'vitest';
import { buildHostFragment } from './useRoute.js';

// 直接测 fragment 的编解码往返（parseHostFragment 是内部函数，通过 build+手工解验证）。
function decodeHost(hash: string): { passphrase: string; nickname: string } | null {
  const m = hash.match(/^#host=(.+)$/);
  if (!m) return null;
  const json = decodeURIComponent(
    escape(atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'))),
  );
  const obj = JSON.parse(json) as { p: string; n: string };
  return { passphrase: obj.p, nickname: obj.n };
}

describe('房主入口 fragment', () => {
  it('build → decode 往返一致', () => {
    const frag = buildHostFragment('前缀-DYN-abc123!@#', '神秘人998877');
    expect(frag.startsWith('#host=')).toBe(true);
    const decoded = decodeHost(frag);
    expect(decoded).toEqual({ passphrase: '前缀-DYN-abc123!@#', nickname: '神秘人998877' });
  });

  it('处理中文与特殊字符', () => {
    const frag = buildHostFragment('口令中文测试+/=', '爱丽丝');
    const decoded = decodeHost(frag);
    expect(decoded?.passphrase).toBe('口令中文测试+/=');
    expect(decoded?.nickname).toBe('爱丽丝');
  });

  it('fragment 不含明文口令（已 base64 编码）', () => {
    const frag = buildHostFragment('SECRETPASS', 'nick');
    expect(frag).not.toContain('SECRETPASS');
  });
});
