// 消息燃烧特效：原生 Canvas 粒子（火星上升 + 灰烬飘散），不引第三方库。
// 覆盖在正在焚毁的消息气泡上，播放约 0.6s 后由父组件随消息一并移除。
//
// 说明：粒子随机仅用于视觉抖动，无安全意义，故用轻量 PRNG，不用 Math.random
// （项目零留痕规范禁用 Math.random），也不必消耗 crypto 熵。

import { useEffect, useRef } from 'react';

// 轻量确定性 PRNG（mulberry32）——只用于视觉粒子，非安全用途。
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export function BurnParticles({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.scale(dpr, dpr);

    // 沿气泡区域播撒粒子。数量随面积，封顶防卡。
    const count = Math.min(90, Math.max(24, Math.floor((width * height) / 320)));
    const rng = makeRng(Math.floor(width * 131 + height * 17) + count);
    const parts: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const x = rng() * width;
      const y = height * (0.3 + rng() * 0.7);
      parts.push({
        x,
        y,
        vx: (rng() - 0.5) * 1.4,
        vy: -0.6 - rng() * 2.2, // 向上
        life: 0,
        maxLife: 28 + rng() * 24,
        size: 1 + rng() * 2.4,
        // 磷光绿 → 琥珀 → 微红，模拟"数据燃烧"
        hue: 150 - rng() * 130,
      });
    }

    let raf = 0;
    let frame = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      let alive = 0;
      for (const p of parts) {
        if (p.life >= p.maxLife) continue;
        alive++;
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // 轻微重力
        p.vx *= 0.99;
        const t = 1 - p.life / p.maxLife;
        const r = p.size * (0.6 + t * 0.8);
        const light = 45 + t * 40;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${light}%, ${t})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${t})`;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (alive > 0 && frame < 80) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return <canvas ref={canvasRef} className="burnfx" style={{ width, height }} aria-hidden="true" />;
}
