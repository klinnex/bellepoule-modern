/**
 * BellePoule Modern - Cartons des poules pour les feuilles imprimées (#1829)
 * Licensed under GPL-3.0
 */
import type { Pool } from '../../shared/types';

/**
 * Cartons reçus dans chaque poule : poolId → (fencerId → types). Une seule lecture en base
 * pour toutes les poules ; optionnels : échec silencieux (feuille imprimée sans cartons).
 */
export async function loadPoolCards(
  pools: Pool[]
): Promise<Record<string, Record<string, string[]>>> {
  try {
    const poolOfMatch = new Map<string, string>();
    for (const pool of pools)
      for (const m of pool.matches ?? []) if (m.id) poolOfMatch.set(m.id, pool.id);
    if (poolOfMatch.size === 0) return {};
    const rows: Array<{ matchId: string; fencerId: string; cardType: string }> =
      (await window.electronAPI?.db?.getCardsByMatchIds?.([...poolOfMatch.keys()])) ?? [];
    // Pas d'import du module PDF ici : il reste chargé à la demande (budget du bundle)
    const byPool: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      const poolId = poolOfMatch.get(row.matchId);
      if (!poolId || !row.fencerId || !row.cardType) continue;
      ((byPool[poolId] ??= {})[row.fencerId] ??= []).push(row.cardType);
    }
    return byPool;
  } catch {
    return {};
  }
}
