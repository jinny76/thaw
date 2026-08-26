// 隐写水印：把接收方会话标识淡淡嵌入消息区背景。
// 防不了截屏，但截了能溯源是谁泄的（最实用的一招）。

export function Watermark({ label }: { label: string }) {
  // 用重复的低透明度文本铺满背景。
  const tiles = Array.from({ length: 40 }, (_, i) => (
    <span key={i} className="watermark__tile">
      {label}
    </span>
  ));
  return (
    <div className="watermark" aria-hidden="true">
      {tiles}
    </div>
  );
}
