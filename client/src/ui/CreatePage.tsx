// 创建房间页：生成 9 位房间号 + 高熵口令，展示分享链接，进入聊天室。

import { useMemo, useState } from 'react';
import { generateRoomId, generatePassphrase, defaultNickname } from '../crypto/random.js';
import { navigate, buildHostFragment } from './useRoute.js';
import { ChatWindow } from './ChatWindow.js';
import { Avatar } from './Avatar.js';

export function CreatePage() {
  const initial = useMemo(
    () => ({
      roomId: generateRoomId(),
      passphrase: generatePassphrase(),
      nickname: defaultNickname(),
    }),
    [],
  );
  const [roomId] = useState(initial.roomId);
  const [passphrase] = useState(initial.passphrase);
  const [prefix, setPrefix] = useState('');
  const [nickname, setNickname] = useState(initial.nickname);
  const [meetTime, setMeetTime] = useState('');
  const [entered, setEntered] = useState(false);

  const [copied, setCopied] = useState<'client' | 'host' | null>(null);

  const meet = meetTime.trim();
  const shareLink = `${window.location.origin}/${roomId}`;
  const finalNick = nickname.trim() || initial.nickname;
  // 真实密钥 = 前缀 + 动态口令，前缀参与 KDF、永不上网。
  const fullPassphrase = prefix + passphrase;
  // 房主入口链接：口令+昵称放进 fragment(#)，不发往服务器。
  const hostLink = `${shareLink}${buildHostFragment(fullPassphrase, finalNick)}`;

  const copy = (text: string, which: 'client' | 'host') => {
    void navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1600);
  };

  if (entered) {
    return (
      <ChatWindow
        mode={{ kind: 'create', roomId, passphrase: fullPassphrase, nickname: finalNick }}
      />
    );
  }

  return (
    <main className="gate">
      <pre className="gate__banner">{'> INITIALIZING SECURE CHANNEL...'}</pre>
      <dl className="gate__facts">
        <dt>ROOM ID</dt>
        <dd className="mono">{roomId}</dd>
        <dt>分享链接</dt>
        <dd className="mono gate__link">{shareLink}</dd>
        <dt>口令（带外发给对方）</dt>
        <dd className="mono gate__pass">{passphrase}</dd>
        {meet && (
          <>
            <dt>约定联系时间</dt>
            <dd className="mono gate__meet">{meet}</dd>
          </>
        )}
      </dl>
      <label className="gate__label" htmlFor="prefix">
        默契前缀（可选，与对方私下约定）
        <input
          id="prefix"
          className="mono gate__input"
          type="text"
          maxLength={64}
          autoComplete="off"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="例如：咱那事儿-（永不发往IM/服务器）"
        />
      </label>
      {prefix && (
        <p className="gate__hint gate__hint--ok">
          {'> 已启用前缀。IM 上只发上面的口令，前缀你俩心里有数即可。'}
        </p>
      )}
      <label className="gate__label" htmlFor="nick">
        昵称（可选，留空即用「{initial.nickname}」）
        <span className="gate__nickrow">
          <Avatar name={finalNick} size={36} />
          <input
            id="nick"
            className="mono gate__input"
            type="text"
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={initial.nickname}
          />
        </span>
      </label>
      <label className="gate__label" htmlFor="meet">
        约定联系时间（可选，随复制发给对方）
        <input
          id="meet"
          className="mono gate__input"
          type="text"
          maxLength={60}
          value={meetTime}
          onChange={(e) => setMeetTime(e.target.value)}
          placeholder="例如：今晚 8 点 / 周三下午 / 20 分钟后"
        />
      </label>
      <p className="gate__hint">
        {prefix
          ? '> 把「发给对方的链接」和口令发给对方；前缀私下约定、别发 IM。'
          : '> 把「发给对方的链接」和口令通过其它渠道（如微信）发给对方。口令永不发往服务器。'}
      </p>
      <div className="gate__actions">
        <button
          type="button"
          onClick={() =>
            copy(
              `${shareLink}\n口令: ${passphrase}${meet ? `\n联系时间: ${meet}` : ''}`,
              'client',
            )
          }
        >
          {copied === 'client' ? '✓ 已复制' : '复制发给对方的链接'}
        </button>
        <button type="button" onClick={() => copy(hostLink, 'host')}>
          {copied === 'host' ? '✓ 已复制' : '复制我的房主入口'}
        </button>
      </div>
      <p className="gate__hint">
        {'> 「房主入口」含口令(藏在 # 后不上网)，只发给你自己/存书签，打开即以房主身份进房。'}
      </p>
      <div className="gate__actions">
        <button type="button" className="primary" onClick={() => setEntered(true)}>
          ▸ 立即进入聊天室
        </button>
        <button type="button" onClick={() => navigate('/')}>
          取消
        </button>
      </div>
    </main>
  );
}
