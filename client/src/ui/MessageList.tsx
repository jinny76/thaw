// 消息列表。文本以 {message.text} 文本节点渲染，绝不 innerHTML。

import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../messages/types.js';
import { burnStart } from '../messages/ttl.js';
import { BurnTimer } from './BurnTimer.js';
import { Avatar } from './Avatar.js';
import { linkify } from './linkify.js';
import { Lightbox, type LightboxMedia } from './Lightbox.js';
import { BurnParticles } from './BurnParticles.js';

/** 气泡包裹层：焚毁时测量尺寸并叠加燃烧粒子特效；燃尽条随气泡等宽。 */
function Bubble({
  burning,
  timer,
  children,
}: {
  burning: boolean;
  timer: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (burning && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    }
  }, [burning]);
  return (
    <div className="msg__bubblewrap">
      <div className="msg__bubble" ref={ref}>
        {children}
      </div>
      {timer}
      {burning && size && <BurnParticles width={size.w} height={size.h} />}
    </div>
  );
}

export function MessageList({
  messages,
  onBurn,
  myNickname,
  peerNickname,
}: {
  messages: ChatMessage[];
  onBurn: (id: string) => void;
  myNickname: string;
  peerNickname: string | null;
}) {
  const label = (author: ChatMessage['author']) =>
    author === 'me' ? myNickname : (peerNickname ?? '对方');
  const [viewer, setViewer] = useState<LightboxMedia | null>(null);
  return (
    <>
      <ul className="msglist">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`msg msg--${m.author}${m.status === 'burning' ? ' msg--burning' : ''}${
              m.author === 'me' && m.status === 'sent' ? ' msg--sent' : ''
            }`}
            data-kind={m.kind}
          >
            <span className="msg__head">
              <Avatar name={label(m.author)} size={22} />
              <span className="msg__author">{label(m.author)}</span>
            </span>
            <Bubble
              burning={m.status === 'burning'}
              timer={
                <BurnTimer
                  startAt={burnStart(m)}
                  ttl={m.ttl}
                  mine={m.author === 'me'}
                  onExpire={() => onBurn(m.id)}
                />
              }
            >
              {m.kind === 'text' ? (
                <span className="msg__text">{linkify(m.text)}</span>
              ) : (
                <span className="msg__media">
                  {m.ready && m.objectUrl ? (
                    m.mediaKind === 'image' ? (
                      <button
                        type="button"
                        className="msg__thumbbtn"
                        onClick={() =>
                          setViewer({ kind: 'image', url: m.objectUrl!, name: m.name })
                        }
                        aria-label={`查看图片 ${m.name}`}
                      >
                        <img className="msg__img" src={m.objectUrl} alt={m.name} />
                        <span className="msg__zoom" aria-hidden="true">
                          ⤢
                        </span>
                      </button>
                    ) : m.mediaKind === 'video' ? (
                      <button
                        type="button"
                        className="msg__thumbbtn"
                        onClick={() =>
                          setViewer({ kind: 'video', url: m.objectUrl!, name: m.name })
                        }
                        aria-label={`播放视频 ${m.name}`}
                      >
                        <video
                          className="msg__video"
                          src={m.objectUrl}
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <span className="msg__play" aria-hidden="true">
                          ▶
                        </span>
                      </button>
                    ) : m.mediaKind === 'audio' ? (
                      <audio className="msg__audio" src={m.objectUrl} controls />
                    ) : (
                      <a className="msg__file" href={m.objectUrl} download={m.name}>
                        {`⬇ ${m.name}`}
                      </a>
                    )
                  ) : (
                    <span className="msg__pending">
                      {`◌ 接收中 ${m.name}`}
                      <span className="xfer">
                        <span className="xfer__bar" style={{ width: `${m.progress * 100}%` }} />
                        <span className="xfer__pct">{Math.round(m.progress * 100)}%</span>
                      </span>
                    </span>
                  )}
                </span>
              )}
              {/* 己方发送进度（未发完时显示）*/}
              {m.kind === 'media' && m.author === 'me' && m.progress < 1 && (
                <span className="xfer xfer--send">
                  <span className="xfer__bar" style={{ width: `${m.progress * 100}%` }} />
                  <span className="xfer__pct">{`发送中 ${Math.round(m.progress * 100)}%`}</span>
                </span>
              )}
            </Bubble>
          </li>
        ))}
      </ul>
      {viewer && <Lightbox media={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}
