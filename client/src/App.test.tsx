import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App routing', () => {
  it('renders the landing page at /', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByText(/见字如面/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /创建加密房间/ })).toBeInTheDocument();
  });
});
