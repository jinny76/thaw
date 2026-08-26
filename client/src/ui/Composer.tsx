// 输入栏。移动端吸底，触达区 ≥44px。含富媒体入口（+菜单/文件/拍照/语音）。

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { VoiceRecorder } from './VoiceRecorder.js';

export function Composer({
  disabled,
  onSend,
  onSendFile,
  onLeave,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  onSendFile: (blob: Blob, name: string) => void;
  onLeave: () => void;
}) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoCaptureRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSend(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) {
        onSend(text);
        setText('');
      }
    }
  };

  const pickFiles = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) onSendFile(f, f.name);
    setMenuOpen(false);
  };

  return (
    <form className="composer" onSubmit={submit}>
      <button
        type="button"
        className="composer__leave"
        onClick={onLeave}
        aria-label="退出并焚毁"
        title="退出并焚毁"
      >
        ✕
      </button>

      <div className="composer__plus">
        <button
          type="button"
          className="composer__plusbtn"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={disabled}
          aria-label="添加图片/视频/文件/语音"
          aria-expanded={menuOpen}
        >
          ＋
        </button>
        {menuOpen && (
          <div className="composer__menu" role="menu">
            <button type="button" onClick={() => imageInputRef.current?.click()}>
              相册图片
            </button>
            <button type="button" onClick={() => cameraInputRef.current?.click()}>
              拍照
            </button>
            <button type="button" onClick={() => videoInputRef.current?.click()}>
              相册视频
            </button>
            <button type="button" onClick={() => videoCaptureRef.current?.click()}>
              录像
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              文件
            </button>
            <VoiceRecorder
              onRecorded={(blob) => {
                onSendFile(blob, `voice-${Date.now()}.webm`);
                setMenuOpen(false);
              }}
            />
          </div>
        )}
        {/* 隐藏的原生入口：移动端 accept/capture 触发相册/相机 */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input
          ref={videoCaptureRef}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input ref={fileInputRef} type="file" hidden onChange={(e) => pickFiles(e.target.files)} />
      </div>

      <textarea
        className="composer__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={disabled}
        aria-label="消息输入框"
      />
      <button type="submit" className="composer__send" disabled={disabled || !text.trim()}>
        发送
      </button>
    </form>
  );
}
