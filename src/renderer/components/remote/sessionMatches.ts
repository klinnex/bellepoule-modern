/**
 * BellePoule Modern - Matchs transmis au serveur de saisie distante au démarrage
 * Licensed under GPL-3.0
 */
import type { Pool } from '../../../shared/types';
import type { TableauMatch } from '../tableau/tableauTypes';

/**
 * Prépare la liste de matchs de la session distante.
 * Des marqueurs d'ordre des tireurs précèdent les matchs de chaque poule pour que le serveur
 * reconstruise correctement poolFencersCache : l'ordre FIE des poules de 4 commence par [1,4]
 * et non [1,2], donc extraire les tireurs des paires de matchs donnerait un ordre faux.
 * `stripMap` donne la piste de chaque poule (intervalle de pistes + pistes disponibles, #1501).
 */
export function buildSessionMatches(
  pools: Pool[],
  tableauMatches: TableauMatch[],
  stripMap: Map<string, number>
) {
  const sortedPools = [...pools].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const poolMatches = sortedPools.flatMap(pool => [
    {
      __poolFencers: true,
      poolId: pool.id,
      poolNumber: pool.number,
      strip: stripMap.get(pool.id) ?? pool.strip,
      fencers: pool.fencers || [],
    },
    ...(pool.matches || []),
  ]);
  const deMatches = tableauMatches
    .filter(m => m.winner === null && m.fencerA && m.fencerB)
    .map(m => ({ ...m, isTableau: true }));
  return { poolMatches, deMatches, allMatches: [...poolMatches, ...deMatches] };
}
