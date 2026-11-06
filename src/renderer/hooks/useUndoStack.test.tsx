// @vitest-environment jsdom
/**
 * Tests unitaires - useUndoStack (#1301)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoStack } from './useUndoStack';
import { MAX_HISTORY_ENTRIES } from '../components/poolPrepHistory';

const W = 5 * 60 * 1000;

afterEach(() => vi.useRealTimers());

describe('useUndoStack', () => {
  it('restaure les états dans l’ordre inverse', () => {
    const { result } = renderHook(() => useUndoStack<number>({ windowMs: W }));
    act(() => result.current.record(1));
    act(() => result.current.record(2));
    expect(result.current.canUndo).toBe(true);
    let v: number | null = null;
    act(() => {
      v = result.current.undo();
    });
    expect(v).toBe(2);
    act(() => {
      v = result.current.undo();
    });
    expect(v).toBe(1);
    expect(result.current.canUndo).toBe(false);
    act(() => {
      v = result.current.undo();
    });
    expect(v).toBeNull();
  });

  it('borne la pile', () => {
    const { result } = renderHook(() => useUndoStack<number>({ windowMs: W }));
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 10; i++) act(() => result.current.record(i));
    let count = 0;
    while (result.current.canUndo) {
      act(() => {
        result.current.undo();
      });
      count++;
    }
    expect(count).toBe(MAX_HISTORY_ENTRIES);
  });

  it('refuse l’annulation hors fenêtre', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoStack<number>({ windowMs: W }));
    act(() => result.current.record(1));
    act(() => {
      vi.advanceTimersByTime(W + 2000);
    });
    expect(result.current.canUndo).toBe(false);
    let v: number | null = 0;
    act(() => {
      v = result.current.undo();
    });
    expect(v).toBeNull();
  });

  it('lock masque l’annulation jusqu’à la prochaine action locale', () => {
    const { result } = renderHook(() => useUndoStack<number>({ windowMs: W }));
    act(() => result.current.record(1));
    act(() => result.current.lock());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.locked).toBe(true);
    act(() => result.current.record(2));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.locked).toBe(false);
  });

  it('vide la pile au changement de portée', () => {
    const { result, rerender } = renderHook(
      ({ k }) => useUndoStack<number>({ windowMs: W, scopeKey: k }),
      { initialProps: { k: 'a' } }
    );
    act(() => result.current.record(1));
    rerender({ k: 'b' });
    expect(result.current.canUndo).toBe(false);
  });
});
