// 聊天会话控制器 hook：连接 WS、驱动状态机、管理内存消息表。
// 消息只存 React state，绝不写任何持久化存储。

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DEFAULT_TTL_SECONDS, type ServerToClientFrame } from '@thaw/shared';
import { WsClient, serverWsUrl } from '../transport/ws.js';
import { sessionReducer, initialSession } from './state.js';
import type { ChatMessage, TextMessage, MediaMessage } from '../messages/types.js';
import { expiredIds } from '../messages/ttl.js';
import { randomId } from '../crypto/random.js';
import { buildAad } from '../crypto/aead.js';
import { PlaintextCrypto, type SessionCrypto } from '../crypto/session-crypto.js';
import { EcdhCrypto } from '../crypto/ecdh-crypto.js';
import { Handshake } from './handshake.js';
import {
  MediaReassembler,
  decryptMeta,
  type EncryptedChunk,
} from '../media/chunker.js';
import { OutgoingTransfer, classifyKind } from '../media/transfer.js';
import { readMediaDuration, computeMediaTtl } from '../media/duration.js';
import * as sfx from '../ui/sfx.js';

export type Mode =
  | {
      kind: 'create';
      roomId: string;
      passphrase: string;
      nickname: string;
      /** 发给对方的动态口令（不含前缀），供退出前补救复制。 */
      dynPass?: string;
    }
  | { kind: 'join'; roomId: string; passphrase: string; nickname: string };

export interface ChatController {
  session: ReturnType<typeof sessionReducer>;
  messages: ChatMessage[];
  sendText(text: string): void;
  sendFile(blob: Blob, name: string): Promise<void>;
  leave(): void;
  panicShutdown(): void;
  /** 焚毁一条消息（TTL 到期或手动）。 */
  burn(id: string): void;
}

export function useChat(mode: Mode): ChatController {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const clientRef = useRef<WsClient | null>(null);
  const cryptoRef = useRef<SessionCrypto>(new PlaintextCrypto());
  const handshakeRef = useRef<Handshake | null>(null);
  const slotRef = useRef<'A' | 'B' | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const startedHandshakeRef = useRef(false);
  // 是否已为「对方接入」响过提示音（room_state 与 peer_joined 去重，避免双响）。
  const peerChimeRef = useRef(false);
  // 富媒体接收：msgId → 重组器。
  const reassemblersRef = useRef<Map<string, MediaReassembler>>(new Map());
  // 富媒体发送：msgId → 传输器（保留原文件块，供断点续传）。
  const transfersRef = useRef<Map<string, OutgoingTransfer>>(new Map());

  // 更新某条媒体消息的传输进度。
  const setMediaProgress = useCallback((msgId: string, progress: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.kind === 'media' ? { ...m, progress } : m)),
    );
  }, []);
  // 防止 React 18 StrictMode 开发期双挂载重复连接/误关。
  const connectedOnceRef = useRef(false);
  // 受邀方等待房间开启时的重试计时器。
  const joinRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 停止 join 重试。
  const stopJoinRetry = useCallback(() => {
    if (joinRetryRef.current) {
      clearInterval(joinRetryRef.current);
      joinRetryRef.current = null;
    }
  }, []);

  // 受邀方：房间尚未开启 → 每 2s 重发 join_room，直到成功。
  const startJoinRetry = useCallback(() => {
    if (joinRetryRef.current) return; // 已在重试
    joinRetryRef.current = setInterval(() => {
      const client = clientRef.current;
      if (client?.isOpen && mode.kind === 'join') {
        client.send({ type: 'join_room', roomId: mode.roomId });
      }
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 启动 E2EE 握手（双方均在线时触发一次）。
  const startHandshake = useCallback(() => {
    if (startedHandshakeRef.current) return;
    const client = clientRef.current;
    const slot = slotRef.current;
    if (!client || !slot) return;
    startedHandshakeRef.current = true;

    const hs = new Handshake({
      roomId: mode.roomId,
      passphrase: mode.passphrase,
      slot,
      sendPub: (pubKey) => client.send({ type: 'ecdh_pub', pubKey }),
      sendTag: (tag) => client.send({ type: 'auth_tag', tag }),
    });
    handshakeRef.current = hs;
    void hs.start();
    void hs.result().then((outcome) => {
      if (outcome.status === 'done' && outcome.crypto) {
        cryptoRef.current = outcome.crypto;
        sessionTokenRef.current = outcome.sessionToken ?? null;
        dispatch({ type: 'SECURE' });
        sfx.secure(); // 端到端加密建立成功 → 确认音
        // 握手完成 → 把本端昵称经 E2EE 发给对方（服务器看不到明文）。
        // 昵称是控制消息，不走棘轮（ratchet=false，用稳定会话密钥）。
        void cryptoRef.current
          .encrypt(mode.nickname, buildAad(mode.roomId, 'nick', 'nick'), false)
          .then(({ nonce, ciphertext }) => {
            clientRef.current?.send({ type: 'nick', nonce, ciphertext });
          });
      } else {
        // 握手失败（口令不符或 MITM）：通知服务器限速并断开
        client.send({ type: 'handshake_failed' });
        dispatch({ type: 'UNAVAILABLE', reason: 'bad_passphrase' });
        client.close();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 焚毁一条消息：先标记 burning 播放雪化动效，再于动画结束后移除。
  const burn = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? ({ ...m, status: 'burning' } as ChatMessage) : m)),
    );
    setTimeout(() => {
      setMessages((prev) => {
        const target = prev.find((m) => m.id === id);
        if (target && target.kind === 'media' && target.objectUrl) {
          URL.revokeObjectURL(target.objectUrl);
        }
        return prev.filter((m) => m.id !== id);
      });
    }, 600);
  }, []);

  const handleFrame = useCallback(
    async (frame: ServerToClientFrame) => {
      switch (frame.type) {
        case 'room_state':
          stopJoinRetry(); // 已进入房间，停止等待重试
          slotRef.current = frame.slot;
          dispatch({ type: 'ROOM_STATE', peers: frame.peers, slot: frame.slot });
          if (frame.peers === 2) {
            // 我方后到、对方已在房内 → 视作「对方接入」，响一次提示音。
            if (!peerChimeRef.current) {
              peerChimeRef.current = true;
              sfx.peerJoined();
            }
            startHandshake();
          }
          break;
        case 'peer_joined':
          dispatch({ type: 'PEER_JOINED' });
          // 对方接入（我方先到、对方后进）→ 响一次提示音。
          if (!peerChimeRef.current) {
            peerChimeRef.current = true;
            sfx.peerJoined();
          }
          startHandshake();
          break;
        case 'peer_left':
          dispatch({ type: 'PEER_LEFT' });
          sfx.peerLeft();
          // 对方离开 → 重置握手状态，使其重新进入时能重新握手（否则卡在等待）。
          // 也重置接入提示音标记，使对方重新进入时能再次响。
          peerChimeRef.current = false;
          startedHandshakeRef.current = false;
          handshakeRef.current = null;
          cryptoRef.current = new PlaintextCrypto();
          break;
        case 'room_unavailable':
          // 受邀方先到、房间尚未开启 → 不报错，进入等待并定时重试 join。
          if (mode.kind === 'join' && frame.reason === 'not_found') {
            dispatch({ type: 'WAITING_ROOM' });
            startJoinRetry();
          } else {
            dispatch({ type: 'UNAVAILABLE', reason: frame.reason });
          }
          break;
        case 'room_destroyed':
          dispatch({ type: 'DESTROYED' });
          setMessages([]);
          break;
        case 'ecdh_pub':
          await handshakeRef.current?.onPeerPub(frame.pubKey);
          break;
        case 'auth_tag':
          await handshakeRef.current?.onPeerTag(frame.tag);
          break;
        case 'nick': {
          try {
            const nickname = await cryptoRef.current.decrypt(
              { nonce: frame.nonce, ciphertext: frame.ciphertext },
              buildAad(mode.roomId, 'nick', 'nick'),
            );
            // 限长防滥用，纯文本渲染（无 innerHTML）。
            dispatch({ type: 'PEER_NICK', nickname: nickname.slice(0, 40) });
          } catch {
            // 忽略
          }
          break;
        }
        case 'msg': {
          try {
            const text = await cryptoRef.current.decrypt(
              { nonce: frame.nonce, ciphertext: frame.ciphertext, seq: frame.seq },
              buildAad(mode.roomId, 'msg', frame.msgId),
            );
            const incoming: TextMessage = {
              kind: 'text',
              id: frame.msgId,
              author: 'peer',
              text,
              createdAt: Date.now(),
              ttl: frame.ttl,
              status: 'received',
            };
            setMessages((prev) => [...prev, incoming]);
            sfx.messageIn();
          } catch {
            // 解密失败：忽略该帧（可能是篡改/错口令）
          }
          break;
        }
        case 'media_meta': {
          const crypto = cryptoRef.current;
          if (!(crypto instanceof EcdhCrypto)) break;
          try {
            const meta = await decryptMeta(crypto, frame.msgId, {
              nonce: frame.nonce,
              ciphertext: frame.ciphertext,
            });
            reassemblersRef.current.set(
              frame.msgId,
              new MediaReassembler(crypto, frame.msgId, meta),
            );
            const placeholder: MediaMessage = {
              kind: 'media',
              mediaKind: meta.kind,
              id: frame.msgId,
              author: 'peer',
              name: meta.name,
              mime: meta.mime,
              size: meta.size,
              objectUrl: null,
              ready: false,
              progress: 0,
              readyAt: null,
              createdAt: Date.now(),
              ttl: frame.ttl,
              status: 'received',
            };
            setMessages((prev) => {
              // 重复 meta（续传时对方可能重发）→ 不重复插入。
              if (prev.some((m) => m.id === frame.msgId)) return prev;
              sfx.messageIn();
              return [...prev, placeholder];
            });
          } catch {
            // meta 解密失败：忽略
          }
          break;
        }
        case 'media_chunk': {
          const reasm = reassemblersRef.current.get(frame.msgId);
          if (!reasm) break;
          const enc: EncryptedChunk = {
            seq: frame.seq,
            nonce: frame.nonce,
            ciphertext: frame.ciphertext,
          };
          const err = await reasm.accept(enc);
          if (err) {
            // 作废该富媒体消息
            reassemblersRef.current.delete(frame.msgId);
            setMessages((prev) => prev.filter((m) => m.id !== frame.msgId));
            break;
          }
          // 更新接收进度
          setMediaProgress(frame.msgId, reasm.receivedCount / reasm.totalChunks);
          if (reasm.isComplete) {
            const blob = reasm.toBlob();
            reassemblersRef.current.delete(frame.msgId);
            if (blob) {
              const url = URL.createObjectURL(blob);
              // TTL 沿用发送方 meta 里的值（已含视频时长+30s）；此刻起算。
              const readyAt = Date.now();
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === frame.msgId && m.kind === 'media'
                    ? { ...m, objectUrl: url, ready: true, progress: 1, readyAt }
                    : m,
                ),
              );
            }
          }
          break;
        }
        case 'media_resume': {
          // 对方请求续传缺块 → 由本端对应传输器补发。
          const transfer = transfersRef.current.get(frame.msgId);
          if (transfer) void transfer.resume(frame.missing);
          break;
        }
        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startHandshake],
  );

  useEffect(() => {
    // StrictMode 开发期会挂载→卸载→再挂载。只在首次真正建立一次连接，
    // 避免第一次「假卸载」把刚建立的会话关掉（否则一进房就显示「会话已结束」）。
    if (connectedOnceRef.current) return;
    connectedOnceRef.current = true;

    let everOpened = false;
    const client = new WsClient({
      url: serverWsUrl(),
      onFrame: (f) => void handleFrame(f),
      onOpen: () => {
        everOpened = true;
        if (mode.kind === 'create') {
          dispatch({ type: 'CREATE', roomId: mode.roomId });
          client.send({ type: 'create_room', roomId: mode.roomId });
        } else {
          dispatch({ type: 'JOIN', roomId: mode.roomId });
          client.send({ type: 'join_room', roomId: mode.roomId });
        }
      },
      onClose: () => {
        if (!everOpened) {
          // 从未连上 → 连接失败（反代/后端问题），而非会话结束。
          dispatch({ type: 'UNAVAILABLE', reason: 'connect_failed' });
        } else {
          // 已连上后断开 → 连接丢失。
          dispatch({ type: 'UNAVAILABLE', reason: 'disconnected' });
        }
      },
    });
    clientRef.current = client;
    client.connect();
    // 真正的离开由 leave() 按钮、pagehide/beforeunload、恐慌热键处理；
    // 这里不在 effect cleanup 里关连接，以规避 StrictMode 假卸载误关会话。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 断点续传：定期检查未收齐的富媒体，若停滞则请求对方补发缺块。
  // 适用于同一会话内的丢块/乱序/短暂网络抖动（会话密钥不变）。
  useEffect(() => {
    const lastRecv = new Map<string, number>();
    const iv = setInterval(() => {
      const client = clientRef.current;
      if (!client || !client.isOpen) return;
      for (const [msgId, reasm] of reassemblersRef.current) {
        if (reasm.isComplete || reasm.isFailed) continue;
        const prev = lastRecv.get(msgId);
        const cur = reasm.receivedCount;
        // 若两个检查周期都没进展 → 请求缺块续传
        if (prev !== undefined && prev === cur) {
          const missing = reasm.missingSeqs();
          if (missing.length > 0) {
            client.send({ type: 'media_resume', msgId, missing });
          }
        }
        lastRecv.set(msgId, cur);
      }
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  // ① 定时销毁：每秒扫一遍，到期消息先标 burning 播雪化动效，再移除。
  useEffect(() => {
    const sweep = () => {
      setMessages((prev) => {
        const dead = expiredIds(prev, Date.now()).filter((id) => {
          const m = prev.find((x) => x.id === id);
          return m && m.status !== 'burning';
        });
        if (dead.length === 0) return prev;
        const deadSet = new Set(dead);
        // 标记为 burning 触发动效
        const marked = prev.map((m) =>
          deadSet.has(m.id) ? ({ ...m, status: 'burning' } as ChatMessage) : m,
        );
        // 动画结束后真正移除 + revoke
        setTimeout(() => {
          setMessages((cur) => {
            cur.forEach((m) => {
              if (deadSet.has(m.id) && m.kind === 'media' && m.objectUrl) {
                URL.revokeObjectURL(m.objectUrl);
              }
            });
            return cur.filter((m) => !deadSet.has(m.id));
          });
        }, 600);
        return marked;
      });
    };
    const iv = setInterval(sweep, 1000);
    return () => clearInterval(iv);
  }, []);

  // ② 退出即焚：pagehide/beforeunload 尽力清理（真正保证靠内存随进程释放）。
  useEffect(() => {
    const wipe = () => {
      clientRef.current?.send({ type: 'leave' });
      setMessages((prev) => {
        prev.forEach((m) => {
          if (m.kind === 'media' && m.objectUrl) URL.revokeObjectURL(m.objectUrl);
        });
        return [];
      });
    };
    window.addEventListener('pagehide', wipe);
    window.addEventListener('beforeunload', wipe);
    return () => {
      window.removeEventListener('pagehide', wipe);
      window.removeEventListener('beforeunload', wipe);
    };
  }, []);

  const sendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const client = clientRef.current;
    if (!client) return;
    const msgId = randomId(12);
    const local: TextMessage = {
      kind: 'text',
      id: msgId,
      author: 'me',
      text: trimmed,
      createdAt: Date.now(),
      ttl: DEFAULT_TTL_SECONDS,
      status: 'sent',
    };
    setMessages((prev) => [...prev, local]);
    sfx.sendTick();
    void cryptoRef.current
      .encrypt(trimmed, buildAad(mode.roomId, 'msg', msgId))
      .then(({ nonce, ciphertext, seq }) => {
        client.send({ type: 'msg', msgId, nonce, ciphertext, ttl: DEFAULT_TTL_SECONDS, seq });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendFile = useCallback(async (blob: Blob, name: string) => {
    const client = clientRef.current;
    const crypto = cryptoRef.current;
    if (!client || !(crypto instanceof EcdhCrypto)) return;

    const mediaKind = classifyKind(blob.type || 'application/octet-stream');
    const localUrl = URL.createObjectURL(blob);

    // 预读视频/音频时长 → TTL = 时长 + 30s（保证对方能看完再留）。
    const dur =
      mediaKind === 'video' || mediaKind === 'audio'
        ? await readMediaDuration(localUrl, mediaKind)
        : null;
    const mediaTtl = computeMediaTtl(mediaKind, dur, DEFAULT_TTL_SECONDS);

    let transfer: OutgoingTransfer;
    try {
      transfer = await OutgoingTransfer.create(
        {
          crypto,
          sendMeta: (f) => clientRef.current?.send(f),
          sendChunk: (f) => clientRef.current?.send(f),
          bufferedAmount: () => 0,
          isOpen: () => clientRef.current?.isOpen ?? false,
          onProgress: (sent, total) => setMediaProgress(transfer.msgId, sent / total),
          ttl: mediaTtl, // meta 帧携带此 TTL → 接收方沿用
        },
        blob,
        name,
      );
    } catch {
      URL.revokeObjectURL(localUrl);
      return; // 超限等
    }

    // 本地占位用传输器的 msgId（与对端一致，便于进度/续传对应）。
    // ready=true（本端有文件可播），但 readyAt=null → TTL 待发送完成才起算。
    const localMsg: MediaMessage = {
      kind: 'media',
      mediaKind,
      id: transfer.msgId,
      author: 'me',
      name,
      mime: blob.type || 'application/octet-stream',
      size: blob.size,
      objectUrl: localUrl,
      ready: true,
      progress: 0,
      readyAt: null,
      createdAt: Date.now(),
      ttl: mediaTtl,
      status: 'sent',
    };
    setMessages((prev) => [...prev, localMsg]);
    transfersRef.current.set(transfer.msgId, transfer);
    void transfer.start().then(() => {
      // 发送完成 → 起算 TTL。
      setMessages((prev) =>
        prev.map((m) =>
          m.id === transfer.msgId && m.kind === 'media'
            ? { ...m, progress: 1, readyAt: Date.now() }
            : m,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(() => {
    stopJoinRetry();
    clientRef.current?.send({ type: 'leave' });
    clientRef.current?.close();
    setMessages([]);
    dispatch({ type: 'CLOSE' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panicShutdown = useCallback(() => {
    stopJoinRetry();
    // 本地立即清空
    setMessages((prev) => {
      prev.forEach((m) => {
        if (m.kind === 'media' && m.objectUrl) URL.revokeObjectURL(m.objectUrl);
      });
      return [];
    });
    // 已进聊天室才发 shutdown（服务器再校验一次）
    if (session.phase === 'connected' || session.phase === 'waiting_peer') {
      clientRef.current?.send({ type: 'shutdown' });
    }
    clientRef.current?.close();
    dispatch({ type: 'CLOSE' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase]);

  return { session, messages, sendText, sendFile, leave, panicShutdown, burn };
}
