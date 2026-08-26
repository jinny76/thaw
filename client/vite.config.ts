import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 端口常量与 shared/src/constants.ts 保持一致（此处不能 import @thaw/shared，
// 因为 vite.config 在 Node 侧于打包前加载，无法解析原始 TS workspace 包）。
const CLIENT_PORT = 45273;
const SERVER_PORT = 45187;

// 静态资源零缓存由部署层（nginx）负责；此处仅配置开发服务器。
// 明确不引入 vite-plugin-pwa / Service Worker（见 ARCHITECTURE §7.1）。

// 允许通过反代访问的域名（vite 会校验 Host 头，否则拦截）。
// 生产域名 + 环境变量 THAW_ALLOWED_HOSTS（逗号分隔）追加。
const allowedHosts = [
  'thaw.kingfisher.live',
  'localhost',
  '127.0.0.1',
  ...(process.env.THAW_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean) ?? []),
];

export default defineConfig({
  plugins: [react()],
  server: {
    // 绑 0.0.0.0，供局域网设备 / nginx 反代访问。
    host: true,
    port: CLIENT_PORT,
    strictPort: true,
    allowedHosts,
    // HMR 走反代时通过 wss 同源；本地开发保持默认。
  },
  preview: {
    host: true,
    port: CLIENT_PORT,
    strictPort: true,
    allowedHosts,
  },
  define: {
    __SERVER_PORT__: JSON.stringify(SERVER_PORT),
    __CLIENT_PORT__: JSON.stringify(CLIENT_PORT),
  },
  build: {
    sourcemap: true,
  },
});
