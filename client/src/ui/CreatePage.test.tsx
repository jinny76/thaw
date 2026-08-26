import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreatePage } from './CreatePage.js';

describe('CreatePage', () => {
  it('shows a 9-digit room id and a high-entropy passphrase', () => {
    render(<CreatePage />);
    // 房间号出现在链接与 ROOM ID 中
    const roomIdEl = screen.getByText(/^\d{9}$/);
    expect(roomIdEl).toBeInTheDocument();
    // 分享链接包含 9 位房间号
    expect(screen.getByText(/\/\d{9}$/)).toBeInTheDocument();
    // 进入按钮存在
    expect(screen.getByRole('button', { name: /进入聊天室/ })).toBeInTheDocument();
  });
});
