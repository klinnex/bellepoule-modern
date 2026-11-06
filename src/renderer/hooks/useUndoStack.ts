/**
 * BellePoule Modern - Pile d'annulation réutilisable (#1301)
 * Pile bornée d'instantanés « avant action », fenêtre de restauration,
 * verrou une fois l'action transmise (écran distant / sync cloud).
 * Licensed under GPL-3.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { appendHistory } from '../components/poolPrepHistory';

export interface UseUndoStackOptions {
  /** Fenêtre de restauration (ms) */
  windowMs: number;
  /** Clé de portée (ex. id de compétition) : changement = pile vidée */
  scopeKey?: string;
}

export interface UseUndoStackReturn<T> {
  /** À appeler AVANT l'action : mémorise l'état à restaurer */
  record: (snapshot: T) => void;
  /** Retire et renvoie le dernier état, ou null si impossible */
  undo: () => T | null;
  canUndo: boolean;
  /** Action transmise : annulation refusée (bouton masqué) jusqu'à la prochaine action locale */
  lock: () => void;
  locked: boolean;
  clear: () => void;
  /** Secondes écoulées depuis la dernière action annulable */
  elapsedSec: number;
}

interface Entry<T> {
  snapshot: T;
  timestamp: number;
}

export function useUndoStack<T>(options: UseUndoStackOptions): UseUndoStackReturn<T> {
  const { windowMs, scopeKey } = options;
  const stackRef = useRef<Entry<T>[]>([]);
  const [, setVersion] = useState(0);
  const [locked, setLocked] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const top = stackRef.current[stackRef.current.length - 1];
  const canUndo = !locked && !!top && Date.now() - top.timestamp <= windowMs;

  const clear = useCallback(() => {
    stackRef.current = [];
    setElapsedSec(0);
    bump();
  }, [bump]);

  useEffect(() => {
    clear();
    setLocked(false);
  }, [scopeKey, clear]);

  const record = useCallback(
    (snapshot: T) => {
      stackRef.current = appendHistory(
        stackRef.current,
        stackRef.current.length - 1,
        { snapshot, timestamp: Date.now() },
        windowMs
      );
      setLocked(false);
      setElapsedSec(0);
      bump();
    },
    [windowMs, bump]
  );

  const undo = useCallback((): T | null => {
    const last = stackRef.current[stackRef.current.length - 1];
    if (!last || locked || Date.now() - last.timestamp > windowMs) return null;
    stackRef.current = stackRef.current.slice(0, -1);
    setElapsedSec(0);
    bump();
    return last.snapshot;
  }, [locked, windowMs, bump]);

  const lock = useCallback(() => {
    stackRef.current = [];
    setLocked(true);
    bump();
  }, [bump]);

  useEffect(() => {
    if (!canUndo) return;
    const id = setInterval(() => {
      const last = stackRef.current[stackRef.current.length - 1];
      if (!last) return;
      const sec = Math.floor((Date.now() - last.timestamp) / 1000);
      setElapsedSec(sec);
      if (sec * 1000 >= windowMs) {
        clearInterval(id);
        bump();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [canUndo, windowMs, bump]);

  return { record, undo, canUndo, lock, locked, clear, elapsedSec };
}
