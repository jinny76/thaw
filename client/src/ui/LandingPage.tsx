// 落地页：终端式打字机 + glitch logo + 创建房间入口 + 安全理念/免责声明。

import { navigate } from './useRoute.js';
import { useTypewriter } from './useTypewriter.js';

export function LandingPage() {
  const line = useTypewriter('> INITIALIZING SECURE CHANNEL...');

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
      <button type="button" className="primary gate__cta" onClick={() => navigate('/create')}>
        ▸ 创建加密房间
      </button>
      <p className="gate__hint">{'> 无需注册。创建房间后把口令带外发给对方即可。'}</p>

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
