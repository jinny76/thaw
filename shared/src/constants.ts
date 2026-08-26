// 全局常量 —— 客户端与服务器共享的协议参数。

/** 默认消息存活时长（秒）。到期后从收发双方内存与界面抹除。 */
export const DEFAULT_TTL_SECONDS = 300;

/** 富媒体分块大小（字节），64 KiB。 */
export const CHUNK_SIZE = 64 * 1024;

/** 单个富媒体文件上限（字节），100 MiB。接收端在重组缓冲层强制。
 *  注意：全程内存中转，过大文件会吃内存；短视频/普通文件足够。 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** 房间号位数。 */
export const ROOM_ID_LENGTH = 9;

/** 默认口令最小字符数（前端生成高熵口令时使用）。 */
export const PASSPHRASE_MIN_LENGTH = 20;

/** 服务器 WebSocket 端口。 */
export const SERVER_PORT = 45187;

/** 客户端开发端口。 */
export const CLIENT_PORT = 45273;

/** 恐慌热键：两次 ESC 的判定窗口（毫秒）。 */
export const PANIC_DOUBLE_ESC_WINDOW_MS = 800;

/** 断线重连宽限期（毫秒）。 */
export const RECONNECT_GRACE_MS = 30_000;

/** 房间创建后无人正确加入的自动过期时长（毫秒）。 */
export const ROOM_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** 握手失败限速：窗口内允许的最大失败次数，超过则销毁房间。 */
export const HANDSHAKE_FAIL_LIMIT = 5;

/** 握手失败限速窗口（毫秒）。 */
export const HANDSHAKE_FAIL_WINDOW_MS = 60_000;

/** KDF 迭代次数（PBKDF2 回退用）。 */
export const KDF_ITERATIONS = 600_000;

/** Argon2id 参数（主 KDF，抗 GPU 爆破）。 */
export const ARGON2_MEMORY_KIB = 64 * 1024; // 64 MiB
export const ARGON2_ITERATIONS = 3;
export const ARGON2_PARALLELISM = 1;

/** 同一房间并发富媒体消息数上限（接收端防护）。 */
export const MAX_CONCURRENT_MEDIA = 4;
