/**
 * BellePoule Modern - Indicateurs du tableau analytique (#1817)
 * Fonctions pures : indice moyen, KPI par tireur, progression au classement,
 * indicateurs d'organisation (avancement, débit, attente, pistes, connexions).
 * Licensed under GPL-3.0
 */

import {
  Fencer,
  FencerStatus,
  Match,
  MatchStatus,
  MatchTiming,
  Pool,
  RemoteEvent,
} from '../../../shared/types';
import { estimatePhaseEta } from '../../../shared/utils/phaseEta';

/** Match terminé ramené à une forme commune (poule ou tableau). */
export interface KpiMatch {
  id: string;
  fencerAId: string;
  fencerBId: string;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
}

/** Sous-ensemble de TableauMatch (renderer) utile aux KPI. */
export interface KpiTableauMatch {
  id: string;
  round: number;
  fencerA: { id: string } | null;
  fencerB: { id: string } | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: { id: string } | null;
  isBye: boolean;
  /** Match perdu sur abandon / forfait / exclusion (non disputé jusqu'au bout) */
  specialStatus?: { status: string } | null;
}

const time = (v: unknown): number => {
  if (!v) return 0;
  const n = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Matchs terminés dans l'ordre chronologique : poules (heure de fin connue, sinon
 * dernière mise à jour, sinon numéro) puis tableau du plus grand tour au plus petit.
 */
export function normalizeFinishedMatches(
  poolMatches: Match[],
  tableauMatches: KpiTableauMatch[] = [],
  timings: MatchTiming[] = []
): KpiMatch[] {
  const endOf = new Map(timings.map(t => [t.matchId, time(t.endTime)]));
  const pool = poolMatches
    .filter(m => m.status === MatchStatus.FINISHED && m.fencerA?.id && m.fencerB?.id)
    .map(m => ({
      m,
      at: endOf.get(m.id) || time(m.endTime) || time(m.updatedAt),
    }))
    .sort((a, b) => a.at - b.at || a.m.number - b.m.number)
    .map(({ m }) => ({
      id: m.id,
      fencerAId: m.fencerA!.id,
      fencerBId: m.fencerB!.id,
      scoreA: m.scoreA?.value ?? 0,
      scoreB: m.scoreB?.value ?? 0,
      winnerId: m.scoreA?.isVictory ? m.fencerA!.id : m.scoreB?.isVictory ? m.fencerB!.id : null,
    }));
  const tableau = tableauMatches
    .filter(
      m => !m.isBye && m.winner && m.fencerA && m.fencerB && m.scoreA != null && m.scoreB != null
    )
    .sort((a, b) => b.round - a.round)
    .map(m => ({
      id: m.id,
      fencerAId: m.fencerA!.id,
      fencerBId: m.fencerB!.id,
      scoreA: m.scoreA ?? 0,
      scoreB: m.scoreB ?? 0,
      winnerId: m.winner!.id,
    }));
  return [...pool, ...tableau];
}

function sideOf(m: KpiMatch, fencerId: string) {
  const isA = m.fencerAId === fencerId;
  return {
    td: isA ? m.scoreA : m.scoreB,
    tr: isA ? m.scoreB : m.scoreA,
    won: m.winnerId === fencerId,
  };
}

export interface FencerIndexEntry {
  fencerId: string;
  matches: number;
  /** Moyenne de (touches données − touches reçues) par match */
  averageIndex: number;
}

/** Indice moyen (TD − TR moyen par match) de chaque tireur, du meilleur au moins bon. */
export function fencerIndexRanking(matches: KpiMatch[]): FencerIndexEntry[] {
  const acc = new Map<string, { n: number; sum: number }>();
  for (const m of matches) {
    for (const id of [m.fencerAId, m.fencerBId]) {
      const { td, tr } = sideOf(m, id);
      const e = acc.get(id) ?? { n: 0, sum: 0 };
      e.n++;
      e.sum += td - tr;
      acc.set(id, e);
    }
  }
  return [...acc.entries()]
    .map(([fencerId, e]) => ({ fencerId, matches: e.n, averageIndex: e.sum / e.n }))
    .sort((a, b) => b.averageIndex - a.averageIndex || b.matches - a.matches);
}

export interface FencerMatchKpis {
  played: number;
  wins: number;
  losses: number;
  /** Écart moyen |TD − TR| sur tous les matchs */
  averageGap: number;
  /** Écart moyen signé : + si les victoires pèsent plus que les défaites, − sinon */
  averageSignedGap: number;
  averageWinGap: number;
  averageLossGap: number;
  /** Victoires serrées : écart ≤ 2 touches */
  closeWins: number;
  /** Victoires dominantes : écart ≥ 3 et ≥ la moitié des touches du vainqueur */
  dominantWins: number;
  /** Victoires normales : ni serrées ni dominantes (#1817) */
  normalWins: number;
  bestWinStreak: number;
  bestLossStreak: number;
  current: { kind: 'W' | 'L'; length: number } | null;
  /** Suite chronologique des résultats (V/D) */
  sequence: Array<'W' | 'L'>;
}

export const CLOSE_GAP = 2;

export function fencerMatchKpis(fencerId: string, matches: KpiMatch[]): FencerMatchKpis {
  const own = matches.filter(m => m.fencerAId === fencerId || m.fencerBId === fencerId);
  const sequence: Array<'W' | 'L'> = [];
  let gapSum = 0;
  let winGap = 0;
  let lossGap = 0;
  let closeWins = 0;
  let dominantWins = 0;
  let normalWins = 0;
  for (const m of own) {
    const { td, tr, won } = sideOf(m, fencerId);
    const gap = Math.abs(td - tr);
    gapSum += gap;
    sequence.push(won ? 'W' : 'L');
    if (won) {
      winGap += gap;
      if (gap <= CLOSE_GAP) closeWins++;
      else if (gap >= 3 && gap * 2 >= td) dominantWins++;
      else normalWins++;
    } else lossGap += gap;
  }
  let bestWinStreak = 0;
  let bestLossStreak = 0;
  let run = 0;
  sequence.forEach((r, i) => {
    run = i > 0 && sequence[i - 1] === r ? run + 1 : 1;
    if (r === 'W') bestWinStreak = Math.max(bestWinStreak, run);
    else bestLossStreak = Math.max(bestLossStreak, run);
  });
  const wins = sequence.filter(r => r === 'W').length;
  const losses = sequence.length - wins;
  return {
    played: own.length,
    wins,
    losses,
    averageGap: own.length ? gapSum / own.length : 0,
    averageSignedGap: own.length ? (winGap - lossGap) / own.length : 0,
    averageWinGap: wins ? winGap / wins : 0,
    averageLossGap: losses ? lossGap / losses : 0,
    closeWins,
    dominantWins,
    normalWins,
    bestWinStreak,
    bestLossStreak,
    current: sequence.length ? { kind: sequence[sequence.length - 1], length: run } : null,
    sequence,
  };
}

/** Classement d'entrée : tireurs présents triés par classement (non classés à la fin). */
export function initialRankOf(fencers: Fencer[], fencerId: string): number | null {
  const present = fencers.filter(f => f.status !== FencerStatus.NOT_CHECKED_IN);
  const sorted = present
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const ra = a.f.ranking && a.f.ranking > 0 ? a.f.ranking : Infinity;
      const rb = b.f.ranking && b.f.ranking > 0 ? b.f.ranking : Infinity;
      return ra - rb || a.i - b.i;
    });
  const idx = sorted.findIndex(x => x.f.id === fencerId);
  return idx >= 0 ? idx + 1 : null;
}

export interface RankingStep {
  key: 'initial' | 'pools' | 'final';
  rank: number | null;
  /** Places gagnées depuis l'étape précédente connue (positif = progression) */
  delta: number | null;
}

export function rankingProgression(
  initial: number | null,
  afterPools: number | null,
  final: number | null
): RankingStep[] {
  const steps: RankingStep[] = [];
  let prev: number | null = null;
  for (const [key, rank] of [
    ['initial', initial],
    ['pools', afterPools],
    ['final', final],
  ] as const) {
    steps.push({ key, rank, delta: rank != null && prev != null ? prev - rank : null });
    if (rank != null) prev = rank;
  }
  return steps;
}

// ── Organisation ──────────────────────────────────────────────────────────────

export interface PoolOrgProgress {
  poolId: string;
  poolNumber: number;
  done: number;
  total: number;
  inProgress: number;
  percent: number;
  late: boolean;
}

export interface LiveArena {
  number: number;
  status: string;
  matchId: string | null;
}

export interface OrganisationKpis {
  pools: PoolOrgProgress[];
  poolsDone: number;
  poolsTotal: number;
  done: number;
  total: number;
  pending: number;
  inProgress: number;
  /** Fin estimée (ms) ; null si rien à estimer */
  etaAt: number | null;
  etaBasis: 'measured' | 'default' | null;
  /** Fin estimée des poules (ms) ; null si poules terminées ou absentes (#1817) */
  poolsEtaAt: number | null;
  /** Fin réelle des poules (ms) : dernier match de poule terminé, une fois toutes les poules finies */
  poolsEndAt: number | null;
  /** Fin estimée de la compétition (ms) : tableau projeté tant qu'il n'est pas généré */
  competitionEtaAt: number | null;
  /** Durée projetée du tableau (ms) tant qu'il n'est pas généré ; null sinon */
  tableauProjectionMs: number | null;
  /** Tableau généré */
  hasTableau: boolean;
  /** Fin du dernier match terminé (ms) ; null si aucun horodatage */
  lastEndAt: number | null;
  /** Instant du calcul (ms) */
  now: number;
  /** Matchs terminés dans la dernière heure */
  lastHourThroughput: number;
  /** Débit moyen depuis le premier match lancé (matchs / h) */
  averageThroughput: number;
  /** Attente moyenne d'un tireur entre deux matchs (s) */
  averageWaitSeconds: number;
  /** Durée moyenne de combat (s) */
  averageFightSeconds: number;
  /** Occupation moyenne de la piste par match, début → fin (s) */
  averageWallSeconds: number;
  activeStrips: number[];
  stripCount: number;
  remote: { disconnects: number; offlineSyncs: number; syncErrors: number; dtCalls: number };
  recentIssues: RemoteEvent[];
}

/** Poule en retard : au moins 2 matchs de retard sur la médiane des poules (#1817) */
const LATE_GAP_MATCHES = 2;

/** Marque les poules en retard : au moins 2 matchs joués de moins que la médiane des poules (#1817) */
export function markLatePools(rows: Array<{ done: number; total: number; late: boolean }>): void {
  const open = rows.filter(p => p.total > 0);
  if (open.length < 2) return;
  const sorted = open.map(p => p.done).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  for (const p of open) p.late = p.done < p.total && median - p.done >= LATE_GAP_MATCHES;
}

export function organisationKpis(input: {
  pools: Pool[];
  tableauMatches?: KpiTableauMatch[];
  timings?: MatchTiming[];
  events?: RemoteEvent[];
  /** Pistes du serveur distant (match en cours = status in_progress) */
  arenas?: LiveArena[];
  now: number;
}): OrganisationKpis {
  const { pools, tableauMatches = [], timings = [], events = [], arenas = [], now } = input;
  const live = arenas.filter(a => a.status === 'in_progress' && a.matchId);
  const liveIds = new Set(live.map(a => a.matchId as string));

  const poolRows: PoolOrgProgress[] = pools.map(p => {
    const ms = p.matches ?? [];
    const done = ms.filter(m => m.status === MatchStatus.FINISHED).length;
    const inProgress = ms.filter(
      m =>
        m.status !== MatchStatus.FINISHED &&
        (m.status === MatchStatus.IN_PROGRESS || liveIds.has(m.id))
    ).length;
    return {
      poolId: p.id,
      poolNumber: p.number ?? 0,
      done,
      total: ms.length,
      inProgress: Math.min(inProgress, ms.length - done),
      percent: ms.length ? (done / ms.length) * 100 : 0,
      late: false,
    };
  });
  markLatePools(poolRows);

  const playableTableau = tableauMatches.filter(m => !m.isBye && m.fencerA && m.fencerB);
  const tableauDone = playableTableau.filter(m => m.winner).length;
  const poolMatchIds = new Set(pools.flatMap(p => (p.matches ?? []).map(m => m.id)));
  const tableauInProgress = live.filter(a => !poolMatchIds.has(a.matchId as string)).length;

  const poolDone = poolRows.reduce((s, p) => s + p.done, 0);
  const poolTotal = poolRows.reduce((s, p) => s + p.total, 0);
  const done = poolDone + tableauDone;
  const total = poolTotal + playableTableau.length;
  const inProgress = Math.min(
    poolRows.reduce((s, p) => s + p.inProgress, 0) + tableauInProgress,
    total - done
  );

  const finishedTimed = timings.filter(t => t.endTime && t.startTime);
  const wallMs = finishedTimed
    .map(t => ({ end: time(t.endTime), ms: time(t.endTime) - time(t.startTime) }))
    .filter(x => x.ms > 0)
    .sort((a, b) => a.end - b.end);
  const fights = finishedTimed.map(t => t.duration ?? 0).filter(d => d > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // Pistes : celles déjà utilisées, sinon une par poule
  const strips = new Set<number>(arenas.map(a => a.number));
  for (const t of timings) if (t.strip != null) strips.add(t.strip);
  for (const p of pools) if (p.strip != null) strips.add(p.strip);
  const parallel = Math.max(1, strips.size || pools.length);

  const remaining = total - done;
  let etaAt: number | null = null;
  let etaBasis: OrganisationKpis['etaBasis'] = null;
  if (remaining > 0) {
    const poolRemaining = poolRows.map(p => p.total - p.done).filter(n => n > 0);
    const eta = estimatePhaseEta({
      durationsMs: wallMs.map(x => x.ms),
      remainingMatches: remaining,
      sequentialGroups:
        poolRemaining.length && poolDone < poolTotal
          ? [...poolRemaining, ...new Array(remaining - (poolTotal - poolDone)).fill(1)]
          : undefined,
      activeArenas: parallel,
      now,
    });
    etaAt = eta.finishAt;
    etaBasis = eta.basis;
  }

  // Fin des poules seule (#1817) : bandeau Organisation séparé poules / compétition
  const poolRemainingTotal = poolTotal - poolDone;
  let poolsEtaAt: number | null = null;
  let perMatchMs = 0;
  if (poolTotal > 0) {
    const eta = estimatePhaseEta({
      durationsMs: wallMs.map(x => x.ms),
      remainingMatches: poolRemainingTotal,
      sequentialGroups: poolRows.map(p => p.total - p.done).filter(n => n > 0),
      activeArenas: parallel,
      now,
    });
    perMatchMs = eta.perMatchMs;
    if (poolRemainingTotal > 0) poolsEtaAt = eta.finishAt;
  }
  const poolEnds = finishedTimed
    .filter(t => poolMatchIds.has(t.matchId))
    .map(t => time(t.endTime))
    .filter(Boolean);
  const poolsEndAt =
    poolTotal > 0 && poolRemainingTotal === 0 && poolEnds.length ? Math.max(...poolEnds) : null;

  // Tableau non généré : projection d'un tableau à élimination directe des tireurs de poule
  const hasTableau = tableauMatches.length > 0;
  let tableauProjectionMs: number | null = null;
  if (!hasTableau && poolTotal > 0) {
    const fencerIds = new Set<string>();
    for (const p of pools)
      for (const m of p.matches ?? []) {
        if (m.fencerA?.id) fencerIds.add(m.fencerA.id);
        if (m.fencerB?.id) fencerIds.add(m.fencerB.id);
      }
    tableauProjectionMs = tableauWaves(fencerIds.size, parallel) * perMatchMs;
  }
  const competitionEtaAt = hasTableau
    ? etaAt
    : tableauProjectionMs != null
      ? (poolsEtaAt ?? poolsEndAt ?? now) + tableauProjectionMs
      : etaAt;

  const ends = finishedTimed.map(t => time(t.endTime)).filter(Boolean);
  const starts = timings.map(t => time(t.startTime)).filter(Boolean);
  const firstStart = starts.length ? Math.min(...starts) : 0;
  const hours = firstStart ? (now - firstStart) / 3_600_000 : 0;

  // Attente entre deux matchs d'un même tireur : fin du précédent → début du suivant
  const perFencer = new Map<string, Array<{ s: number; e: number }>>();
  for (const t of finishedTimed) {
    for (const id of [t.fencerAId, t.fencerBId]) {
      if (!id) continue;
      const list = perFencer.get(id) ?? [];
      list.push({ s: time(t.startTime), e: time(t.endTime) });
      perFencer.set(id, list);
    }
  }
  const waits: number[] = [];
  for (const list of perFencer.values()) {
    list.sort((a, b) => a.s - b.s);
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].s - list[i - 1].e;
      if (gap >= 0) waits.push(gap / 1000);
    }
  }

  const activeStrips = [...new Set(live.map(a => a.number))].sort((a, b) => a - b);

  const count = (type: RemoteEvent['type']) => events.filter(e => e.type === type).length;

  return {
    pools: poolRows,
    poolsDone: poolRows.filter(p => p.total > 0 && p.done === p.total).length,
    poolsTotal: poolRows.length,
    done,
    total,
    pending: Math.max(0, total - done - inProgress),
    inProgress,
    etaAt,
    etaBasis,
    poolsEtaAt,
    poolsEndAt,
    competitionEtaAt,
    tableauProjectionMs,
    hasTableau,
    lastEndAt: ends.length ? Math.max(...ends) : null,
    now,
    lastHourThroughput: ends.filter(e => e > now - 3_600_000 && e <= now).length,
    averageThroughput: hours > 0 ? ends.length / Math.max(hours, 1 / 60) : 0,
    averageWaitSeconds: avg(waits),
    averageFightSeconds: avg(fights),
    averageWallSeconds: avg(wallMs.map(x => x.ms / 1000)),
    activeStrips,
    stripCount: arenas.length || strips.size,
    remote: {
      disconnects: count('disconnect'),
      offlineSyncs: count('offline_sync'),
      syncErrors: count('sync_error'),
      dtCalls: count('dt_call'),
    },
    recentIssues: events
      .filter(e => e.type === 'disconnect' || e.type === 'sync_error')
      .slice(-8)
      .reverse(),
  };
}

/**
 * Vagues d'un tableau à élimination directe de n tireurs sur `arenas` pistes :
 * 1er tour = n − 2^(k−1) matchs (exempts déduits), puis 2^(k−2), …, 1 (#1817).
 */
export function tableauWaves(n: number, arenas: number): number {
  if (n < 2) return 0;
  const a = Math.max(1, Math.floor(arenas));
  const size = 2 ** Math.ceil(Math.log2(n));
  let waves = Math.ceil((n - size / 2) / a);
  for (let m = size / 4; m >= 1; m /= 2) waves += Math.ceil(m / a);
  return waves;
}

/** Durée moyenne (s) des matchs terminés : temps de combat si connu, sinon début → fin. */
export function averageMatchSeconds(timings: MatchTiming[]): number {
  const xs = timings
    .filter(t => t.endTime)
    .map(t =>
      t.duration && t.duration > 0 ? t.duration : (time(t.endTime) - time(t.startTime)) / 1000
    )
    .filter(d => d > 0);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// ── Statistiques de l'arme (armes olympiques) ────────────────────────────────

export interface WeaponKpis {
  /** Matchs terminés (poules + tableau) */
  finished: number;
  /** Écart moyen au score des matchs disputés */
  averageMargin: number;
  /** Cartons (blanc, jaune, rouge, noir) par match terminé */
  cardsPerMatch: number;
  abandons: number;
  exclusions: number;
  forfaits: number;
  /** Matchs arrivés au temps limite : aucun tireur n'a atteint le score maximum */
  timeLimit: number;
  /** Part des matchs disputés arrivés au temps limite (0..100) */
  timeLimitPercent: number;
}

const notFenced = (m: Match) =>
  [m.scoreA, m.scoreB].some(s => s?.isAbstention || s?.isExclusion || s?.isForfait);

/** Indicateurs « Statistiques de l'arme » pour fleuret / épée / sabre (#1817). */
export function weaponKpis(input: {
  poolMatches: Match[];
  tableauMatches?: KpiTableauMatch[];
  fencers: Fencer[];
  /** Total des cartons de la compétition */
  totalCards: number;
  /** Score maximum en tableau (repli : 15) */
  tableMaxScore?: number;
}): WeaponKpis {
  const { poolMatches, tableauMatches = [], fencers, totalCards, tableMaxScore = 15 } = input;
  const pool = poolMatches.filter(m => m.status === MatchStatus.FINISHED);
  const tableau = tableauMatches.filter(m => !m.isBye && m.fencerA && m.fencerB && m.winner);
  const finished = pool.length + tableau.length;

  // Matchs disputés jusqu'au bout (hors abandon, forfait, exclusion)
  const fenced: Array<{ a: number; b: number; max: number }> = [
    ...pool
      .filter(m => !notFenced(m))
      .map(m => ({ a: m.scoreA?.value ?? 0, b: m.scoreB?.value ?? 0, max: m.maxScore || 5 })),
    ...tableau
      .filter(m => !m.specialStatus)
      .map(m => ({ a: m.scoreA ?? 0, b: m.scoreB ?? 0, max: tableMaxScore })),
  ];
  const margins = fenced.map(m => Math.abs(m.a - m.b));
  const timeLimit = fenced.filter(m => Math.max(m.a, m.b) < m.max).length;
  const countStatus = (s: FencerStatus) => fencers.filter(f => f.status === s).length;

  return {
    finished,
    averageMargin: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0,
    cardsPerMatch: finished ? totalCards / finished : 0,
    abandons: countStatus(FencerStatus.ABANDONED),
    exclusions: countStatus(FencerStatus.EXCLUDED),
    forfaits: countStatus(FencerStatus.FORFAIT),
    timeLimit,
    timeLimitPercent: fenced.length ? (timeLimit / fenced.length) * 100 : 0,
  };
}
