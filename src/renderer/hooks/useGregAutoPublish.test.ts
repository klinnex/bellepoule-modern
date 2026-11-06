// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGregAutoPublish, readGregAutoPublish } from './useGregAutoPublish';

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

  it("mémorise l'état ON/OFF par compétition", () => {
    localStorage.clear();
    const first = renderHook(() => useGregAutoPublish(vi.fn(), 'c1'));
    act(() => first.result.current[1](true));
    first.unmount();
    const again = renderHook(() => useGregAutoPublish(vi.fn(), 'c1'));
    expect(again.result.current[0]).toBe(true);
    const other = renderHook(() => useGregAutoPublish(vi.fn(), 'c2'));
    expect(other.result.current[0]).toBe(false);
    act(() => again.result.current[1](false));
    expect(readGregAutoPublish('c1')).toBe(false);
  });
});
