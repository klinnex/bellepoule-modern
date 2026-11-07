/**
 * BellePoule Modern - Changement de piste d'une poule (#1037, #1501)
 * Appliqué immédiatement (saisie distante, liens, QR) et persisté en base.
 * Licensed under GPL-3.0
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Pool } from '../../shared/types';
import { useEffect } from 'react';
import { useStripAvailability } from './useStripAvailability';

export function usePoolStripChange<P extends Pool>(
  competitionId: string,
  pools: P[],
  setPools: Dispatch<SetStateAction<P[]>>
) {
  // Pistes indisponibles de la compétition (plan des pistes, #1501)
  useEffect(() => useStripAvailability.getState().load(competitionId), [competitionId]);
  return (poolId: string, strip: number | undefined) => {
    const target = pools.find(p => p.id === poolId);
    if (!target) return;
    const updated = { ...target, strip };
    setPools(prev => prev.map(p => (p.id === poolId ? updated : p)));
    window.electronAPI?.db?.updatePool(updated);
  };
}
