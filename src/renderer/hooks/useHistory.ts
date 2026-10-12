/**
 * BellePoule Modern - Undo/Redo History Hook
 * Gestion de l'historique des actions pour annulation/refaire
 * Licensed under GPL-3.0
 */

import { useState, useCallback, useRef } from 'react';
import { logger, LogCategory } from '@shared/services/logger';

export type ActionType =
  | 'UPDATE_SCORE'
  | 'CHANGE_FENCER_STATUS'
  | 'DELETE_FENCER'
  | 'ADD_FENCER'
  | 'UPDATE_FENCER'
  | 'CREATE_POOL'
  | 'UPDATE_POOL'
  | 'DELETE_POOL'
  | 'DELETE_MATCH';

export interface HistoryAction<T = unknown> {
  id: string;
  type: ActionType;
  description: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
  metadata?: T;
}

export interface UseHistoryOptions {
  maxHistory?: number;
  onUndo?: (action: HistoryAction) => void;
  onRedo?: (action: HistoryAction) => void;
}

export interface UseHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryAction[];
  currentIndex: number;
  addAction: <T>(action: Omit<HistoryAction<T>, 'id' | 'timestamp'>) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  getHistoryInfo: () => { undoCount: number; redoCount: number };
}

export function useHistory(options: UseHistoryOptions = {}): UseHistoryReturn {
  const { maxHistory = 50, onUndo, onRedo } = options;

  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const actionIdRef = useRef(0);

  const addAction = useCallback(
    <T>(action: Omit<HistoryAction<T>, 'id' | 'timestamp'>) => {
      const newAction: HistoryAction<T> = {
        ...action,
        id: `action-${++actionIdRef.current}`,
        timestamp: Date.now(),
      };

      setHistory(prev => {
        // Supprime les actions futures si on ajoute une nouvelle action au milieu
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(newAction as HistoryAction);

        // Limite la taille de l'historique
        if (newHistory.length > maxHistory) {
          newHistory.shift();
        }

        return newHistory;
      });

      setCurrentIndex(prev => {
        const newIndex = Math.min(prev + 1, maxHistory - 1);
        return newIndex;
      });
    },
    [currentIndex, maxHistory]
  );

  const undo = useCallback(() => {
    if (currentIndex < 0) return;

    const action = history[currentIndex];
    if (action) {
      try {
        action.undo();
        setCurrentIndex(prev => prev - 1);
        onUndo?.(action);
      } catch (error) {
        logger.error(LogCategory.UI, "Erreur lors de l'annulation", error as Error);
      }
    }
  }, [currentIndex, history, onUndo]);

  const redo = useCallback(() => {
    if (currentIndex >= history.length - 1) return;

    const nextIndex = currentIndex + 1;
    const action = history[nextIndex];
    if (action) {
      try {
        action.redo();
        setCurrentIndex(nextIndex);
        onRedo?.(action);
      } catch (error) {
        logger.error(LogCategory.UI, 'Erreur lors du rétablissement', error as Error);
      }
    }
  }, [currentIndex, history, onRedo]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
    actionIdRef.current = 0;
  }, []);

  const getHistoryInfo = useCallback(
    () => ({
      undoCount: currentIndex + 1,
      redoCount: history.length - currentIndex - 1,
    }),
    [currentIndex, history.length]
  );

  return {
    canUndo: currentIndex >= 0,
    canRedo: currentIndex < history.length - 1,
    history,
    currentIndex,
    addAction,
    undo,
    redo,
    clear,
    getHistoryInfo,
  };
}

export default useHistory;
