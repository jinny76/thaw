import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePanicKey } from './usePanicKey.js';

function pressEsc() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

describe('usePanicKey (double-ESC)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onPanic on two ESC within the window', () => {
    const onPanic = vi.fn();
    renderHook(() => usePanicKey(onPanic));
    pressEsc();
    vi.advanceTimersByTime(200);
    pressEsc();
    expect(onPanic).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on a single ESC', () => {
    const onPanic = vi.fn();
    renderHook(() => usePanicKey(onPanic));
    pressEsc();
    expect(onPanic).not.toHaveBeenCalled();
  });

  it('does NOT fire when the two ESCs are too far apart', () => {
    const onPanic = vi.fn();
    renderHook(() => usePanicKey(onPanic));
    pressEsc();
    vi.advanceTimersByTime(2000); // beyond 800ms window
    pressEsc();
    expect(onPanic).not.toHaveBeenCalled();
  });
});
