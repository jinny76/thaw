// 媒体查看器（lightbox）：点图片/视频缩略图 → 全屏大图/大视频。
// 纯 React + CSS，无第三方库。ESC / 点遮罩 / 点关闭按钮均可关闭。

import { useEffect, useState } from 'react';
import { downloadBlobUrl } from './download.js';

export interface LightboxMedia {
  kind: 'image' | 'video';
  url: string;
  name: string;
}

export function Lightbox({ media, onClose }: { media: LightboxMedia; onClose: () => void }) {
  // 视频无法解码（如手机 HEVC 编码桌面浏览器不支持）→ 降级为下载。
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ESC 关闭；阻止冒泡到全局恐慌热键（连按两次 ESC）。
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // 捕获阶段拦截，优先于 window 上的恐慌热键
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={media.name} onClick={onClose}>
      <div className="crt" aria-hidden="true" />
      <button className="lightbox__close" type="button" onClick={onClose} aria-label="关闭">
        ✕
      </button>
      <div className="lightbox__stage" onClick={(e) => e.stopPropagation()}>
        {media.kind === 'image' ? (
          <img className="lightbox__img" src={media.url} alt={media.name} />
        ) : videoError ? (
          <div className="lightbox__fallback">
            <p>{'> 此视频浏览器无法解码（可能是手机 HEVC/H.265 格式）。'}</p>
            <button
              type="button"
              className="lightbox__dl"
              onClick={() => void downloadBlobUrl(media.url, media.name)}
            >
              ⬇ 下载后用本地播放器查看
            </button>
          </div>
        ) : (
          <video
            className="lightbox__video"
            src={media.url}
            controls
            playsInline
            preload="auto"
            onError={() => setVideoError(true)}
          />
        )}
        <span className="lightbox__name">{media.name}</span>
      </div>
    </div>
  );
}
