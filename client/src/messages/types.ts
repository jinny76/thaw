// 内存消息模型。消息只存于 React state，绝不写 localStorage/IndexedDB。

import type { MediaKind } from '@thaw/shared';

export type MessageAuthor = 'me' | 'peer';

export type MessageStatus = 'sending' | 'sent' | 'received' | 'burning';

export interface TextMessage {
  kind: 'text';
  id: string;
  author: MessageAuthor;
  text: string;
  /** 本地接收/发送时间（毫秒），焚毁计时基准。 */
  createdAt: number;
  /** 存活时长（秒）。 */
  ttl: number;
  status: MessageStatus;
}

export interface MediaMessage {
  kind: 'media';
  mediaKind: MediaKind;
  id: string;
  author: MessageAuthor;
  /** 展示用文件名。 */
  name: string;
  mime: string;
  size: number;
  /** 重组后的对象 URL（渲染用）；焚毁时 revoke。 */
  objectUrl: string | null;
  /** 富媒体是否已收齐/可用。 */
  ready: boolean;
  /** 传输进度 0..1（发送=已发/总，接收=已收/总）。ready 后为 1。 */
  progress: number;
  /** 传输完成时刻（TTL 从此起算）；传输中为 null。 */
  readyAt: number | null;
  createdAt: number;
  ttl: number;
  status: MessageStatus;
}

export type ChatMessage = TextMessage | MediaMessage;

export interface SystemEvent {
  id: string;
  text: string;
  at: number;
}
