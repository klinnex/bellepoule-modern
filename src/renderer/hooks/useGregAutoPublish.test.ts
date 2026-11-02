// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGregAutoPublish } from './useGregAutoPublish';

describe('useGregAutoPublish', () => {
  it("publie immédiatement puis toutes les 15 s, et s'arrête à OFF", () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const { result } = renderHook(() => useGregAutoPublish(publish));
    act(() => vi.advanceTimersByTime(30000));
    expect(publish).not.toHaveBeenCalled();
    act(() => result.current[1](true));
    expect(publish).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(30000));
    expect(publish).toHaveBeenCalledTimes(3);
    act(() => result.current[1](false));
    act(() => vi.advanceTimersByTime(30000));
    expect(publish).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
