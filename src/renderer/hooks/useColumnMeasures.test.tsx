// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useColumnMeasures } from './useColumnMeasures';

describe('useColumnMeasures', () => {
  it('reste vide sans conteneur ou inactif', () => {
    const { result } = renderHook(() => useColumnMeasures(true, []));
    expect(result.current.colMeasures.size).toBe(0);
    const off = renderHook(() => useColumnMeasures(false, [1]));
    expect(off.result.current.colMeasures.size).toBe(0);
  });

  it('mesure les colonnes relativement au conteneur', () => {
    const wrap = document.createElement('div');
    const col = document.createElement('div');
    wrap.getBoundingClientRect = () => ({ left: 10 }) as DOMRect;
    col.getBoundingClientRect = () => ({ left: 40, width: 100 }) as DOMRect;
    const { result, rerender } = renderHook(({ n }) => useColumnMeasures(true, [n]), {
      initialProps: { n: 0 },
    });
    result.current.bracketWrapRef.current = wrap;
    result.current.colRefs.current.set(8, col);
    rerender({ n: 1 });
    expect(result.current.colMeasures.get(8)).toEqual({ left: 30, width: 100 });
  });
});
