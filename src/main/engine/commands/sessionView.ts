/**
 * BellePoule Modern - Couche domaine : lecture des poules, classements et tableau (#1880)
 * Source : état de session (session_state, écrit par l'écran et par le domaine),
 * repli sur les tables de poules si l'état de session n'a pas de poules.
 * Licensed under GPL-3.0
 */
import type { Fencer, Pool, PoolRanking } from '../../../shared/types';
import { calculatePoolRanking } from '../../../shared/utils/poolCalculations';
import type { CommandContext } from './context';
import { getCompetitionOrThrow, phaseName } from './competitions';

/** Tireur réduit à l'identité utile à un agent */
export interface FencerRef {
  id: string;
  lastName: string;
  firstName: string;
  club: string | null;
}

export const fencerRef = (f: Partial<Fencer> | null | undefined): FencerRef | null =>
  f && f.id
    ? {
        id: f.id,
        lastName: f.lastName ?? '',
        firstName: f.firstName ?? '',
        club: f.club ?? null,
      }
    : null;

export interface RankingRow {
  rank: number;
  fencer: FencerRef | null;
  victories: number;
  matchesPlayed: number;
  touchesScored: number;
  touchesReceived: number;
  index: number;
}

const rankingRow = (r: Partial<PoolRanking>): RankingRow => ({
  rank: r.rank ?? 0,
  fencer: fencerRef(r.fencer),
  victories: r.victories ?? 0,
  matchesPlayed: r.matchesPlayed ?? 0,
  touchesScored: r.touchesScored ?? 0,
  touchesReceived: r.touchesReceived ?? 0,
  index: r.index ?? 0,
});

/** État de session brut d'une épreuve (objet vide si jamais ouverte) */
export function readSession(ctx: CommandContext, competitionId: string): Record<string, unknown> {
  const s = ctx.db.getSessionState(competitionId);
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
}

/** Poules de l'épreuve : état de session, sinon tables (phase de poules) */
export function readPools(ctx: CommandContext, competitionId: string): Pool[] {
  const session = readSession(ctx, competitionId);
  if (Array.isArray(session.pools) && session.pools.length > 0) return session.pools as Pool[];
  const phase = ctx.db.getPhasesByCompetition(competitionId).find(p => p.type === 'pool');
  return phase ? (ctx.db.getPoolsByPhase(phase.id) as Pool[]) : [];
}

export interface PoolSummary {
  number: number;
  strip: number | null;
  fencerCount: number;
  matchesTotal: number;
  matchesFinished: number;
  complete: boolean;
  referees: string[];
  ranking: RankingRow[];
}

const isFinished = (m: { status?: unknown }) => m.status === 'finished';

export function summarizePool(pool: Pool): PoolSummary {
  const matches = pool.matches ?? [];
  const finished = matches.filter(isFinished).length;
  let ranking = pool.ranking ?? [];
  if (ranking.length === 0 && finished > 0) {
    try {
      ranking = calculatePoolRanking(pool);
    } catch {
      ranking = [];
    }
  }
  return {
    number: pool.number,
    strip: pool.strip ?? null,
    fencerCount: pool.fencers?.length ?? 0,
    matchesTotal: matches.length,
    matchesFinished: finished,
    complete: matches.length > 0 && finished === matches.length,
    referees: (pool.referees ?? []).map(r => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()),
    ranking: ranking.map(rankingRow),
  };
}

/** Classement d'une poule, ou classement général après poules */
export function getPoolRanking(
  ctx: CommandContext,
  competitionId: string,
  poolNumber?: number
): { phase: string | null; pools: PoolSummary[]; overallRanking: RankingRow[] } {
  getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  const pools = readPools(ctx, competitionId)
    .filter(p => poolNumber === undefined || p.number === poolNumber)
    .map(summarizePool);
  const overall = Array.isArray(session.overallRanking)
    ? (session.overallRanking as PoolRanking[]).map(rankingRow)
    : [];
  return { phase: phaseName(session.currentPhase), pools, overallRanking: overall };
}

export interface BracketMatchView {
  id: string;
  /** Tableau de N (64, 32, …, 2 = finale) */
  round: number;
  position: number;
  fencerA: FencerRef | null;
  fencerB: FencerRef | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: FencerRef | null;
  isBye: boolean;
  /** pending : tireurs incomplets ; ready : à tirer ; done : vainqueur connu */
  state: 'pending' | 'ready' | 'done';
  strip: number | null;
}

interface RawTableauMatch {
  id: string;
  round: number;
  position: number;
  fencerA?: Partial<Fencer> | null;
  fencerB?: Partial<Fencer> | null;
  scoreA?: number | null;
  scoreB?: number | null;
  winner?: Partial<Fencer> | null;
  isBye?: boolean;
  arena?: number | null;
}

export function bracketMatchView(m: RawTableauMatch): BracketMatchView {
  const state: BracketMatchView['state'] = m.winner
    ? 'done'
    : m.fencerA && m.fencerB
      ? 'ready'
      : 'pending';
  return {
    id: m.id,
    round: m.round,
    position: m.position,
    fencerA: fencerRef(m.fencerA),
    fencerB: fencerRef(m.fencerB),
    scoreA: m.scoreA ?? null,
    scoreB: m.scoreB ?? null,
    winner: fencerRef(m.winner),
    isBye: !!m.isBye,
    state,
    strip: m.arena ?? null,
  };
}

/** Tableau d'élimination directe (état de session) */
export function getBracket(
  ctx: CommandContext,
  competitionId: string,
  round?: number
): { phase: string | null; size: number; matches: BracketMatchView[]; finalResults: RankingRow[] } {
  getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  const raw = Array.isArray(session.tableauMatches)
    ? (session.tableauMatches as RawTableauMatch[])
    : [];
  const size = raw.reduce((max, m) => Math.max(max, Number(m.round) || 0), 0);
  const final = Array.isArray(session.finalResults)
    ? (session.finalResults as Array<{ rank: number; fencer: Partial<Fencer> }>).map(r => ({
        ...rankingRow({}),
        rank: r.rank,
        fencer: fencerRef(r.fencer),
      }))
    : [];
  return {
    phase: phaseName(session.currentPhase),
    size,
    matches: raw
      .filter(m => round === undefined || m.round === round)
      .map(bracketMatchView)
      .sort((a, b) => b.round - a.round || a.position - b.position),
    finalResults: final,
  };
}
