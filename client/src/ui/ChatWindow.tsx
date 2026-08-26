// 聊天窗（phase 3 基础版；间谍风精修在 phase 8）。
// 消息内容一律以文本节点渲染 —— 绝不 innerHTML/dangerouslySetInnerHTML（XSS 防线）。

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import type { Mode } from '../session/useChat.js';
import { useChat } from '../session/useChat.js';
import { usePanicKey } from './usePanicKey.js';
import { useAntiCapture } from './useAntiCapture.js';
import { useBackGuard } from './useBackGuard.js';
import { MessageList } from './MessageList.js';
import { StatusBar } from './StatusBar.js';
import { Composer } from './Composer.js';
import { Watermark } from './Watermark.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { navigate } from './useRoute.js';

export function ChatWindow({ mode }: { mode: Mode }) {
  const chat = useChat(mode);
  usePanicKey(chat.panicShutdown);
  // PrintScreen → 焚毁所有可见消息（威慑）。
  const { obscured } = useAntiCapture({
    onPrintScreen: () => chat.messages.forEach((m) => chat.burn(m.id)),
  });

  // 拦截移动端边缘返回手势/浏览器返回，防误触退出（退出即焚、无法重进）。
  const [confirmExit, setConfirmExit] = useState(false);
  const inRoom =
    chat.session.phase !== 'closed' && chat.session.phase !== 'error';
  const onBackAttempt = useCallback(() => setConfirmExit(true), []);
  const { release } = useBackGuard(inRoom, onBackAttempt);
  // 隐写水印标识（房间号后几位，仅本会话可见）。
  const wmLabel = useMemo(() => `THAW·${mode.roomId.slice(-4)}`, [mode.roomId]);

  // 虚拟键盘遮挡处理：用 visualViewport 高度驱动底部内边距。
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length]);

  // 截屏贴图：从剪贴板取 image/* 直接走图片通道。
  const onPaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) chat.sendFile(file, file.name || `paste-${Date.now()}.png`);
      }
    }
  };

  // 拖拽发送：drop 图片/文件。
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files) for (const f of Array.from(files)) chat.sendFile(f, f.name);
  };

  const { session } = chat;

  return (
    <div
      className={`chat${dragOver ? ' chat--dragover' : ''}`}
      style={{ paddingBottom: kbInset }}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="crt" aria-hidden="true" />
      <Watermark label={wmLabel} />
      <StatusBar
        roomId={session.roomId}
        peers={session.peers}
        secure={session.secure}
        phase={session.phase}
      />
      <div className={`chat__body${obscured ? ' chat__body--obscured' : ''}`}>
        {session.phase === 'error' && (
          <div className="chat__terminal">
            <p className="chat__notice chat__notice--err">
              {session.errorReason === 'bad_passphrase'
                ? '> 口令错误或连接不安全，已断开。'
                : `> 无法进入房间：${errorText(session.errorReason)}`}
            </p>
            <button type="button" className="primary" onClick={() => navigate('/')}>
              ← 返回首页
            </button>
          </div>
        )}
        {session.phase === 'waiting_room' && (
          <p className="chat__notice">
            {'> 房间尚未开启，正在等待主人创建… 一旦开启将自动进入。'}
            <span className="cursor">▋</span>
          </p>
        )}
        {(session.phase === 'waiting_peer' || session.phase === 'joining') && (
          <p className="chat__notice">{'> 等待对方进入…'}</p>
        )}
        {session.phase === 'connected' && !session.secure && (
          <p className="chat__notice">{'> DECRYPTING… 正在建立端到端加密…'}</p>
        )}
        {session.phase === 'closed' && (
          <div className="chat__terminal">
            <p className="chat__notice">{'> 会话已结束，所有消息已焚毁。'}</p>
            <button type="button" className="primary" onClick={() => navigate('/')}>
              ← 返回首页
            </button>
          </div>
        )}
        <MessageList
          messages={chat.messages}
          onBurn={chat.burn}
          myNickname={mode.nickname}
          peerNickname={session.peerNickname}
        />
        <div ref={endRef} />
      </div>
      <Composer
        disabled={session.phase !== 'connected' || !session.secure}
        onSend={chat.sendText}
        onSendFile={chat.sendFile}
        onLeave={() => setConfirmExit(true)}
      />
      {confirmExit && (
        <ConfirmDialog
          title="退出聊天室？"
          message="退出后本端所有消息立即焚毁，房间可能销毁、无法重新进入。确定要退出吗？"
          confirmText="退出并焚毁"
          cancelText="留在此处"
          danger
          onConfirm={() => {
            setConfirmExit(false);
            chat.leave();
            release(); // 放行真正的返回
          }}
          onCancel={() => setConfirmExit(false)}
        />
      )}
    </div>
  );
}

function errorText(reason: string | null): string {
  switch (reason) {
    case 'not_found':
      return '房间不存在或已销毁';
    case 'full':
      return '房间已满';
    case 'destroyed':
      return '房间已销毁';
    case 'rate_limited':
      return '尝试过多，房间已锁定';
    case 'bad_token':
      return '重连凭证无效';
    case 'connect_failed':
      return '无法连接服务器（检查网络 / nginx 的 /ws 反代是否配好）';
    case 'disconnected':
      return '与服务器的连接已断开';
    default:
      return reason ?? '未知原因';
  }
}
