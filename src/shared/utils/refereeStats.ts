/**
 * BellePoule Modern - Statistiques des arbitres
 * Comptage des matchs arbitrés (poules + tableau) par arbitre
 * Licensed under GPL-3.0
 */

import { Match, MatchStatus, Referee } from '../types';

type RefereeRef = { id: string };

/** Match de tableau réduit aux champs utiles au comptage */
export interface TableauMatchLike {
  id: string;
  isBye: boolean;
  winner: unknown | null;
  referee?: RefereeRef | null;
  referees?: RefereeRef[];
}

export interface RefereeMatchStats {
  refereeId: string;
  refereeName: string;
  club?: string;
  /** Matchs de poule terminés */
  poolMatches: number;
  /** Matchs de tableau (principal + consolantes) terminés */
  tableauMatches: number;
  /** Total des matchs arbitrés (terminés) */
  totalMatches: number;
  /** Matchs assignés non encore terminés */
  pendingMatches: number;
}

const tableauRefereeIds = (m: TableauMatchLike): string[] => {
  if (m.referees?.length) return m.referees.map(r => r.id);
  return m.referee ? [m.referee.id] : [];
};

/**
 * Calcule, pour chaque arbitre, le nombre de matchs arbitrés.
 * Les matchs sont dédupliqués par id. En mode expert (plusieurs arbitres
 * par match de tableau), chaque arbitre assigné est crédité du match.
 * Tri : total décroissant, puis nom.
 */
export function computeRefereeMatchStats(
  referees: Referee[],
  poolMatches: Match[],
  tableauMatches: TableauMatchLike[]
): RefereeMatchStats[] {
  const stats = new Map<string, RefereeMatchStats>();
  for (const r of referees) {
    stats.set(r.id, {
      refereeId: r.id,
      refereeName: `${r.firstName} ${r.lastName}`.trim(),
      club: r.club,
      poolMatches: 0,
      tableauMatches: 0,
      totalMatches: 0,
      pendingMatches: 0,
    });
  }

  const seen = new Set<string>();
  for (const m of poolMatches) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const s = m.referee ? stats.get(m.referee.id) : undefined;
    if (!s || m.status === MatchStatus.CANCELLED) continue;
    if (m.status === MatchStatus.FINISHED) {
      s.poolMatches++;
      s.totalMatches++;
    } else {
      s.pendingMatches++;
    }
  }

  for (const m of tableauMatches) {
    if (seen.has(m.id) || m.isBye) continue;
    seen.add(m.id);
    for (const id of new Set(tableauRefereeIds(m))) {
      const s = stats.get(id);
      if (!s) continue;
      if (m.winner) {
        s.tableauMatches++;
        s.totalMatches++;
      } else {
        s.pendingMatches++;
      }
    }
  }

  return [...stats.values()].sort(
    (a, b) => b.totalMatches - a.totalMatches || a.refereeName.localeCompare(b.refereeName)
  );
}
