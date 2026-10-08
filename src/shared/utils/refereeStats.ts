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

/** Arbitre candidat à l'assignation automatique */
export interface AssignableReferee {
  id: string;
  club?: string;
  status?: string;
}

/** Match réduit aux champs utiles à l'assignation automatique */
export interface AssignableMatch {
  id: string;
  fencerA?: { club?: string } | null;
  fencerB?: { club?: string } | null;
}

/**
 * Assigne un arbitre à chaque match (remplissage automatique de test).
 * Rotation : arbitre le moins chargé, en évitant les conflits de club et
 * les arbitres indisponibles quand c'est possible.
 * `load` (nombre de matchs déjà arbitrés par id) est mis à jour en place,
 * ce qui permet de partager la charge entre plusieurs appels.
 */
export function autoAssignReferees<R extends AssignableReferee>(
  matches: AssignableMatch[],
  referees: R[],
  load: Map<string, number> = new Map()
): Map<string, R> {
  const result = new Map<string, R>();
  const available = referees.filter(r => r.status !== 'unavailable');
  const pool = available.length > 0 ? available : referees;
  if (pool.length === 0) return result;

  for (const m of matches) {
    const clubs = new Set([m.fencerA?.club, m.fencerB?.club].filter((c): c is string => !!c));
    const neutral = pool.filter(r => !r.club || !clubs.has(r.club));
    const candidates = neutral.length > 0 ? neutral : pool;
    let best = candidates[0];
    for (const r of candidates) {
      if ((load.get(r.id) ?? 0) < (load.get(best.id) ?? 0)) best = r;
    }
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    result.set(m.id, best);
  }
  return result;
}

/** Statut de présence affiché pour un arbitre (#1016) */
export type RefereePresence = 'not_checked_in' | 'checked_in' | 'busy' | 'free';

export const REFEREE_PRESENCE_LABELS: Record<RefereePresence, string> = {
  not_checked_in: 'Non pointé',
  checked_in: 'Pointé',
  busy: 'Occupé',
  free: 'Libre',
};

/**
 * Non pointé tant que l'arbitre n'est pas pointé (appel ou application).
 * Une fois des matchs générés : Occupé s'il a un match assigné non terminé ou s'il a
 * atteint sa limite d'assignations (`maxMatchesPerDay`), Libre sinon.
 */
export function getRefereePresence(
  referee: Pick<Referee, 'id' | 'status' | 'maxMatchesPerDay'>,
  matches: Pick<Match, 'status' | 'referee'>[]
): RefereePresence {
  if (referee.status === 'unavailable') return 'not_checked_in';
  if (matches.length === 0) return 'checked_in';
  let pending = 0;
  let assigned = 0;
  for (const m of matches) {
    if (m.referee?.id !== referee.id || m.status === MatchStatus.CANCELLED) continue;
    assigned++;
    if (m.status !== MatchStatus.FINISHED) pending++;
  }
  const maxReached = !!referee.maxMatchesPerDay && assigned >= referee.maxMatchesPerDay;
  return pending > 0 || maxReached ? 'busy' : 'free';
}
