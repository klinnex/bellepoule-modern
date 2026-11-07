/**
 * BellePoule Modern - Changement de piste d'une poule (#1037, #1501)
 * Appliqué immédiatement (saisie distante, liens, QR) et persisté en base.
 * Licensed under GPL-3.0
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Pool } from '../../shared/types';

export function usePoolStripChange<P extends Pool>(
  pools: P[],
  setPools: Dispatch<SetStateAction<P[]>>
) {
  return (poolId: string, strip: number | undefined) => {
    const target = pools.find(p => p.id === poolId);
    if (!target) return;
    const updated = { ...target, strip };
    setPools(prev => prev.map(p => (p.id === poolId ? updated : p)));
    window.electronAPI?.db?.updatePool(updated);
  };
}
