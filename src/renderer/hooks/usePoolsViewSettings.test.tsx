// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePoolsViewSettings } from './usePoolsViewSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('usePoolsViewSettings', () => {
  it('mode grille et index 0 par défaut', () => {
    const { result } = renderHook(() => usePoolsViewSettings(4));
    expect(result.current.poolsViewMode).toBe('grid');
    expect(result.current.singlePoolIndex).toBe(0);
  });

  it('relit et persiste le mode', () => {
    localStorage.setItem('bellepoule-pools-view-mode', 'single');
    const { result } = renderHook(() => usePoolsViewSettings(4));
    expect(result.current.poolsViewMode).toBe('single');
    act(() => result.current.setPoolsViewMode('grid'));
    expect(localStorage.getItem('bellepoule-pools-view-mode')).toBe('grid');
  });

  it("recale l'index quand le nombre de poules diminue", () => {
    const { result, rerender } = renderHook(({ n }) => usePoolsViewSettings(n), {
      initialProps: { n: 5 },
    });
    act(() => result.current.setSinglePoolIndex(4));
    rerender({ n: 2 });
    expect(result.current.singlePoolIndex).toBe(1);
  });
});
