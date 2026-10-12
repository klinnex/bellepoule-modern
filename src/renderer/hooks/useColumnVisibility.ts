import { useCallback, useSyncExternalStore } from 'react';
import { logger, LogCategory } from '@shared/services/logger';

const STORAGE_KEY = 'bellepoule_column_visibility';

export type ColumnId =
  | 'victories'
  | 'matches'
  | 'ratio'
  | 'td'
  | 'tr'
  | 'quest'
  | 'index'
  | 'rank'
  | 'firstName'
  | 'lastName'
  | 'club'
  | 'nation'
  | 'region';

export interface ColumnDefinition {
  id: ColumnId;
  label: string;
  labelShort: string;
}

export const POOL_COLUMNS: ColumnDefinition[] = [
  { id: 'victories', label: 'Victoires', labelShort: 'V' },
  { id: 'ratio', label: 'Ratio V/M', labelShort: 'V/M' },
  { id: 'td', label: 'TD (Touches données)', labelShort: 'TD' },
  { id: 'tr', label: 'TR (Touches reçues)', labelShort: 'TR' },
  { id: 'quest', label: 'Quest', labelShort: 'Quest' },
  { id: 'index', label: 'Indice (TD-TR)', labelShort: 'Ind' },
  { id: 'rank', label: 'Rang', labelShort: 'Rg' },
  { id: 'club', label: 'Club', labelShort: 'Club' },
  { id: 'nation', label: 'Nation', labelShort: 'Nat' },
  { id: 'region', label: 'Région', labelShort: 'Rég' },
];

export const RANKING_COLUMNS: ColumnDefinition[] = [
  { id: 'rank', label: 'Rang', labelShort: 'Rg' },
  { id: 'lastName', label: 'Nom', labelShort: 'Nom' },
  { id: 'firstName', label: 'Prénom', labelShort: 'Prénom' },
  { id: 'club', label: 'Club', labelShort: 'Club' },
  { id: 'victories', label: 'Victoires', labelShort: 'V' },
  { id: 'matches', label: 'Matchs', labelShort: 'M' },
  { id: 'ratio', label: 'Ratio V/M', labelShort: 'V/M' },
  { id: 'td', label: 'TD (Touches données)', labelShort: 'TD' },
  { id: 'tr', label: 'TR (Touches reçues)', labelShort: 'TR' },
  { id: 'quest', label: 'Quest', labelShort: 'Quest' },
  { id: 'index', label: 'Indice (TD-TR)', labelShort: 'Indice' },
];

interface VisibilityState {
  pool: ColumnId[]; // défaut global appliqué aux poules sans réglage propre
  ranking: ColumnId[];
  pools: Record<string, ColumnId[]>; // réglages indépendants par poule (clé = pool.id)
}

const DEFAULT_VISIBILITY: VisibilityState = {
  pool: POOL_COLUMNS.map(c => c.id),
  ranking: RANKING_COLUMNS.map(c => c.id),
  pools: {},
};

const loadFromStorage = (): VisibilityState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        pool: parsed.pool || DEFAULT_VISIBILITY.pool,
        ranking: parsed.ranking || DEFAULT_VISIBILITY.ranking,
        pools: parsed.pools || {},
      };
    }
  } catch (e) {
    logger.error(LogCategory.UI, 'Failed to load column visibility', e as Error);
  }
  return DEFAULT_VISIBILITY;
};

const saveToStorage = (state: VisibilityState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    logger.error(LogCategory.UI, 'Failed to save column visibility', e as Error);
  }
};

// Store externe partagé : toutes les instances du hook lisent/écrivent le même état global.
let currentState: VisibilityState = loadFromStorage();
const listeners = new Set<() => void>();

const getSnapshot = (): VisibilityState => currentState;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const setState = (updater: (prev: VisibilityState) => VisibilityState): void => {
  currentState = updater(currentState);
  saveToStorage(currentState);
  listeners.forEach(l => l());
};

export const useColumnVisibility = () => {
  const visibility = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setVisibleColumns = useCallback((type: 'pool' | 'ranking', columns: ColumnId[]) => {
    setState(prev => ({
      ...prev,
      [type]: columns,
    }));
  }, []);

  // poolId optionnel : si fourni, le réglage est propre à cette poule (indépendance).
  const toggleColumn = useCallback(
    (type: 'pool' | 'ranking', columnId: ColumnId, poolId?: string) => {
      setState(prev => {
        if (type === 'pool' && poolId) {
          const current = prev.pools[poolId] ?? prev.pool;
          const isVisible = current.includes(columnId);
          const newColumns = isVisible
            ? current.filter(id => id !== columnId)
            : [...current, columnId];
          return {
            ...prev,
            pools: { ...prev.pools, [poolId]: newColumns },
          };
        }
        const current = prev[type];
        const isVisible = current.includes(columnId);
        const newColumns = isVisible
          ? current.filter(id => id !== columnId)
          : [...current, columnId];
        return {
          ...prev,
          [type]: newColumns,
        };
      });
    },
    []
  );

  // Bouton global : applique le choix à toutes les poules et efface les réglages propres.
  const setAllPoolColumns = useCallback((columns: ColumnId[]) => {
    setState(prev => ({
      ...prev,
      pool: columns,
      pools: {},
    }));
  }, []);

  const isColumnVisible = useCallback(
    (type: 'pool' | 'ranking', columnId: ColumnId, poolId?: string): boolean => {
      if (type === 'pool' && poolId && visibility.pools[poolId]) {
        return visibility.pools[poolId].includes(columnId);
      }
      return visibility[type].includes(columnId);
    },
    [visibility]
  );

  const getVisibleColumns = useCallback(
    (type: 'pool' | 'ranking', poolId?: string): ColumnId[] => {
      if (type === 'pool' && poolId && visibility.pools[poolId]) {
        return visibility.pools[poolId];
      }
      return visibility[type];
    },
    [visibility]
  );

  const resetToDefaults = useCallback(() => {
    setState(() => DEFAULT_VISIBILITY);
  }, []);

  return {
    visibility,
    setVisibleColumns,
    toggleColumn,
    setAllPoolColumns,
    isColumnVisible,
    getVisibleColumns,
    resetToDefaults,
  };
};
