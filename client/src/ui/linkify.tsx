// 把消息文本中的 URL 渲染成可点击链接 —— 全程用 React 元素/文本节点，
// 绝不 innerHTML（XSS 是 E2EE 的命门）。仅识别 http(s)，新窗口打开并加
// rel="noopener noreferrer nofollow" 防钓鱼/防 referrer 泄露。

import type { ReactNode } from 'react';

// 匹配 http:// 或 https:// 开头的 URL（到空白/中文标点为止）。
const URL_RE = /(https?:\/\/[^\s<>"'）】」，。；！？]+)/g;

/** 仅接受 http/https，其它协议一律当纯文本（防 javascript:/data: 等）。 */
function isSafeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function linkify(text: string): ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1 && isSafeUrl(part)) {
      return (
        <a
          key={i}
          className="msg__link"
          href={part}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
