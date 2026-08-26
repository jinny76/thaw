import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar } from './Avatar.js';

describe('Avatar', () => {
  it('renders an SVG with the name in aria-label', () => {
    const { container, getByLabelText } = render(<Avatar name="神秘人384712" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(getByLabelText(/神秘人384712 的头像/)).toBeInTheDocument();
  });

  it('derives different colors for different names', () => {
    const a = render(<Avatar name="爱丽丝" />).container.querySelector('circle')!;
    const b = render(<Avatar name="鲍勃" />).container.querySelector('circle')!;
    // 不同昵称的底圆填充色应不同
    expect(a.getAttribute('fill')).not.toBe(b.getAttribute('fill'));
  });

  it('is stable for the same name', () => {
    const a = render(<Avatar name="同一个人" />).container.querySelector('circle')!;
    const b = render(<Avatar name="同一个人" />).container.querySelector('circle')!;
    expect(a.getAttribute('fill')).toBe(b.getAttribute('fill'));
  });
});
