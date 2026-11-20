// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCompetitionEvent } from './useCompetitionEvent';

type Ev = { type: 'fencers:changed' | 'matches:changed'; competitionId?: string };

function setup() {
  let handler: (e: Ev) => void = () => {};
  const unsubscribe = vi.fn();
  (window as any).electronAPI = {
    onCompetitionEvent: vi.fn((cb: (e: Ev) => void) => {
      handler = cb;
      return unsubscribe;
    }),
  };
  return { emit: (e: Ev) => handler(e), unsubscribe };
}

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('useCompetitionEvent', () => {
  it('appelle le callback pour la compétition concernée uniquement', () => {
    const { emit } = setup();
    const cb = vi.fn();
    renderHook(() => useCompetitionEvent('fencers:changed', 'c1', cb));
    emit({ type: 'fencers:changed', competitionId: 'c2' });
    expect(cb).not.toHaveBeenCalled();
    emit({ type: 'fencers:changed', competitionId: 'c1' });
    emit({ type: 'fencers:changed' });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("filtre par type : matches:changed n'active pas fencers:changed", () => {
    const { emit } = setup();
    const fencersCb = vi.fn();
    const matchesCb = vi.fn();
    renderHook(() => useCompetitionEvent('fencers:changed', 'c1', fencersCb));
    renderHook(() => useCompetitionEvent('matches:changed', 'c1', matchesCb));
    emit({ type: 'matches:changed', competitionId: 'c1' });
    expect(fencersCb).not.toHaveBeenCalled();
    expect(matchesCb).toHaveBeenCalledTimes(1);
  });

  it('se désabonne au démontage', () => {
    const { unsubscribe } = setup();
    const { unmount } = renderHook(() => useCompetitionEvent('fencers:changed', 'c1', () => {}));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ne plante pas sans electronAPI', () => {
    expect(() =>
      renderHook(() => useCompetitionEvent('fencers:changed', 'c1', () => {}))
    ).not.toThrow();
  });
});
