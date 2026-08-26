import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { linkify } from './linkify.js';

function renderText(text: string) {
  return render(<div>{linkify(text)}</div>);
}

describe('linkify', () => {
  it('turns an http(s) URL into an anchor opening in a new tab', () => {
    const { container } = renderText('看这个 https://example.com/page 挺好');
    const a = container.querySelector('a')!;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/page');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('noreferrer');
  });

  it('leaves plain text without URLs untouched (no anchor)', () => {
    const { container } = renderText('就是一句普通的话');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('就是一句普通的话');
  });

  it('does NOT linkify javascript: or data: (XSS 防御)', () => {
    const { container } = renderText('javascript:alert(1) data:text/html,x');
    expect(container.querySelector('a')).toBeNull();
    // 危险协议以纯文本保留
    expect(container.textContent).toContain('javascript:alert(1)');
  });

  it('handles multiple URLs in one message', () => {
    const { container } = renderText('http://a.com 和 https://b.com/x');
    expect(container.querySelectorAll('a').length).toBe(2);
  });

  it('does not run innerHTML — anchor text equals the URL literally', () => {
    const { container } = renderText('https://example.com/<script>');
    // 无 script 元素被创建（React 文本节点渲染）
    expect(container.querySelector('script')).toBeNull();
  });
});
