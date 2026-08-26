import { SERVER_PORT } from '@thaw/shared';
import { createServer } from './server.js';

function main(): void {
  const port = Number(process.env.THAW_PORT ?? SERVER_PORT);
  createServer(port);
  // 仅崩溃级/启动级信息，不含房间号/内容/IP。
  // eslint-disable-next-line no-console
  console.warn(`[thaw] relay listening on :${port}`);
}

main();
