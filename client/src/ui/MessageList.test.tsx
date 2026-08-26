import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from './MessageList.js';
import type { ChatMessage } from '../messages/types.js';

describe('MessageList', () => {
  it('renders text as a text node (no HTML injection)', () => {
    const injection = '<img src=x onerror=alert(1)>hello';
    const messages: ChatMessage[] = [
      {
        kind: 'text',
        id: 'm1',
        author: 'peer',
        text: injection,
        createdAt: Date.now(),
        ttl: 300,
        status: 'received',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} onBurn={vi.fn()} myNickname="我" peerNickname="对方" />,
    );
    // 注入串以纯文本出现，且没有真的 <img> 元素被创建
    expect(screen.getByText(injection)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('distinguishes me vs peer messages', () => {
    const messages: ChatMessage[] = [
      { kind: 'text', id: 'a', author: 'me', text: 'hi', createdAt: Date.now(), ttl: 300, status: 'sent' },
      { kind: 'text', id: 'b', author: 'peer', text: 'yo', createdAt: Date.now(), ttl: 300, status: 'received' },
    ];
    const { container } = render(
      <MessageList messages={messages} onBurn={vi.fn()} myNickname="我" peerNickname="对方" />,
    );
    expect(container.querySelector('.msg--me')).not.toBeNull();
    expect(container.querySelector('.msg--peer')).not.toBeNull();
  });
});
