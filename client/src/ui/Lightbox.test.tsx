import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageList } from './MessageList.js';
import { Lightbox } from './Lightbox.js';
import type { ChatMessage } from '../messages/types.js';

describe('Lightbox', () => {
  it('renders an image and closes on the close button', () => {
    const onClose = vi.fn();
    render(<Lightbox media={{ kind: 'image', url: 'blob:x', name: 'p.png' }} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /关闭/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on ESC', () => {
    const onClose = vi.fn();
    render(<Lightbox media={{ kind: 'image', url: 'blob:x', name: 'p.png' }} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('MessageList media → lightbox', () => {
  it('clicking an image thumbnail opens the lightbox', () => {
    const messages: ChatMessage[] = [
      {
        kind: 'media',
        mediaKind: 'image',
        id: 'i1',
        author: 'peer',
        name: 'photo.png',
        mime: 'image/png',
        size: 100,
        objectUrl: 'blob:img',
        ready: true,
        progress: 1,
        readyAt: Date.now(),
        createdAt: Date.now(),
        ttl: 300,
        status: 'received',
      },
    ];
    render(<MessageList messages={messages} onBurn={vi.fn()} myNickname="我" peerNickname="对方" />);
    // 缩略图是个可点击按钮
    const thumb = screen.getByRole('button', { name: /查看图片/ });
    expect(thumb).toBeInTheDocument();
    fireEvent.click(thumb);
    // 打开后出现 dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
