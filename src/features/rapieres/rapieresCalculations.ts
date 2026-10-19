/**
 * BellePoule Modern - Tournoi des rapières : calculs (#1118)
 * Répartition des poules par niveau, vagues de rencontres, qualification pour le tableau,
 * classements par niveau et par catégorie d'âge.
 * Licensed under GPL-3.0
 */

import { Fencer, FencerStatus, MatchStatus, Pool, PoolRanking } from '../../shared/types';
import { calculatePoolRanking } from '../../shared/utils/poolCalculations';
import {
  RAPIERES_LEVELS,
  RapieresAgeCategory,
  RapieresFencer,
  RapieresLevel,
  RapieresTeamInfo,
} from './rapieres.types';

export const RAPIERES_MAX_POOL_SIZE = 10;

/** Prénom affiché de l'équipe : noms des deux tireurs */
export const teamMembersLabel = (fencers: [RapieresFencer, RapieresFencer]): string =>
  fencers
    .map(f => f.lastName.trim().toUpperCase())
    .filter(Boolean)
    .join(' / ');

const isWithdrawn = (f: Fencer | null | undefined): boolean =>
  f?.status === FencerStatus.ABANDONED ||
  f?.status === FencerStatus.FORFAIT ||
  f?.status === FencerStatus.EXCLUDED;

// ─── Poules ──────────────────────────────────────────────────────────────────

/**
 * Répartit les équipes en `poolCount` poules de tailles équilibrées (écart ≤ 1),
 * équipes de même niveau regroupées (débutants, puis intermédiaires, puis experts).
 */
export function distributeByLevel(
  fencers: Fencer[],
  poolCount: number,
  levelOf: (fencerId: string) => RapieresLevel | undefined
): Fencer[][] {
  const count = Math.max(1, Math.min(poolCount, fencers.length || 1));
  const rank = (f: Fencer) => {
    const i = RAPIERES_LEVELS.indexOf(levelOf(f.id) ?? 'beginner');
    return i < 0 ? 0 : i;
  };
  const sorted = [...fencers].sort((a, b) => rank(a) - rank(b));
  const base = Math.floor(sorted.length / count);
  const extra = sorted.length % count;
  const pools: Fencer[][] = [];
  let i = 0;
  for (let p = 0; p < count; p++) {
    const size = base + (p < extra ? 1 : 0);
    pools.push(sorted.slice(i, i + size));
    i += size;
  }
  return pools;
}

// ─── Vagues ──────────────────────────────────────────────────────────────────

type Pair = [string, string];

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Couplage de taille maximale parmi les paires restantes (recherche exhaustive, ≤ 10 équipes) */
function maxMatching(teamIds: string[], remaining: Set<string>): Pair[] {
  let best: Pair[] = [];
  const target = Math.floor(teamIds.length / 2);
  const search = (free: string[], acc: Pair[]): boolean => {
    if (acc.length > best.length) best = [...acc];
    if (best.length === target) return true;
    if (free.length < 2 || acc.length + Math.floor(free.length / 2) <= best.length) return false;
    const [first, ...rest] = free;
    for (let j = 0; j < rest.length; j++) {
      if (!remaining.has(pairKey(first, rest[j]))) continue;
      const next = rest.filter((_, k) => k !== j);
      if (search(next, [...acc, [first, rest[j]]])) return true;
    }
    // `first` au repos dans cette vague
    return search(rest, acc);
  };
  search(teamIds, []);
  return best;
}

/**
 * Calendrier en vagues d'une poule (round-robin : chaque équipe rencontre toutes les autres).
 * Chaque vague fait tirer toutes les équipes en même temps. Nombre impair : une équipe tire
 * deux fois dans la vague, jamais deux fois la même sur l'ensemble des vagues.
 * Les équipes les plus contraintes (paires restantes nombreuses) sont appariées en premier.
 */
export function scheduleWaves(
  teamIds: string[]
): { teamAId: string; teamBId: string; wave: number }[] {
  const remaining = new Set<string>();
  for (let i = 0; i < teamIds.length; i++)
    for (let j = i + 1; j < teamIds.length; j++) remaining.add(pairKey(teamIds[i], teamIds[j]));
  const doubled = new Set<string>();
  const result: { teamAId: string; teamBId: string; wave: number }[] = [];
  const pending = (id: string) =>
    teamIds.filter(o => o !== id && remaining.has(pairKey(id, o))).length;

  for (let wave = 1; remaining.size > 0; wave++) {
    const order = [...teamIds].sort((a, b) => pending(b) - pending(a));
    const pairs = maxMatching(order, remaining);
    for (const [a, b] of pairs) remaining.delete(pairKey(a, b));
    const busy = new Set(pairs.flat());
    // Équipe au repos : elle tire contre une équipe qui n'a encore jamais tiré deux fois
    for (const idle of order.filter(id => !busy.has(id))) {
      const partner = order.find(
        o => o !== idle && busy.has(o) && !doubled.has(o) && remaining.has(pairKey(idle, o))
      );
      if (!partner) continue;
      remaining.delete(pairKey(idle, partner));
      doubled.add(partner);
      busy.add(idle);
      pairs.push([partner, idle]);
    }
    if (pairs.length === 0) break; // garde-fou (ne doit pas arriver)
    for (const [a, b] of pairs) result.push({ teamAId: a, teamBId: b, wave });
  }
  return result;
}

/** Ordre des matchs d'une poule (paires 1-indexées) suivant les vagues */
export function waveMatchOrder(poolFencers: Fencer[]): [number, number][] {
  const index = new Map(poolFencers.map((f, i) => [f.id, i + 1]));
  return scheduleWaves(poolFencers.map(f => f.id)).map(b => [
    index.get(b.teamAId)!,
    index.get(b.teamBId)!,
  ]);
}

/** Vague de chaque match d'une poule (id du match → numéro de vague) */
export function poolMatchWaves(pool: Pool): Map<string, number> {
  const waveOf = new Map(
    scheduleWaves(pool.fencers.map(f => f.id)).map(b => [pairKey(b.teamAId, b.teamBId), b.wave])
  );
  const result = new Map<string, number>();
  for (const m of pool.matches) {
    if (!m.fencerA || !m.fencerB) continue;
    const wave = waveOf.get(pairKey(m.fencerA.id, m.fencerB.id));
    if (wave !== undefined) result.set(m.id, wave);
  }
  return result;
}

/** Nombre de vagues : celui de la poule la plus longue */
export const waveCount = (pools: Pool[]): number =>
  pools.reduce((max, p) => Math.max(max, ...poolMatchWaves(p).values()), 0);

/** Matchs de la vague `wave`, toutes poules confondues */
export function waveMatchIds(pools: Pool[], wave: number): Set<string> {
  const ids = new Set<string>();
  if (wave < 1) return ids;
  for (const pool of pools) for (const [id, w] of poolMatchWaves(pool)) if (w === wave) ids.add(id);
  return ids;
}

/** Vague terminée : chaque match joué, annulé, ou avec une équipe retirée */
export function isWaveComplete(pools: Pool[], wave: number): boolean {
  const ids = waveMatchIds(pools, wave);
  return pools.every(pool =>
    pool.matches
      .filter(m => ids.has(m.id))
      .every(
        m =>
          m.status === MatchStatus.FINISHED ||
          m.status === MatchStatus.CANCELLED ||
          isWithdrawn(m.fencerA) ||
          isWithdrawn(m.fencerB)
      )
  );
}

/** Le DT peut lancer la vague suivante */
export const canLaunchNextWave = (pools: Pool[], launchedWave: number): boolean =>
  launchedWave < waveCount(pools) && (launchedWave === 0 || isWaveComplete(pools, launchedWave));

// ─── Qualification ───────────────────────────────────────────────────────────

/** Qualifiés par poule : 1ers, et 2es aussi si 3 poules ou moins */
export const qualifiersPerPool = (poolCount: number): number => (poolCount <= 3 ? 2 : 1);

/**
 * Classement général réduit aux qualifiés pour le tableau (rangs recalculés),
 * équipes retirées exclues.
 */
export function filterRapieresQualifiers(pools: Pool[], overall: PoolRanking[]): PoolRanking[] {
  const perPool = qualifiersPerPool(pools.length);
  const qualified = new Set<string>();
  for (const pool of pools) {
    const ranking = pool.ranking?.length ? pool.ranking : calculatePoolRanking(pool);
    ranking
      .filter(r => !isWithdrawn(r.fencer) && r.rank <= perPool)
      .forEach(r => qualified.add(r.fencer.id));
  }
  return overall.filter(r => qualified.has(r.fencer.id)).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ─── Filtres de classement ───────────────────────────────────────────────────

export type RapieresRankingFilter =
  | { kind: 'teams' }
  | { kind: 'level'; level: RapieresLevel }
  | { kind: 'category'; category: RapieresAgeCategory };

export interface RapieresDisplayRow {
  rank: number;
  teamId: string;
  /** Tireur concerné (classement individuel par catégorie d'âge), sinon absent */
  fencerIndex?: 0 | 1;
}

/**
 * Applique un filtre à un classement d'équipes déjà ordonné (rangs recalculés dans le filtre,
 * ex æquo conservés). Par catégorie : un rang par tireur, avec le résultat de son équipe.
 */
export function filterRanking(
  ranked: { teamId: string; rank: number }[],
  teams: Record<string, RapieresTeamInfo>,
  filter: RapieresRankingFilter
): RapieresDisplayRow[] {
  const rows: (RapieresDisplayRow & { source: number })[] = [];
  for (const r of ranked) {
    const team = teams[r.teamId];
    if (filter.kind === 'teams') rows.push({ rank: 0, teamId: r.teamId, source: r.rank });
    else if (!team) continue;
    else if (filter.kind === 'level') {
      if (team.level === filter.level) rows.push({ rank: 0, teamId: r.teamId, source: r.rank });
    } else {
      team.fencers.forEach((f, i) => {
        if (f.category === filter.category)
          rows.push({ rank: 0, teamId: r.teamId, fencerIndex: i as 0 | 1, source: r.rank });
      });
    }
  }
  return rows.map((row, i) => ({
    teamId: row.teamId,
    ...(row.fencerIndex !== undefined ? { fencerIndex: row.fencerIndex } : {}),
    rank:
      i > 0 && rows[i - 1].source === row.source
        ? rows.findIndex(x => x.source === row.source) + 1
        : i + 1,
  }));
}

// ─── Classement final ────────────────────────────────────────────────────────

/**
 * Classement final des équipes : résultats du tableau, puis équipes non qualifiées dans
 * l'ordre du classement de poules ; équipes exclues en dernier.
 */
export function mergeFinalRanking(
  tableauResults: { fencer: Fencer; rank: number }[],
  overall: PoolRanking[]
): { teamId: string; rank: number }[] {
  const rows = [...tableauResults]
    .sort((a, b) => a.rank - b.rank)
    .map(r => ({
      teamId: r.fencer.id,
      rank: r.rank,
      excluded: r.fencer.status === FencerStatus.EXCLUDED,
    }));
  const placed = new Set(rows.map(r => r.teamId));
  let next = rows.reduce((max, r) => Math.max(max, r.rank), 0);
  for (const r of overall) {
    if (placed.has(r.fencer.id)) continue;
    placed.add(r.fencer.id);
    rows.push({
      teamId: r.fencer.id,
      rank: ++next,
      excluded: r.fencer.status === FencerStatus.EXCLUDED,
    });
  }
  const ordered = [...rows.filter(r => !r.excluded), ...rows.filter(r => r.excluded)];
  // Exclues déplacées : rangs renumérotés en conservant les ex æquo du tableau
  const result: { teamId: string; rank: number }[] = [];
  ordered.forEach((r, i) => {
    const prev = ordered[i - 1];
    const tied = !!prev && !r.excluded && !prev.excluded && prev.rank === r.rank;
    result.push({ teamId: r.teamId, rank: tied ? result[i - 1].rank : i + 1 });
  });
  return result;
}
