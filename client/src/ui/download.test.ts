import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlobUrl } from './download.js';

// 验证下载走「程序化 anchor.click()」而非改动 window.location（后者会导致 SPA
// 卸载并退出聊天室）。同时验证重封装为 octet-stream 强制附件语义。

describe('downloadBlobUrl', () => {
  const origFetch = globalThis.fetch;
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    // fetch(blob:) → 返回一段字节
    globalThis.fetch = vi.fn(async () => ({
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    })) as unknown as typeof fetch;
    URL.createObjectURL = vi.fn(() => 'blob:forced');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = origFetch;
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    vi.restoreAllMocks();
  });

  it('triggers a programmatic download without navigating', async () => {
    const clicked: HTMLAnchorElement[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });
    // 不允许改动 location（会退出聊天室）
    const hrefBefore = window.location.href;

    await downloadBlobUrl('blob:orig', 'secret.bin');

    expect(clicked).toHaveLength(1);
    // 用重封装后的 octet-stream URL 下载，download 属性为原文件名
    expect(clicked[0]!.href).toContain('blob:forced');
    expect(clicked[0]!.download).toBe('secret.bin');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    // 未发生页面导航
    expect(window.location.href).toBe(hrefBefore);
    // anchor 已从 DOM 移除，不留痕
    expect(document.querySelector('a[download]')).toBeNull();

    // 延后 revoke 临时 URL
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:forced');
    clickSpy.mockRestore();
  });

  it('falls back to original url when fetch fails, still no navigation', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('fetch blocked');
    }) as unknown as typeof fetch;
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    const hrefBefore = window.location.href;

    await downloadBlobUrl('blob:orig', 'fallback.bin');

    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.href).toContain('blob:orig');
    expect(window.location.href).toBe(hrefBefore);
  });
});
