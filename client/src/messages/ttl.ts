// TTL 焚毁逻辑（纯函数，便于 fake-timers 单测）。
//
// 计时基准用本地时间，不依赖服务器。TTL 从「消息就绪」起算：
//  - 文字消息：创建即就绪，从 createdAt 起算。
//  - 富媒体：传输中不计时（避免大文件没传完就被烧掉），传完(readyAt)才起算。

import type { ChatMessage } from './types.js';

/** 消息是否仍在传输中（富媒体未收齐/未发完）→ 不启动 TTL。 */
export function isTransferring(msg: ChatMessage): boolean {
  if (msg.kind !== 'media') return false;
  // 接收方：未 ready 即接收中；发送方：progress<1 即发送中。
  return !msg.ready || msg.progress < 1;
}

/** TTL 起算时刻：文字为 createdAt；富媒体为传输完成时刻(readyAt)，未完成则无。 */
export function burnStart(msg: ChatMessage): number | null {
  if (msg.kind === 'media') {
    if (isTransferring(msg)) return null; // 传输中，尚不起算
    return msg.readyAt ?? msg.createdAt;
  }
  return msg.createdAt;
}

export function isExpired(msg: ChatMessage, now: number): boolean {
  const start = burnStart(msg);
  if (start === null) return false; // 传输中，永不过期
  return start + msg.ttl * 1000 <= now;
}

/** 返回到期需焚毁的消息 id 列表。 */
export function expiredIds(messages: readonly ChatMessage[], now: number): string[] {
  return messages.filter((m) => isExpired(m, now)).map((m) => m.id);
}

/** 剩余毫秒数（可为负）；传输中返回 Infinity（不倒计时）。 */
export function remainingMs(msg: ChatMessage, now: number): number {
  const start = burnStart(msg);
  if (start === null) return Infinity;
  return start + msg.ttl * 1000 - now;
}
