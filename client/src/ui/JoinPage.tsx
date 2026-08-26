// 加入页：从路径取 roomId，输入口令后进入聊天室。

import { useMemo, useState, type FormEvent } from 'react';
import { ChatWindow } from './ChatWindow.js';
import { defaultNickname } from '../crypto/random.js';
import { Avatar } from './Avatar.js';
import { AccessGranted } from './AccessGranted.js';
import { navigate } from './useRoute.js';

export function JoinPage({ roomId }: { roomId: string }) {
  const fallbackNick = useMemo(() => defaultNickname(), []);
  const [prefix, setPrefix] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [nickname, setNickname] = useState(fallbackNick);
  const [stage, setStage] = useState<'form' | 'granting' | 'entered'>('form');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    setStage('granting');
  };

  const finalNick = nickname.trim() || fallbackNick;
  // 真实密钥 = 前缀 + 动态口令，须与创建方一致。
  const fullPassphrase = prefix + passphrase;

  if (stage === 'granting') {
    return <AccessGranted onDone={() => setStage('entered')} />;
  }
  if (stage === 'entered') {
    return (
      <ChatWindow
        mode={{ kind: 'join', roomId, passphrase: fullPassphrase, nickname: finalNick }}
      />
    );
  }

  return (
    <main className="gate">
      <pre className="gate__banner">{`> ACCESS ROOM ${roomId}`}</pre>
      <form className="gate__form" onSubmit={submit}>
        <label className="gate__label" htmlFor="prefix">
          默契前缀（若创建者设了，须一致；没设则留空）
        </label>
        <input
          id="prefix"
          className="mono gate__input"
          type="password"
          autoComplete="off"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="与对方私下约定的前缀（不来自 IM）"
        />
        <label className="gate__label" htmlFor="pass">
          输入口令
        </label>
        <input
          id="pass"
          className="mono gate__input"
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="创建者带外发给你的口令"
        />
        <label className="gate__label" htmlFor="nick">
          昵称（可选，留空即用「{fallbackNick}」）
        </label>
        <span className="gate__nickrow">
          <Avatar name={finalNick} size={36} />
          <input
            id="nick"
            className="mono gate__input"
            type="text"
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={fallbackNick}
          />
        </span>
        <div className="gate__actions">
          <button type="submit" className="primary" disabled={!passphrase}>
            解密并进入
          </button>
          <button type="button" onClick={() => navigate('/')}>
            ← 返回首页
          </button>
        </div>
      </form>
      <p className="gate__hint">
        {'> 前缀+口令 在本地拼合并派生密钥，均不发往服务器。若前缀不对，握手会失败。'}
      </p>
    </main>
  );
}
