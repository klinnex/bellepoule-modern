/**
 * BellePoule Modern - Affectation automatique des arbitres d'une épreuve (#1959)
 *
 * Construit les créneaux (une poule = un créneau ; un match de tableau = un créneau,
 * tour par tour) et résout chaque tour par appariement optimal (refereeMatching).
 * Tous les matchs d'une poule reçoivent l'arbitre de la poule.
 * Licensed under GPL-3.0
 */

import type { Match, Pool, Referee } from '../types';
import {
  MatchingReferee,
  MatchingSlot,
  MatchingWeights,
  NeutralityCriterion,
  NeutralityRules,
  refereeLevelFromCategory,
  solveRefereeMatching,
} from './refereeMatching';

export interface AutoAssignOptions {
  neutrality: NeutralityRules;
  weights?: Partial<MatchingWeights>;
  /** Matchs dont l'arbitre a été choisi à la main : conservé */
  lockedMatchIds?: ReadonlySet<string>;
  /** Affectations actuelles (pour les verrous) */
  current?: ReadonlyMap<string, Referee>;
  /** Arbitres occupés dans une autre épreuve de la journée */
  busyElsewhere?: ReadonlySet<string>;
  /** Matchs déjà arbitrés (rotation) : par défaut referee.assignedMatches */
  matchesToday?: ReadonlyMap<string, number>;
  /** Équilibrer la charge (poids rotation) */
  balance?: boolean;
}

/** Créneau décrit pour l'affichage du diagnostic */
export interface SlotRef {
  kind: 'pool' | 'tableau';
  /** Numéro de poule, ou numéro de match de tableau */
  number: number;
  round?: number;
}

export interface AutoAssignShortage {
  slots: SlotRef[];
  missing: number;
  compatible: Referee[];
  conflicts: { referee: Referee; slot: SlotRef; reasons: NeutralityCriterion[] }[];
}

export interface AutoAssignResult {
  assignments: Map<string, Referee>;
  shortages: AutoAssignShortage[];
}

const STRONG_ROUND = 4; // quarts de finale et au-delà

function poolStrengths(pools: Pool[]): Map<string, number> {
  // Moyenne des classements (plus petit = plus fort) ; sans classement : neutre
  const means = pools.map(p => {
    const ranks = p.fencers.map(f => f.ranking).filter((r): r is number => !!r && r > 0);
    return {
      id: p.id,
      mean: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
    };
  });
  const ranked = means
    .filter(m => m.mean !== null)
    .sort((a, b) => (a.mean as number) - (b.mean as number));
  const out = new Map<string, number>();
  for (const m of means) out.set(m.id, 0.5);
  ranked.forEach((m, i) => out.set(m.id, ranked.length > 1 ? 1 - i / (ranked.length - 1) : 0.5));
  return out;
}

function tableauStrength(round: number | undefined): number {
  if (!round) return 0;
  if (round <= STRONG_ROUND) return 1;
  if (round <= 16) return 0.5;
  return 0;
}

export function autoAssignReferees(
  pendingMatches: Match[],
  pools: Pool[],
  referees: Referee[],
  options: AutoAssignOptions
): AutoAssignResult {
  const locked = options.lockedMatchIds ?? new Set<string>();
  const current = options.current ?? new Map<string, Referee>();
  const refById = new Map(referees.map(r => [r.id, r]));
  const matchingRefs: MatchingReferee[] = referees.map(r => ({
    id: r.id,
    club: r.club,
    nationality: r.nationality,
    region: r.region,
    level: refereeLevelFromCategory(r.category),
    available: r.status !== 'unavailable' && !options.busyElsewhere?.has(r.id),
    matchesToday: options.matchesToday?.get(r.id) ?? r.assignedMatches ?? 0,
    maxMatchesPerDay: r.maxMatchesPerDay,
  }));
  const weights: Partial<MatchingWeights> = {
    ...(options.balance === false ? { load: 0 } : {}),
    ...options.weights,
  };

  const assignments = new Map<string, Referee>();
  const shortages: AutoAssignShortage[] = [];

  const solve = (
    slots: MatchingSlot[],
    slotMatches: Map<string, Match[]>,
    slotRefs: Map<string, SlotRef>
  ) => {
    if (slots.length === 0) return;
    const res = solveRefereeMatching(slots, matchingRefs, {
      neutrality: options.neutrality,
      weights,
    });
    for (const [slotId, refId] of res.assignments) {
      const ref = refById.get(refId);
      if (!ref) continue;
      for (const m of slotMatches.get(slotId) ?? []) assignments.set(m.id, ref);
    }
    for (const sh of res.shortages) {
      shortages.push({
        slots: sh.slotIds.map(id => slotRefs.get(id) as SlotRef),
        missing: sh.missing,
        compatible: sh.compatibleRefereeIds.map(id => refById.get(id) as Referee),
        conflicts: sh.conflicts.map(c => ({
          referee: refById.get(c.refereeId) as Referee,
          slot: slotRefs.get(c.slotId) as SlotRef,
          reasons: c.reasons,
        })),
      });
    }
  };

  const lockOf = (ms: Match[]): string | null => {
    for (const m of ms) {
      if (locked.has(m.id)) {
        const r = current.get(m.id);
        if (r) return r.id;
      }
    }
    return null;
  };

  // Poules : un créneau par poule, une seule résolution
  const byPool = new Map<string, Match[]>();
  const tableau = new Map<number, Match[]>();
  for (const m of pendingMatches) {
    if (m.poolId && pools.some(p => p.id === m.poolId)) {
      const list = byPool.get(m.poolId) ?? [];
      list.push(m);
      byPool.set(m.poolId, list);
    } else if (!m.poolId) {
      const key = m.round ?? 0;
      const list = tableau.get(key) ?? [];
      list.push(m);
      tableau.set(key, list);
    }
  }

  const strengths = poolStrengths(pools.filter(p => byPool.has(p.id)));
  const poolSlots: MatchingSlot[] = [];
  const poolSlotMatches = new Map<string, Match[]>();
  const poolSlotRefs = new Map<string, SlotRef>();
  for (const pool of [...pools].sort((a, b) => a.number - b.number)) {
    const ms = byPool.get(pool.id);
    if (!ms) continue;
    const id = `pool:${pool.id}`;
    poolSlots.push({
      id,
      clubs: pool.fencers.map(f => f.club),
      nationalities: pool.fencers.map(f => f.nationality),
      regions: pool.fencers.map(f => f.region),
      strength: strengths.get(pool.id),
      strip: pool.strip ?? null,
      lockedRefereeId: lockOf(ms),
    });
    poolSlotMatches.set(id, ms);
    poolSlotRefs.set(id, { kind: 'pool', number: pool.number });
  }
  solve(poolSlots, poolSlotMatches, poolSlotRefs);

  // Tableau : tour par tour, neutralité sur les deux tireurs du match
  for (const [round, ms] of [...tableau.entries()].sort((a, b) => b[0] - a[0])) {
    const slots: MatchingSlot[] = [];
    const slotMatches = new Map<string, Match[]>();
    const slotRefs = new Map<string, SlotRef>();
    for (const m of ms) {
      const id = `match:${m.id}`;
      const fencers = [m.fencerA, m.fencerB];
      slots.push({
        id,
        clubs: fencers.map(f => f?.club),
        nationalities: fencers.map(f => f?.nationality),
        regions: fencers.map(f => f?.region),
        strength: tableauStrength(round),
        strip: m.strip ?? null,
        lockedRefereeId: lockOf([m]),
      });
      slotMatches.set(id, [m]);
      slotRefs.set(id, { kind: 'tableau', number: m.number, round: round || undefined });
    }
    solve(slots, slotMatches, slotRefs);
  }

  return { assignments, shortages };
}
