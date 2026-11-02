// @vitest-environment jsdom
/**
 * Tests unitaires - useTableauUndo (#1301)
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableauUndo } from './useTableauUndo';

const setup = () => {
  const onMatchesChange = vi.fn();
  const onMatchArenaChange = vi.fn();
  const onComplete = vi.fn();
  const hook = renderHook(() =>
    useTableauUndo<{ v: string }, string[], [string], []>({
      onMatchesChange,
      onMatchArenaChange,
      onComplete,
    })
  );
  return { hook, onMatchesChange, onMatchArenaChange, onComplete };
};

describe('useTableauUndo', () => {
  it('restaure les matchs enregistrés', () => {
    const { hook, onMatchesChange } = setup();
    act(() => hook.result.current.record([{ v: 'a' }]));
    expect(hook.result.current.canUndo).toBe(true);
    act(() => hook.result.current.undo());
    expect(onMatchesChange).toHaveBeenCalledWith([{ v: 'a' }]);
  });

  it('isole l’instantané des mutations en place', () => {
    const { hook, onMatchesChange } = setup();
    const m = { v: 'a' };
    act(() => hook.result.current.record([m]));
    m.v = 'mutated';
    act(() => hook.result.current.undo());
    expect(onMatchesChange).toHaveBeenCalledWith([{ v: 'a' }]);
  });

  it('refuse l’annulation après transmission d’une piste', () => {
    const { hook, onMatchArenaChange } = setup();
    act(() => hook.result.current.record([{ v: 'a' }]));
    act(() => hook.result.current.onMatchArenaChange('m1'));
    expect(onMatchArenaChange).toHaveBeenCalledWith('m1');
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('refuse l’annulation après les résultats finaux', () => {
    const { hook, onComplete } = setup();
    act(() => hook.result.current.record([{ v: 'a' }]));
    act(() => hook.result.current.onComplete?.(['r']));
    expect(onComplete).toHaveBeenCalledWith(['r']);
    expect(hook.result.current.canUndo).toBe(false);
  });
});
