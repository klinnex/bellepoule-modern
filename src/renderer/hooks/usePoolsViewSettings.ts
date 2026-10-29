/**
 * BellePoule Modern - Affichage des poules : taille des cartes, grille / poule unique (#1241)
 * Extrait de CompetitionView. Mode et taille persistés dans localStorage.
 * Licensed under GPL-3.0
 */
import { useEffect, useState } from 'react';
import { readSavedPoolCardSize, type PresetLabel } from '../components/pool/WindowSizePresets';

export type PoolsViewMode = 'grid' | 'single';

const VIEW_MODE_KEY = 'bellepoule-pools-view-mode';

export function usePoolsViewSettings(poolCount: number) {
  const [poolCardSize, setPoolCardSize] = useState<PresetLabel>(readSavedPoolCardSize);
  const [poolsViewMode, setPoolsViewMode] = useState<PoolsViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as PoolsViewMode) || 'grid'
  );
  const [singlePoolIndex, setSinglePoolIndex] = useState(0);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, poolsViewMode);
  }, [poolsViewMode]);

  // Recale l'index sélectionné si le nombre de poules change (ex: fusion/suppression)
  useEffect(() => {
    if (singlePoolIndex >= poolCount) {
      setSinglePoolIndex(Math.max(0, poolCount - 1));
    }
  }, [poolCount, singlePoolIndex]);

  return {
    poolCardSize,
    setPoolCardSize,
    poolsViewMode,
    setPoolsViewMode,
    singlePoolIndex,
    setSinglePoolIndex,
  };
}
