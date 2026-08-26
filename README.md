# 雪泥 · Thaw

> 见字如面，过目无痕。Read it. Watch it thaw.

一个不留任何痕迹的端到端加密即时聊天网站。服务器只经手密文、不落盘；消息 5 分钟自毁、退出即焚。

- **完全匿名，无登录**：一方创建房间得 9 位房间号，口令带外传给对方。
- **端到端加密**：口令 + ECDH(P-256) 派生会话密钥，服务器只见密文；口令认证防中间人。
- **收发双方必须同时在线**：不做离线暂存（服务器无消息队列）。
- **富媒体**：文字、图片、语音、文件；截屏 Ctrl+V 贴图、拖拽、移动端相册/拍照/文件/语音。
- **三层焚毁**：消息默认 5 分钟自毁 · 退出即焚 · 连按两次 ESC 恐慌关房。
- **移动端一等公民**：响应式布局、虚拟键盘处理、触屏富媒体入口。
- **暗网/间谍片终端风 UI**：暗底磷光绿、CRT 扫描线、雪化焚毁动效、低调模式开关。

设计详见 [`docs/PRD.md`](docs/PRD.md) 与 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 开发

```bash
npm install       # 安装依赖（npm workspaces monorepo）
npm run dev       # 一键起前端(45273) + 后端 WS(45187)
```

打开 `http://localhost:45273`：
1. 点「创建加密房间」→ 得到 9 位房间号 + 口令 + 分享链接。
2. 复制链接，在另一个标签/设备打开 `http://localhost:45273/<房间号>`。
3. 输入同一口令 → 双方进入聊天室，开始端到端加密聊天。

（本地测试：同一浏览器双开标签即可模拟 A/B。）

## 质量命令

```bash
npm run typecheck   # TS strict 类型检查（全 workspace）
npm run lint        # ESLint（--max-warnings=0）
npm test            # Vitest 单元/集成测试
npm run test:coverage
npm run test:e2e    # Playwright 端到端（桌面 + 移动 viewport）
npm run build       # 构建
```

## 结构

```
shared/   # 跨端协议类型与常量
client/   # React + Vite 前端（crypto / transport / session / messages / media / ui）
server/   # Node + ws 后端中转（内存房间表，零持久化）
e2e/      # Playwright 端到端测试
deploy/   # nginx.conf 部署示例（静态零缓存 + 反爬 + WS 反代）
```

## 部署

把 `client/dist`（`npm run build` 产物）部署到 nginx 的 root，后端 `server` 用 `npm start`（或进程管理器）跑在 45187，参照 [`deploy/nginx.conf`](deploy/nginx.conf)：

- 静态资源 `Cache-Control: no-store` —— 本地不留任何 app 文件（尤其 JS）。
- `X-Robots-Tag: noindex,nofollow,noarchive` + `robots.txt` —— 不被搜索引擎/爬虫收录。
- `/ws` 反代到 Node；关闭 access_log（不记录含 roomId 的 URL）。
- 可选总闸：服务器设 `THAW_ALLOW_PROCESS_KILL=1` 时，恐慌热键才升级为关停整个进程（仅限你独占部署的单圈子场景）；默认只销毁本房间。

## 安全边界（诚实说明）

雪泥保证「**平台自身看不见、不留档**」，**不保证**「内容从物理世界消失」或「对方一定诚实」。完整威胁模型见 [ARCHITECTURE §11](docs/ARCHITECTURE.md)。

**我们防御的（密码学保证）**：服务器读取内容、服务器 MITM/掉包公钥、口令在线/离线爆破、消息篡改/重放、房间劫持、服务器落盘、本地留痕。

**我们防不了的（如实告知）**：

- **元数据**：服务器/网络可见双方 IP、连接时间、消息时刻与频率、密文大小。IP 层需你自行配合 Tor/VPN。
- **前端代码可信性**：这是所有 web E2EE 的根本局限——服务器每次下发前端，理论上可推送被后门的版本。请信任每次下发的前端代码（可自行比对构建产物哈希）。
- **端点安全**：对方截屏/拍照/录像、设备被入侵，均在密码学范围之外。
- **反截屏是威慑，不是保证**：失焦即糊、PrintScreen 焚毁、隐写水印（溯源）只是抬高成本 + 事后追责，**无法阻止系统截图或另一台手机拍屏**。
- **焚毁靠客户端自觉**：TTL 与退出即焚只对诚实客户端有效；改装客户端可留存明文。

## 加密方案

- KDF：PBKDF2-HMAC-SHA256（600k 迭代，salt = SHA-256("thaw:v1:"+房间号)）。可后续换 Argon2id/WASM。
- 密钥交换：X25519 的等价实现 ECDH P-256（Web Crypto 原生、全浏览器支持）。
- 会话密钥：HKDF-SHA256 派生，绑定房间号。
- 消息加密：AES-256-GCM，递增计数器 nonce，AAD 绑定 roomId+类型+msgId。
- 口令认证：HMAC-SHA256 短认证串，常数时间比对，防 MITM。
- 不自造算法，全部基于 Web Crypto 成熟原语。
