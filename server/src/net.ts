// 网络辅助：真实 IP 提取（反代后）+ Origin 校验（防跨站 WS 劫持 CSWSH）。

import type { IncomingMessage } from 'node:http';

/** 是否信任反代头（nginx 反代部署时设 THAW_TRUST_PROXY=1）。 */
const TRUST_PROXY = process.env.THAW_TRUST_PROXY === '1';

/** 允许的 Origin 白名单（逗号分隔，空则不校验 Origin —— 仅限本地开发）。 */
const ALLOWED_ORIGINS = (process.env.THAW_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * 提取客户端真实 IP。
 * 反代后：信任 X-Forwarded-For 第一段（nginx 需配置传此头）。
 * 直连：用 socket 远端地址。
 */
export function realIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const xr = req.headers['x-real-ip'];
    if (typeof xr === 'string' && xr.length > 0) return xr.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * 校验 Origin。返回是否放行。
 * 未配置白名单（本地开发）→ 一律放行。
 * 配置了 → 只放行白名单内的 Origin（无 Origin 头也拒，防脚本直连）。
 */
export function checkOrigin(req: IncomingMessage): boolean {
  if (ALLOWED_ORIGINS.length === 0) return true; // 开发：不校验
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return false;
  return ALLOWED_ORIGINS.includes(origin);
}
