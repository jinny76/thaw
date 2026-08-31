// 落地页：终端式打字机 + glitch logo + 统一进房入口 + 安全理念/免责声明。
// 统一入口：填房间号 + 口令即可「进入」——房间不存在则创建、已存在则加入，
// 用户无需区分「创建」还是「加入」。想要高熵随机号/口令可点「随机生成」进创建页。

import { useMemo, useState, type FormEvent } from 'react';
import { navigate } from './useRoute.js';
import { useTypewriter } from './useTypewriter.js';
import { ChatWindow } from './ChatWindow.js';
import { defaultNickname } from '../crypto/random.js';
import { Avatar } from './Avatar.js';

// 合法房间号：9 位数字，或 2~16 个中文字符（与路由/创建页正则一致）。
const ROOMID_RE = /^(?:\d{9}|[一-鿿]{2,16})$/;

export function LandingPage() {
  const line = useTypewriter('> INITIALIZING SECURE CHANNEL...');
  const initialNick = useMemo(() => defaultNickname(), []);

  const [roomId, setRoomId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [nickname, setNickname] = useState(initialNick);
  const [entered, setEntered] = useState(false);

  const roomIdOk = ROOMID_RE.test(roomId);
  const canEnter = roomIdOk && passphrase.length > 0;
  const finalNick = nickname.trim() || initialNick;
  // 真实密钥 = 前缀 + 口令，前缀参与 KDF、永不上网。
  const fullPassphrase = prefix + passphrase;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canEnter) setEntered(true);
  };

  if (entered) {
    // 统一以 create 模式发起：服务器若报房间已占用，useChat 会自动改为 join，
    // 于是「号+口令相符 → 直接进入同一房间」，创建者刷新重进也能重新握手。
    return (
      <ChatWindow
        mode={{
          kind: 'create',
          roomId,
          passphrase: fullPassphrase,
          nickname: finalNick,
          dynPass: passphrase, // 纯口令（不含前缀），供退出前补救复制给对方
        }}
      />
    );
  }

  return (
    <main className="gate gate--landing">
      <div className="crt" aria-hidden="true" />
      <h1 className="gate__logo" data-glitch="THAW">
        雪泥 · THAW
      </h1>
      <p className="gate__tagline">{'见字如面，过目无痕。 // Read it. Watch it thaw.'}</p>
      <pre className="gate__banner" aria-label="INITIALIZING SECURE CHANNEL">
        {line}
        <span className="cursor">▋</span>
      </pre>

      {/* ── 统一进房入口：填号+口令即进 ── */}
      <form className="gate__form gate__enter" onSubmit={submit}>
        <label className="gate__label" htmlFor="landing-room">
          房间号（9 位数字 或 2~16 个中文）
        </label>
        <input
          id="landing-room"
          className={`mono gate__input${roomId && !roomIdOk ? ' is-bad' : ''}`}
          type="text"
          autoComplete="off"
          maxLength={16}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.trim())}
          placeholder="与对方约定的房间号"
        />
        {roomId && !roomIdOk && (
          <p className="gate__warn">{'⚠ 房间号需为 9 位数字，或 2~16 个中文字'}</p>
        )}
        <label className="gate__label" htmlFor="landing-prefix">
          默契前缀（可选，与对方私下约定）
        </label>
        <input
          id="landing-prefix"
          className="mono gate__input"
          type="password"
          autoComplete="off"
          maxLength={64}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="不来自 IM 的私下约定（可留空）"
        />
        <label className="gate__label" htmlFor="landing-pass">
          口令（与对方带外约定一致）
        </label>
        <input
          id="landing-pass"
          className="mono gate__input"
          type="password"
          autoComplete="off"
          maxLength={128}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="创建方带外发给你的口令"
        />
        <label className="gate__label" htmlFor="landing-nick">
          昵称（可选，留空即用「{initialNick}」）
        </label>
        <span className="gate__nickrow">
          <Avatar name={finalNick} size={36} />
          <input
            id="landing-nick"
            className="mono gate__input"
            type="text"
            maxLength={40}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={initialNick}
          />
        </span>
        <div className="gate__actions gate__actions--enter">
          <button type="submit" className="primary" disabled={!canEnter}>
            ▸ 进入加密房间
          </button>
          <button type="button" onClick={() => navigate('/create')}>
            随机生成号 / 口令
          </button>
        </div>
      </form>
      <p className="gate__hint">
        {'> 房间不存在即自动创建、已存在即加入；号+口令相符即进同一房间。口令永不发往服务器。'}
      </p>

      {/* ── 安全理念 ── */}
      <section className="creed">
        <h2 className="creed__title">{'// 安全理念'}</h2>
        <p className="creed__lead">
          雪泥的安全由密码学保证，而非「平台承诺不看」。服务器只经手密文，看不见你的内容。
        </p>
        <ul className="creed__list">
          <li>
            <b>端到端加密</b>：口令 + ECDH 派生密钥，明文永不离开你的浏览器，服务器只见密文。
          </li>
          <li>
            <b>零存储</b>：服务器纯内存中转，不落盘、不写日志、无历史接口。收发双方须同时在线。
          </li>
          <li>
            <b>阅后即焚</b>：消息定时自毁、退出即焚、连按两次 ESC 恐慌关房，本地不留痕。
          </li>
          <li>
            <b>完全匿名</b>：无需注册、无账号，用一次性房间号 + 带外口令发起对话。
          </li>
        </ul>
      </section>

      {/* ── 免责声明（诚实边界）── */}
      <details className="disclaimer">
        <summary className="disclaimer__summary">{'// 免责声明 · 诚实的安全边界（点击展开）'}</summary>
        <div className="disclaimer__body">
          <p>
            技术上不存在「绝对安全」。雪泥保证「<b>平台自身看不见、不留档</b>」，但<b>不保证</b>
            「内容从物理世界消失」或「对方一定诚实」。以下情形不在密码学保护范围内，请知悉：
          </p>
          <ul>
            <li>
              <b>元数据</b>：服务器/网络可见双方 IP、连接时间、消息收发时刻与频率、密文大小。IP
              层请自行配合 Tor/VPN。
            </li>
            <li>
              <b>前端可信性</b>：这是所有网页端到端加密的根本局限——服务器每次下发前端，理论上可推送被后门的版本。请信任每次下发的代码。
            </li>
            <li>
              <b>端点安全</b>：对方截屏、拍照、用另一台设备录像，或你我的设备被入侵（键盘记录、内存取证），均无法由本产品阻止。
            </li>
            <li>
              <b>反截屏是威慑非保证</b>：失焦模糊、隐写水印只能抬高成本 + 事后溯源，无法阻止系统截图。
            </li>
            <li>
              <b>焚毁靠客户端自觉</b>：定时焚毁与退出即焚只对诚实客户端有效；改装的客户端可能留存明文。
            </li>
          </ul>
          <p className="disclaimer__final">
            使用雪泥即表示你理解并接受上述边界。请勿依赖本产品传输可能危及人身安全的信息。
          </p>
        </div>
      </details>
    </main>
  );
}
