// 音效 —— 纯 Web Audio 合成，零资源/零网络/零存储。
// 间谍终端风：短促的电子提示音，用振荡器 + 增益包络实时合成，
// 不加载任何音频文件（不违反 CSP、不产生网络请求、不留本地缓存）。
//
// 静音开关只存内存变量（刷新即复位默认开启）——不写 localStorage，符合零留痕约束。

type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface Tone {
  /** 频率（Hz）。可给数组表示依次滑到的音高（简单音序）。 */
  freq: number | number[];
  /** 起始时间偏移（秒，相对本次播放起点）。 */
  at: number;
  /** 持续时长（秒）。 */
  dur: number;
  type?: OscType;
  /** 峰值音量（0..1），默认 0.15，克制不刺耳。 */
  gain?: number;
}

let ctx: AudioContext | null = null;
let muted = false;

/** 是否处于静音。 */
export function isMuted(): boolean {
  return muted;
}

/** 设置静音（仅内存，不持久化）。 */
export function setMuted(v: boolean): void {
  muted = v;
}

/** 惰性拿到 AudioContext；不可用时返回 null（如 SSR/测试环境）。 */
function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window !== 'undefined'
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** 播放一组 tone 组成的短音效。静音或环境不支持时静默跳过。 */
function play(tones: Tone[]): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  // 自动恢复被浏览器挂起的上下文（需用户已有交互，进房前的点击已满足）。
  if (ac.state === 'suspended') void ac.resume();

  const t0 = ac.currentTime;
  for (const tone of tones) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = tone.type ?? 'sine';

    const start = t0 + tone.at;
    const end = start + tone.dur;
    const peak = tone.gain ?? 0.15;

    const freqs = Array.isArray(tone.freq) ? tone.freq : [tone.freq];
    osc.frequency.setValueAtTime(freqs[0]!, start);
    if (freqs.length > 1) {
      // 在整段时长内线性滑过后续音高。
      const step = tone.dur / freqs.length;
      freqs.slice(1).forEach((f, i) => {
        osc.frequency.linearRampToValueAtTime(f, start + step * (i + 1));
      });
    }

    // 增益包络：快起淡落，避免爆音（click）。
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

// ── 语义化音效（间谍终端风，克制、不吵）──

/** 对方接入房间：上行双音「哔—嘟」，带点仪式感。 */
export function peerJoined(): void {
  play([
    { freq: 660, at: 0, dur: 0.09, type: 'square', gain: 0.12 },
    { freq: 990, at: 0.1, dur: 0.14, type: 'square', gain: 0.12 },
  ]);
}

/** 端到端加密建立成功：清脆的确认三连音（上扬）。 */
export function secure(): void {
  play([
    { freq: 523, at: 0, dur: 0.07, type: 'triangle', gain: 0.1 },
    { freq: 784, at: 0.08, dur: 0.07, type: 'triangle', gain: 0.1 },
    { freq: 1047, at: 0.16, dur: 0.16, type: 'triangle', gain: 0.11 },
  ]);
}

/** 收到对方消息：短促单音「滴」。 */
export function messageIn(): void {
  play([{ freq: 880, at: 0, dur: 0.08, type: 'sine', gain: 0.1 }]);
}

/** 对方离开：下行双音「嘟—哔」（低落）。 */
export function peerLeft(): void {
  play([
    { freq: 494, at: 0, dur: 0.1, type: 'square', gain: 0.1 },
    { freq: 330, at: 0.11, dur: 0.16, type: 'square', gain: 0.1 },
  ]);
}

/** 发送消息：极轻的点按反馈。 */
export function sendTick(): void {
  play([{ freq: 1320, at: 0, dur: 0.04, type: 'sine', gain: 0.06 }]);
}

/** 测试用：重置内部单例（避免跨用例状态泄漏）。 */
export function __resetForTest(): void {
  ctx = null;
  muted = false;
}
