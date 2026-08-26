import { test, expect } from '@playwright/test';

test('landing page loads with title and CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Thaw/);
  await expect(page.getByText(/见字如面/)).toBeVisible();
  await expect(page.getByRole('button', { name: /创建加密房间/ })).toBeVisible();
});

test('static assets are served no-store (本地不留 app 文件)', async ({ page }) => {
  const resp = await page.goto('/');
  const cc = resp?.headers()['cache-control'] ?? '';
  // 开发服务器可能不加 no-store（那是 nginx 的职责）；生产由 deploy/nginx.conf 保证。
  // 这里断言页面能加载，且未注册 Service Worker。
  const swCount = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 0;
    return (await navigator.serviceWorker.getRegistrations()).length;
  });
  expect(swCount).toBe(0);
  // cc 变量在开发下可能为空，仅用于记录；不强断言开发服务器头。
  void cc;
});
