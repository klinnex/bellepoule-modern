/**
 * BellePoule Modern - Taille de fenêtre en vue « poule unique » (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useEffect, useRef } from 'react';
import type { Pool } from '../../shared/types';
import type { Phase } from './useCompetitionSession';
import type { useColumnVisibility } from './useColumnVisibility';

interface UsePoolsWindowSizeParams {
  poolsViewMode: 'grid' | 'single';
  currentPhase: Phase;
  pools: Pool[];
  singlePoolIndex: number;
  getVisibleColumns: ReturnType<typeof useColumnVisibility>['getVisibleColumns'];
  isLaserSabre: boolean;
}

/**
 * Ajuste la taille de la fenêtre à l'entrée en vue « poule unique » (colonnes choisies
 * + nb de tireurs de la poule affichée) pour éviter les ascenseurs. Ne se redéclenche
 * pas à chaque changement de poule : naviguer d'une poule à l'autre ne doit pas
 * réinitialiser la taille de fenêtre choisie par l'utilisateur (cf. bug dimension reset).
 */
export function usePoolsWindowSize({
  poolsViewMode,
  currentPhase,
  pools,
  singlePoolIndex,
  getVisibleColumns,
  isLaserSabre,
}: UsePoolsWindowSizeParams) {
  const poolsRef = useRef(pools);
  poolsRef.current = pools;
  const singlePoolIndexRef = useRef(singlePoolIndex);
  singlePoolIndexRef.current = singlePoolIndex;

  useEffect(() => {
    if (poolsViewMode !== 'single' || currentPhase !== 'pools') return;
    const pool = poolsRef.current[singlePoolIndexRef.current];
    if (!pool) return;

    const POOL_CELL = 52; // px — doit rester synchro avec .pool-cell (main.css)
    const POOL_NAME_COL = 210; // px — .pool-cell-name (main.css)
    const CHROME_WIDTH = 140; // marges, bordures de carte, cadre de fenêtre
    const CHROME_HEIGHT = 380; // en-tête compétition, navigation, barre d'outils, prochain match

    const visibleColumnsCount = getVisibleColumns('pool', pool.id).filter(
      c => c !== 'quest' || isLaserSabre
    ).length;
    const fencerCount = pool.fencers.length;

    const width = Math.min(
      window.screen.availWidth,
      POOL_NAME_COL + fencerCount * POOL_CELL + visibleColumnsCount * POOL_CELL + CHROME_WIDTH
    );
    const height = Math.min(
      window.screen.availHeight,
      (fencerCount + 1) * POOL_CELL + CHROME_HEIGHT
    );

    window.electronAPI?.setWindowSize(Math.round(width), Math.round(height));
  }, [poolsViewMode, currentPhase, getVisibleColumns, isLaserSabre]);
}
