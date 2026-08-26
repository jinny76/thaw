import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreatePage } from './CreatePage.js';

describe('CreatePage', () => {
  it('默认生成中文房间号与中文口令，含进入按钮', () => {
    render(<CreatePage />);
    // 房间号与口令都是纯中文（默认）→ 至少 2 个纯中文文本
    const zhEls = screen.getAllByText(/^[一-鿿]+$/);
    expect(zhEls.length).toBeGreaterThanOrEqual(2);
    // 进入按钮存在
    expect(screen.getByRole('button', { name: /进入聊天室/ })).toBeInTheDocument();
    // 数字/中文、英文/中文切换按钮存在
    expect(screen.getAllByRole('button', { name: '中文' }).length).toBeGreaterThanOrEqual(2);
  });
});
