// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalFlags } from './useModalFlags';

const KEYS = ['showA', 'showB'] as const;

describe('useModalFlags', () => {
  it('démarre à false et accepte valeur ou fonction', () => {
    const { result } = renderHook(() => useModalFlags(KEYS));
    expect(result.current.showA).toBe(false);
    act(() => result.current.setShowA(true));
    expect(result.current.showA).toBe(true);
    expect(result.current.showB).toBe(false);
    act(() => result.current.setShowB(v => !v));
    expect(result.current.showB).toBe(true);
  });

  it('garde des setters stables entre les rendus', () => {
    const { result, rerender } = renderHook(() => useModalFlags(KEYS));
    const first = result.current.setShowA;
    act(() => result.current.setShowA(true));
    rerender();
    expect(result.current.setShowA).toBe(first);
  });
});
