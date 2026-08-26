import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createServer, type ThawServer } from './server.js';
import type { ServerToClientFrame } from '@thaw/shared';

// 用真实 WS 连接做集成测试。每个测试起一个临时端口的服务器。

let currentServer: ThawServer | null = null;
let portSeq = 19000;

function startServer(): { server: ThawServer; port: number } {
  const port = portSeq++;
  const server = createServer(port);
  currentServer = server;
  return { server, port };
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextFrame(ws: WebSocket): Promise<ServerToClientFrame> {
  return new Promise((resolve) => {
    ws.once('message', (raw) => resolve(JSON.parse(String(raw)) as ServerToClientFrame));
  });
}

/** 收集接下来的 n 个帧。 */
function collectFrames(ws: WebSocket, n: number): Promise<ServerToClientFrame[]> {
  return new Promise((resolve) => {
    const frames: ServerToClientFrame[] = [];
    const onMsg = (raw: Buffer) => {
      frames.push(JSON.parse(String(raw)) as ServerToClientFrame);
      if (frames.length >= n) {
        ws.off('message', onMsg);
        resolve(frames);
      }
    };
    ws.on('message', onMsg);
  });
}

function send(ws: WebSocket, frame: unknown): void {
  ws.send(JSON.stringify(frame));
}

afterEach(async () => {
  if (currentServer) {
    await currentServer.close();
    currentServer = null;
  }
});

describe('WS relay integration', () => {
  it('pairs two peers: create → join → peer_joined + peers=2', async () => {
    const { port } = startServer();
    const a = await connect(port);
    const b = await connect(port);

    const aState = nextFrame(a);
    send(a, { type: 'create_room', roomId: '100000001' });
    expect(await aState).toMatchObject({ type: 'room_state', peers: 1, slot: 'A' });

    const aFrames = collectFrames(a, 2); // peer_joined + room_state(2)
    const bState = nextFrame(b);
    send(b, { type: 'join_room', roomId: '100000001' });

    expect(await bState).toMatchObject({ type: 'room_state', peers: 2, slot: 'B' });
    const aGot = await aFrames;
    expect(aGot.some((f) => f.type === 'peer_joined')).toBe(true);
    expect(aGot.some((f) => f.type === 'room_state' && f.peers === 2)).toBe(true);

    a.close();
    b.close();
  });

  it('join unknown room → room_unavailable(not_found)', async () => {
    const { port } = startServer();
    const b = await connect(port);
    const got = nextFrame(b);
    send(b, { type: 'join_room', roomId: '999999999' });
    expect(await got).toMatchObject({ type: 'room_unavailable', reason: 'not_found' });
    b.close();
  });

  it('third peer joining a full room → room_unavailable(full)', async () => {
    const { port } = startServer();
    const a = await connect(port);
    const b = await connect(port);
    const c = await connect(port);
    send(a, { type: 'create_room', roomId: '100000002' });
    await nextFrame(a);
    send(b, { type: 'join_room', roomId: '100000002' });
    await nextFrame(b);
    const cGot = nextFrame(c);
    send(c, { type: 'join_room', roomId: '100000002' });
    expect(await cGot).toMatchObject({ type: 'room_unavailable', reason: 'full' });
    a.close();
    b.close();
    c.close();
  });

  it('forwards content frames to the peer without parsing ciphertext', async () => {
    const { port } = startServer();
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'create_room', roomId: '100000003' });
    await nextFrame(a);
    const aFrames = collectFrames(a, 2);
    send(b, { type: 'join_room', roomId: '100000003' });
    await nextFrame(b);
    await aFrames;

    // A sends an opaque encrypted msg; B should receive it byte-for-byte.
    const bGot = nextFrame(b);
    const payload = {
      type: 'msg',
      msgId: 'm1',
      nonce: 'AAAA',
      ciphertext: 'OPAQUE_CIPHERTEXT_ZZZ',
      ttl: 300,
    };
    send(a, payload);
    const received = await bGot;
    expect(received).toMatchObject(payload);

    a.close();
    b.close();
  });

  it('one peer disconnecting notifies the other with peer_left', async () => {
    const { port } = startServer();
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'create_room', roomId: '100000004' });
    await nextFrame(a);
    const aFrames = collectFrames(a, 2);
    send(b, { type: 'join_room', roomId: '100000004' });
    await nextFrame(b);
    await aFrames;

    const aGot = nextFrame(a);
    b.close();
    expect(await aGot).toMatchObject({ type: 'peer_left' });
    a.close();
  });

  it('handshake failures reaching the limit destroy the room (both get room_destroyed)', async () => {
    const { port } = startServer();
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'create_room', roomId: '100000005' });
    await nextFrame(a);
    const aFrames = collectFrames(a, 2);
    send(b, { type: 'join_room', roomId: '100000005' });
    await nextFrame(b);
    await aFrames;

    const aDestroyed = nextFrame(a);
    // 5 handshake_failed frames hit the limit
    for (let i = 0; i < 5; i++) {
      send(a, { type: 'handshake_failed' });
    }
    expect(await aDestroyed).toMatchObject({ type: 'room_destroyed' });
    a.close();
    b.close();
  });

  it('shutdown from an in-room peer destroys the room without killing the process', async () => {
    const { server, port } = startServer();
    const a = await connect(port);
    const b = await connect(port);
    send(a, { type: 'create_room', roomId: '100000006' });
    await nextFrame(a);
    const aFrames = collectFrames(a, 2);
    send(b, { type: 'join_room', roomId: '100000006' });
    await nextFrame(b);
    await aFrames;

    const bDestroyed = nextFrame(b);
    send(a, { type: 'shutdown' });
    expect(await bDestroyed).toMatchObject({ type: 'room_destroyed' });
    // process still alive; room gone
    expect(server.rooms.hasRoom('100000006')).toBe(false);
    a.close();
    b.close();
  });
});
