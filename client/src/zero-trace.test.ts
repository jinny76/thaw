import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 「零留痕」静态审计：扫描 client/src 源码，断言无本地存储/SW/PWA/Math.random/innerHTML。
// 这是把「不留痕」承诺变成可执行断言。

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

const srcRoot = join(process.cwd(), 'client', 'src');
const files = walk(srcRoot);

/** 去掉行注释与块注释，只留可执行代码。 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('零留痕静态审计（client/src）', () => {
  it('不使用 localStorage / sessionStorage / IndexedDB', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('不注册 Service Worker / 不引入 PWA', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/serviceWorker\.register|workbox|vite-plugin-pwa/.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('不使用 innerHTML / dangerouslySetInnerHTML', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/innerHTML|dangerouslySetInnerHTML/.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('不使用 Math.random（随机一律 crypto.getRandomValues）', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/Math\.random/.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('index.html 含反爬 robots meta 与 CSP', () => {
    const html = readFileSync(join(process.cwd(), 'client', 'index.html'), 'utf8');
    expect(html).toMatch(/name="robots"[^>]*noindex/);
    expect(html).toMatch(/Content-Security-Policy/);
    expect(html).toMatch(/script-src 'self'/);
  });
});
