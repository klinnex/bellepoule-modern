/**
 * BellePoule Modern - Cartons des matchs de poule pour la feuille imprimée (#1829)
 * Les cartons sont en base (`match_cards`) ; la feuille de poule les affiche, cartons P à part
 * (t.124.3.e). Copie des poules : l'état React n'est pas modifié.
 * Licensed under GPL-3.0
 */

import { MatchStatus, type Card, type Pool } from '../../shared/types';

export async function withMatchCards(pools: Pool[]): Promise<Pool[]> {
  const getCards = window.electronAPI?.db?.getCards;
  if (!getCards) return pools;
  return Promise.all(
    pools.map(async pool => ({
      ...pool,
      matches: await Promise.all(
        (pool.matches ?? []).map(async m => {
          if (m.status !== MatchStatus.FINISHED) return m;
          const rows = await getCards(m.id).catch(() => []);
          if (!rows.length) return m;
          const cards = rows.map(
            r =>
              ({
                id: r.id,
                matchId: m.id,
                fencerId: r.fencerId,
                type: r.cardType,
                timestamp: new Date(r.timestamp),
                pointsAwarded: r.pointsAwarded,
                resultingExclusion: r.resultingExclusion,
              }) as Card
          );
          return { ...m, cards };
        })
      ),
    }))
  );
}
