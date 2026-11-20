/**
 * BellePoule Modern - Progression des opérations longues (#1535)
 * runOperation(kind, tâche) : si la tâche dépasse 1 s, une barre de progression
 * indéterminée (role="status" + <progress>) s'affiche en haut de la fenêtre jusqu'à la fin.
 * Licensed under GPL-3.0
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { translateStatic } from '../../contexts/TranslationContext';

export type OperationKind = 'import' | 'export' | 'sync';

/** Délai avant affichage : les opérations rapides n'affichent rien */
export const OPERATION_DELAY_MS = 1000;

interface OperationContextType {
  runOperation: <T>(kind: OperationKind, task: () => Promise<T>) => Promise<T>;
}

const OperationContext = createContext<OperationContextType | null>(null);

export const OperationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<OperationKind[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const runOperation = useCallback(
    async <T,>(kind: OperationKind, task: () => Promise<T>): Promise<T> => {
      let shown = false;
      const timer = setTimeout(() => {
        shown = true;
        setActive(prev => [...prev, kind]);
      }, OPERATION_DELAY_MS);
      timers.current.add(timer);
      try {
        return await task();
      } finally {
        clearTimeout(timer);
        timers.current.delete(timer);
        if (shown) {
          setActive(prev => {
            const i = prev.indexOf(kind);
            return i < 0 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)];
          });
        }
      }
    },
    []
  );

  const current = active[active.length - 1];
  return (
    <OperationContext.Provider value={{ runOperation }}>
      {children}
      {current && (
        <div className="operation-progress" role="status" aria-live="polite">
          <span className="operation-progress-label">
            {translateStatic(`operations.${current}`)}
          </span>
          <progress
            className="operation-progress-bar"
            aria-label={translateStatic(`operations.${current}`)}
          />
        </div>
      )}
    </OperationContext.Provider>
  );
};

/** Hors provider : la tâche s'exécute simplement, sans barre */
export const useOperation = (): OperationContextType =>
  useContext(OperationContext) ?? { runOperation: (_kind, task) => task() };
