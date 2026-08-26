// 神秘人头像（原创 SVG，仿抖音默认头像风格：深色圆底 + 人形剪影）。
// 颜色由昵称哈希派生 —— 你和对方头像色相不同，一眼可区分。

/** 简单字符串哈希 → 0..359 色相。 */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return h;
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const hue = hueFromString(name || '神秘人');
  const ring = `hsl(${hue} 90% 60%)`;
  const bg = `hsl(${hue} 40% 12%)`;
  const body = `hsl(${hue} 70% 55%)`;

  return (
    <svg
      className="avatar"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${name} 的头像`}
    >
      <circle cx="20" cy="20" r="19" fill={bg} stroke={ring} strokeWidth="1.5" />
      {/* 头 */}
      <circle cx="20" cy="15.5" r="6" fill={body} />
      {/* 肩/身剪影 */}
      <path
        d="M8.5 33 C8.5 25.5 14 22 20 22 C26 22 31.5 25.5 31.5 33 Z"
        fill={body}
      />
    </svg>
  );
}
