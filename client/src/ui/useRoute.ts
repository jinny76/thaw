// 极简路径路由：'/' → 创建页；'/:roomId'(9位数字) → 加入/聊天页。
// 不引第三方路由库，减小包体（静态资源零缓存下体积敏感）。

import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  roomId: string | null;
  /** 房主入口：fragment 里携带的口令/昵称（#host=...），不发往服务器。 */
  host: { passphrase: string; nickname: string } | null;
}

function parseHostFragment(hash: string): Route['host'] {
  // 形如 #host=<base64url(JSON{p,n})>
  const m = hash.match(/^#host=(.+)$/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'))));
    const obj = JSON.parse(json) as { p: string; n: string };
    if (typeof obj.p === 'string' && typeof obj.n === 'string') {
      return { passphrase: obj.p, nickname: obj.n };
    }
  } catch {
    /* 无效 fragment，忽略 */
  }
  return null;
}

function parse(pathname: string, hash: string): Route {
  const m = pathname.match(/^\/(\d{9})$/);
  return { path: pathname, roomId: m ? m[1]! : null, host: parseHostFragment(hash) };
}

/** 生成房主入口 fragment（口令+昵称打包进 #，永不上网）。 */
export function buildHostFragment(passphrase: string, nickname: string): string {
  const json = JSON.stringify({ p: passphrase, n: nickname });
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#host=${b64}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parse(
      typeof window === 'undefined' ? '/' : window.location.pathname,
      typeof window === 'undefined' ? '' : window.location.hash,
    ),
  );

  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.pathname, window.location.hash));
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  return route;
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
