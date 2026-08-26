// WebSocket 客户端封装。发送前留 encrypt hook、接收后留 decrypt hook，
// 供 phase 6 的 E2EE 接入；phase 3 明文直通。

import type { ClientToServerFrame, ServerToClientFrame } from '@thaw/shared';

export type FrameHandler = (frame: ServerToClientFrame) => void;

export interface WsClientOptions {
  url: string;
  onFrame: FrameHandler;
  onOpen?: () => void;
  onClose?: () => void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly onFrame: FrameHandler;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;

  constructor(opts: WsClientOptions) {
    this.url = opts.url;
    this.onFrame = opts.onFrame;
    this.onOpen = opts.onOpen;
    this.onClose = opts.onClose;
  }

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener('open', () => this.onOpen?.());
    ws.addEventListener('message', (ev) => {
      let frame: ServerToClientFrame;
      try {
        frame = JSON.parse(String(ev.data)) as ServerToClientFrame;
      } catch {
        return;
      }
      this.onFrame(frame);
    });
    ws.addEventListener('close', () => this.onClose?.());
    ws.addEventListener('error', () => {
      /* surfaced via close */
    });
  }

  send(frame: ClientToServerFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

/** 从当前页面推导服务器 WS URL。 */
export function serverWsUrl(): string {
  // 开发：前端 45273，后端 45187。生产：同源 /ws 反代（部署配置）。
  const port =
    typeof __SERVER_PORT__ !== 'undefined' ? __SERVER_PORT__ : 45187;
  if (typeof window === 'undefined') return `ws://localhost:${port}`;
  const { hostname, protocol, port: pagePort } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';

  // 规则：
  //  A) 页面通过前端 dev 端口(45273)直接访问（localhost 或局域网 IP）
  //     → 直连后端端口 45187。
  //  B) 页面通过标准端口/反代（80/443 或无端口）访问
  //     → 走同源 /ws 反代（由 nginx 转发到后端）。
  const viteDevPort =
    typeof __CLIENT_PORT__ !== 'undefined' ? String(__CLIENT_PORT__) : '45273';
  if (pagePort === viteDevPort) {
    // 直连前端端口（本机或局域网 IP）→ 同主机的后端端口
    return `${wsProto}//${hostname}:${port}`;
  }
  // 反代 / 生产：同源 /ws
  return `${wsProto}//${window.location.host}/ws`;
}

declare const __SERVER_PORT__: number | undefined;
declare const __CLIENT_PORT__: number | undefined;
