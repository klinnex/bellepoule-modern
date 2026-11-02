/**
 * BellePoule Modern - Annulation des placements du tableau (#1301)
 * Pile d'annulation + verrou : refusée une fois l'action transmise
 * (pistes / arbitres vers les écrans distants, résultats finaux).
 * Licensed under GPL-3.0
 */

import { useCallback, useMemo } from 'react';
import { useUndoStack } from './useUndoStack';

const WINDOW_MS = 5 * 60 * 1000;

export function useTableauUndo<M, R, A extends unknown[], B extends unknown[]>(opts: {
  scopeKey?: string;
  onMatchesChange: (matches: M[]) => void;
  onComplete?: (results: R) => void;
  onMatchArenaChange?: (...args: A) => void;
  onMatchRefereeChange?: (...args: B) => void;
}) {
  const stack = useUndoStack<M[]>({ windowMs: WINDOW_MS, scopeKey: opts.scopeKey });
  const { lock } = stack;
  const { onMatchesChange, onComplete, onMatchArenaChange, onMatchRefereeChange } = opts;

  const arena = useCallback(
    (...args: A) => {
      lock();
      onMatchArenaChange?.(...args);
    },
    [lock, onMatchArenaChange]
  );
  const referee = useCallback(
    (...args: B) => {
      lock();
      onMatchRefereeChange?.(...args);
    },
    [lock, onMatchRefereeChange]
  );
  const complete = useMemo(
    () =>
      onComplete
        ? (results: R) => {
            lock();
            onComplete(results);
          }
        : undefined,
    [lock, onComplete]
  );
  const undo = () => {
    const previous = stack.undo();
    if (previous) onMatchesChange(previous);
  };

  return {
    record: stack.record,
    canUndo: stack.canUndo,
    undo,
    onMatchArenaChange: arena,
    onMatchRefereeChange: referee,
    onComplete: complete,
  };
}
