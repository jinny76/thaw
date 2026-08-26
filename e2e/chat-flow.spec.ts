import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// 端到端：两个独立浏览器上下文模拟 A / B。
// A 创建房间 → 取房间号+口令 → B 用同口令加入 → 握手 → 收发文字 → 零留痕断言。

async function createRoom(
  page: Page,
  nickname?: string,
): Promise<{ roomId: string; passphrase: string }> {
  await page.goto('/');
  await page.getByRole('button', { name: /创建加密房间/ }).click();
  // 创建页展示 9 位房间号与口令
  const roomId = (await page.getByText(/^\d{9}$/).first().textContent())!.trim();
  // 口令在 gate__pass
  const passphrase = (await page.locator('.gate__pass').textContent())!.trim();
  if (nickname) await page.locator('#nick').fill(nickname);
  await page.getByRole('button', { name: /进入聊天室/ }).click();
  return { roomId, passphrase };
}

async function joinRoom(
  page: Page,
  roomId: string,
  passphrase: string,
  nickname?: string,
): Promise<void> {
  await page.goto(`/${roomId}`);
  await page.getByPlaceholder(/口令/).fill(passphrase);
  if (nickname) await page.locator('#nick').fill(nickname);
  await page.getByRole('button', { name: /解密并进入/ }).click();
}

test('A creates, B joins, E2EE handshake completes and text is exchanged', async ({ browser }) => {
  const ctxA: BrowserContext = await browser.newContext();
  const ctxB: BrowserContext = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  const { roomId, passphrase } = await createRoom(a, '爱丽丝');
  expect(roomId).toMatch(/^\d{9}$/);
  expect(passphrase.length).toBeGreaterThanOrEqual(20);

  // 回归守卫：创建者进入聊天室后不应立刻显示「会话已结束」
  // （StrictMode 双挂载曾导致一进房就自毁）。
  await expect(a.getByText(/会话已结束/)).toHaveCount(0);

  await joinRoom(b, roomId, passphrase, '鲍勃');

  // 双方状态栏应显示 E2EE ACTIVE（握手完成）
  await expect(a.getByText('E2EE ACTIVE')).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText('E2EE ACTIVE')).toBeVisible({ timeout: 15_000 });
  // 加入方也不应显示已结束
  await expect(b.getByText(/会话已结束/)).toHaveCount(0);

  // A 发消息 → B 收到，且 B 侧显示 A 的昵称「爱丽丝」
  const msg = `hello-${Date.now()}`;
  await a.getByLabel('消息输入框').fill(msg);
  await a.getByRole('button', { name: '发送' }).click();
  await expect(b.getByText(msg)).toBeVisible({ timeout: 10_000 });
  await expect(b.getByText('爱丽丝').first()).toBeVisible({ timeout: 10_000 });

  // B 回消息 → A 收到
  const reply = `reply-${Date.now()}`;
  await b.getByLabel('消息输入框').fill(reply);
  await b.getByRole('button', { name: '发送' }).click();
  await expect(a.getByText(reply)).toBeVisible({ timeout: 10_000 });

  // ── 零留痕断言 ──
  for (const page of [a, b]) {
    const storageState = await page.evaluate(() => ({
      localLen: localStorage.length,
      sessionLen: sessionStorage.length,
    }));
    expect(storageState.localLen).toBe(0);
    expect(storageState.sessionLen).toBe(0);

    const swCount = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    expect(swCount).toBe(0);

    const cacheCount = await page.evaluate(async () => {
      if (!('caches' in window)) return 0;
      const keys = await caches.keys();
      return keys.length;
    });
    expect(cacheCount).toBe(0);
  }

  await ctxA.close();
  await ctxB.close();
});

test('joining a non-existent room shows an error', async ({ page }) => {
  await page.goto('/000000001');
  await page.getByPlaceholder(/口令/).fill('any-passphrase-here-1234');
  await page.getByRole('button', { name: /解密并进入/ }).click();
  await expect(page.getByText(/无法进入房间|房间不存在/)).toBeVisible({ timeout: 10_000 });
});
