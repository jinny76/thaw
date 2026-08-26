// 创建房间页：生成房间号(数字/中文) + 高熵口令(英文/中文)，展示分享链接，进入聊天室。

import { useMemo, useState } from 'react';
import {
  generateRoomId,
  generateRoomIdZh,
  generatePassphrase,
  generatePassphraseZh,
  defaultNickname,
} from '../crypto/random.js';
import { navigate, buildHostFragment } from './useRoute.js';
import { ChatWindow } from './ChatWindow.js';
import { Avatar } from './Avatar.js';

export function CreatePage() {
  const initialNick = useMemo(() => defaultNickname(), []);
  // 默认用中文（好记、好带外传）；可切换回数字/英文。
  const [roomId, setRoomId] = useState(() => generateRoomIdZh());
  const [passphrase, setPassphrase] = useState(() => generatePassphraseZh());
  const [prefix, setPrefix] = useState('');
  const [nickname, setNickname] = useState(initialNick);
  const [meetTime, setMeetTime] = useState('');
  const [entered, setEntered] = useState(false);

  const regenRoom = (zh: boolean) => setRoomId(zh ? generateRoomIdZh() : generateRoomId());
  const regenPass = (zh: boolean) => setPassphrase(zh ? generatePassphraseZh() : generatePassphrase());

  const [copied, setCopied] = useState<'client' | 'host' | null>(null);

  // 房间号合法性：9 位数字 或 2~16 个中文（与路由正则一致）。
  const roomIdOk = /^(?:\d{9}|[一-鿿]{2,16})$/.test(roomId);
  // 弱口令判断（自定义口令时提醒）：太短 / 纯数字 / 常见弱口令。
  const passWeak =
    passphrase.length < 8 ||
    /^\d+$/.test(passphrase) ||
    /^(password|123456|111111|000000|abcabc|qwerty)/i.test(passphrase);

  const meet = meetTime.trim();
  const shareLink = `${window.location.origin}/${roomId}`;
  const finalNick = nickname.trim() || initialNick;
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
        mode={{
          kind: 'create',
          roomId,
          passphrase: fullPassphrase,
          nickname: finalNick,
          dynPass: passphrase, // 纯动态口令（不含前缀），供退出前补救复制
        }}
      />
    );
  }

  return (
    <main className="gate">
      <pre className="gate__banner">{'> INITIALIZING SECURE CHANNEL...'}</pre>
      <dl className="gate__facts">
        <dt>房间号（可自定义）</dt>
        <dd className="mono">
          <input
            className={`mono gate__input gate__facts-input${roomIdOk ? '' : ' is-bad'}`}
            value={roomId}
            maxLength={16}
            onChange={(e) => setRoomId(e.target.value.trim())}
            aria-label="房间号"
          />
          <span className="gate__gen">
            <button type="button" onClick={() => regenRoom(false)} title="随机数字房间号">
              数字
            </button>
            <button type="button" onClick={() => regenRoom(true)} title="随机中文房间号">
              中文
            </button>
          </span>
        </dd>
        {!roomIdOk && (
          <dd className="gate__warn">{'⚠ 房间号需为 9 位数字，或 2~16 个中文字'}</dd>
        )}
        <dt>分享链接</dt>
        <dd className="mono gate__link">{shareLink}</dd>
        <dt>口令（可自定义，带外发给对方）</dt>
        <dd className="mono gate__pass">
          <input
            className={`mono gate__input gate__facts-input${passWeak ? ' is-bad' : ''}`}
            value={passphrase}
            maxLength={128}
            onChange={(e) => setPassphrase(e.target.value)}
            aria-label="口令"
          />
          <span className="gate__gen">
            <button type="button" onClick={() => regenPass(false)} title="随机英文口令">
              英文
            </button>
            <button type="button" onClick={() => regenPass(true)} title="随机中文口令">
              中文
            </button>
          </span>
        </dd>
        {passWeak && (
          <dd className="gate__warn">
            {'⚠ 口令偏弱（太短/纯数字/常见词），易被爆破。建议用「随机」按钮生成高熵口令。'}
          </dd>
        )}
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
        昵称（可选，留空即用「{initialNick}」）
        <span className="gate__nickrow">
          <Avatar name={finalNick} size={36} />
          <input
            id="nick"
            className="mono gate__input"
            type="text"
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={initialNick}
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
        <button
          type="button"
          className="primary"
          disabled={!roomIdOk || !passphrase}
          onClick={() => setEntered(true)}
        >
          ▸ 立即进入聊天室
        </button>
        <button type="button" onClick={() => navigate('/')}>
          取消
        </button>
      </div>
    </main>
  );
}
