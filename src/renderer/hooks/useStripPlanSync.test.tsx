// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStripPlanSync } from './useStripAvailability';

describe('useStripPlanSync', () => {
  const setStripPlan = vi.fn().mockResolvedValue({ success: true });
  beforeEach(() => {
    setStripPlan.mockClear();
    (window as any).electronAPI = { remote: { setStripPlan } };
  });

  it('envoie le plan quand la session est active', () => {
    renderHook(() => useStripPlanSync('c1', true, 5, [6, 7]));
    expect(setStripPlan).toHaveBeenCalledWith('c1', { start: 5, unavailable: [6, 7] });
  });

  it('ne fait rien sans session active', () => {
    renderHook(() => useStripPlanSync('c1', false, 5, [6]));
    expect(setStripPlan).not.toHaveBeenCalled();
  });

  it('renvoie le plan quand les pistes indisponibles changent', () => {
    const { rerender } = renderHook(({ u }) => useStripPlanSync('c1', true, 1, u), {
      initialProps: { u: [2] },
    });
    rerender({ u: [2, 3] });
    expect(setStripPlan).toHaveBeenCalledTimes(2);
    expect(setStripPlan).toHaveBeenLastCalledWith('c1', { start: 1, unavailable: [2, 3] });
  });
});
