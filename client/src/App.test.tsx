import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App routing', () => {
  it('renders the landing page at /', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByText(/见字如面/)).toBeInTheDocument();
    // 统一进房入口：填号+口令即进（房间不存在则建、已存在则加入）。
    expect(screen.getByRole('button', { name: /进入加密房间/ })).toBeInTheDocument();
  });
});
