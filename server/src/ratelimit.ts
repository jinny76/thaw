// 按 IP 的连接/建房限流 + 防 DoS。纯逻辑，便于单测。
//
// 定位：极小众低频应用，阈值偏紧——正常使用远达不到，脚本狂刷会被挡。
// 服务器仍不存任何用户内容；这里只记「某 IP 此刻的连接/建房计数」这类易失事实。

/** 单 IP 最大并发连接数。 */
export const MAX_CONN_PER_IP = 6;
/** 单 IP 建房速率：窗口内最大建房数。 */
export const CREATE_LIMIT = 3;
export const CREATE_WINDOW_MS = 60_000;
/** 单 IP 同时参与的活跃房间数上限。 */
export const MAX_ROOMS_PER_IP = 3;
/** 单帧最大字节数（富媒体分块 64KiB，留足余量）。 */
export const MAX_FRAME_BYTES = 512 * 1024;
/** 帧频率：窗口内最大帧数。 */
export const FRAME_LIMIT = 80;
export const FRAME_WINDOW_MS = 1000;
/** 心跳：无 pong 超时（毫秒）。 */
export const HEARTBEAT_TIMEOUT_MS = 60_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;

export interface Clock {
  now(): number;
}
const realClock: Clock = { now: () => Date.now() };

interface IpState {
  connections: number;
  createTimes: number[]; // 建房时间戳（滑动窗口）
  rooms: number; // 活跃房间数
}

/** 单连接的帧频率计数（滑动窗口）。 */
export class FrameRateCounter {
  private times: number[] = [];
  constructor(private clock: Clock = realClock) {}
  /** 记录一帧，返回是否超限。 */
  hit(): boolean {
    const now = this.clock.now();
    this.times = this.times.filter((t) => now - t < FRAME_WINDOW_MS);
    this.times.push(now);
    return this.times.length > FRAME_LIMIT;
  }
}

/** 按 IP 的连接/建房限流器。 */
export class IpLimiter {
  private ips = new Map<string, IpState>();

  constructor(private clock: Clock = realClock) {}

  private get(ip: string): IpState {
    let s = this.ips.get(ip);
    if (!s) {
      s = { connections: 0, createTimes: [], rooms: 0 };
      this.ips.set(ip, s);
    }
    return s;
  }

  private gc(ip: string): void {
    const s = this.ips.get(ip);
    if (s && s.connections <= 0 && s.rooms <= 0 && s.createTimes.length === 0) {
      this.ips.delete(ip);
    }
  }

  /** 新连接：返回是否允许（false = 超过并发上限）。 */
  addConnection(ip: string): boolean {
    const s = this.get(ip);
    if (s.connections >= MAX_CONN_PER_IP) return false;
    s.connections += 1;
    return true;
  }

  removeConnection(ip: string): void {
    const s = this.ips.get(ip);
    if (!s) return;
    s.connections = Math.max(0, s.connections - 1);
    this.gc(ip);
  }

  /** 建房：返回是否允许（false = 建房速率或活跃房间数超限）。 */
  canCreate(ip: string): boolean {
    const s = this.get(ip);
    const now = this.clock.now();
    s.createTimes = s.createTimes.filter((t) => now - t < CREATE_WINDOW_MS);
    if (s.createTimes.length >= CREATE_LIMIT) return false;
    if (s.rooms >= MAX_ROOMS_PER_IP) return false;
    return true;
  }

  /** 记录一次成功建房。 */
  recordCreate(ip: string): void {
    const s = this.get(ip);
    s.createTimes.push(this.clock.now());
    s.rooms += 1;
  }

  /** 记录加入房间（占一个活跃房间名额）。 */
  recordJoin(ip: string): boolean {
    const s = this.get(ip);
    if (s.rooms >= MAX_ROOMS_PER_IP) return false;
    s.rooms += 1;
    return true;
  }

  /** 离开房间（释放活跃房间名额）。 */
  recordLeaveRoom(ip: string): void {
    const s = this.ips.get(ip);
    if (!s) return;
    s.rooms = Math.max(0, s.rooms - 1);
    this.gc(ip);
  }

  /** 仅供测试/监控。 */
  connectionCount(ip: string): number {
    return this.ips.get(ip)?.connections ?? 0;
  }
  roomCount(ip: string): number {
    return this.ips.get(ip)?.rooms ?? 0;
  }
}
