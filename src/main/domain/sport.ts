/**
 * BellePoule Modern - Couche domaine : orchestration sportive (#1880, lot 3)
 * Poules, arbitres de poule, scores, tableau, export des résultats, dans le main.
 * Mêmes fonctions pures que l'écran (poolOrchestration, tableauCalculations) ; l'état de
 * session est réécrit puis l'écran ouvert le relit (competition:event « session:changed »).
 *
 * Formats pris en charge : épreuve individuelle, un tour de poules, tableau simple
 * (avec ou sans petite finale). Équipes, rapières, tours multiples et « toutes les
 * places » restent pilotés à l'écran (erreur explicite).
 * Licensed under GPL-3.0
 */
import { v4 as uuidv4 } from 'uuid';
import {
  FencerStatus,
  MatchStatus,
  Weapon,
  type Competition,
  type Fencer,
  type Pool,
  type PoolRanking,
  type Referee,
} from '../../shared/types';
import {
  applyFencerForfeit,
  applyScoreToPool,
  buildMatchScores,
  buildPools,
  computeOverallRankingAllRoundsFor,
  computeOverallRankingFor,
  validatePoolScore,
  type PoolSpecialStatus,
} from '../../shared/utils/poolOrchestration';
import { propagatePoolReferee } from '../../shared/utils/refereeStats';
import { allowsVictoryTieBreak } from '../../shared/utils/tieBreak';
import {
  getActiveFormula,
  resolveCompetitionSettings,
} from '../../shared/utils/customFormulaSettings';
import { getDefaultMaxScores } from '../../shared/utils/defaultMaxScores';
import { specialStatusPatch } from '../../shared/utils/forfeit';
import {
  buildTableauMatches,
  calculateFinalResults,
  getTableauSize,
  isTableauDone,
} from '../../renderer/components/tableau/tableauCalculations';
import {
  deriveFirstRound,
  propagateWinners,
  resetTableauMatch,
  resolveTableauWinner,
  type TableauMatch,
} from '../../renderer/components/tableau/tableauTypes';
import { computeEffectiveTableauRanking } from '../../renderer/components/competition/competitionDerived';
import { DomainError, type DomainContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { resolveSetting } from './settings';
import { bracketMatchView, fencerRef, readSession, summarizePool } from './sessionView';

/** Numéros de phase de l'état de session (useCompetitionSession.PHASE_NUMBERS) */
export const PHASE = {
  checkin: 0,
  poolprep: 1,
  pools: 2,
  ranking: 3,
  tableau: 5,
  results: 6,
} as const;
const PHASE_LABEL: Record<number, string> = {
  0: 'checkin',
  1: 'poolprep',
  2: 'pools',
  3: 'ranking',
  5: 'tableau',
  6: 'results',
};

const isLaser = (c: Competition) => c.weapon === Weapon.LASER;

/**
 * Réglages effectifs, comme l'écran (useCompetitionCore) : formule personnalisée prioritaire,
 * scores max par défaut selon arme et catégorie (Sabre Laser : 21 / illimité). 0 = illimité.
 */
export function effectiveSettings(comp: Competition) {
  const eff = resolveCompetitionSettings(comp.weapon, comp.settings);
  const defaults = getDefaultMaxScores(comp.weapon, comp.category);
  return {
    poolMaxScore: eff?.defaultPoolMaxScore ?? defaults.pool,
    tableMaxScore: eff?.defaultTableMaxScore ?? defaults.table,
    poolRounds: eff?.poolRounds ?? 1,
    hasDirectElimination: eff?.hasDirectElimination ?? true,
    thirdPlaceMatch: eff?.thirdPlaceMatch ?? false,
    poolWinnersOnly: eff?.poolWinnersOnly ?? false,
    playAllPositions: comp.settings?.playAllPositions ?? false,
  };
}

/** Formats non pilotables hors écran : erreur explicite */
function assertSupported(comp: Competition, session: Record<string, unknown>): void {
  if (comp.isTeamEvent) {
    throw new DomainError('unsupported_format', 'Épreuve par équipes : à piloter à l’écran');
  }
  if (comp.settings?.specialMode) {
    throw new DomainError('unsupported_format', 'Mode spécial (rapières) : à piloter à l’écran');
  }
  if (
    effectiveSettings(comp).poolRounds > 1 ||
    Number(session.currentPoolRound ?? 1) > 1 ||
    (Array.isArray(session.poolHistory) && session.poolHistory.length > 0)
  ) {
    throw new DomainError('unsupported_format', 'Plusieurs tours de poules : à piloter à l’écran');
  }
}

/** Écrit l'état de session (fusion) et prévient l'écran, qui le relit */
function writeSession(
  ctx: DomainContext,
  competitionId: string,
  patch: Record<string, unknown>
): void {
  const current = readSession(ctx, competitionId);
  const next: Record<string, unknown> = { ...current, ...patch };
  const phase = typeof next.currentPhase === 'number' ? next.currentPhase : PHASE.checkin;
  next.currentPhase = phase;
  // Révision : une sauvegarde de l'écran faite sur un état antérieur est refusée (#1880)
  next.revision = (typeof current.revision === 'number' ? current.revision : 0) + 1;
  next.uiState = {
    ...((current.uiState as Record<string, unknown>) ?? {}),
    currentPhase: PHASE_LABEL[phase] ?? 'checkin',
    currentPoolRound: Number(next.currentPoolRound ?? 1),
    pools: Array.isArray(next.pools) ? next.pools.length : 0,
  };
  ctx.db.saveSessionState(competitionId, next);
}

const emitSession = (ctx: DomainContext, competitionId: string) =>
  ctx.emitChange?.({ scope: 'session', competitionIds: [competitionId] });

const sessionPools = (session: Record<string, unknown>): Pool[] =>
  Array.isArray(session.pools) ? (session.pools as Pool[]) : [];
const sessionTableau = (session: Record<string, unknown>): TableauMatch[] =>
  Array.isArray(session.tableauMatches) ? (session.tableauMatches as TableauMatch[]) : [];

// ─── Poules ──────────────────────────────────────────────────────────────────

export interface GeneratePoolsOptions {
  poolCount?: number;
  minPerPool?: number;
  maxPerPool?: number;
  /** Remplacer des poules dont des matchs sont déjà joués (destructif) */
  replace?: boolean;
  dryRun?: boolean;
}

/**
 * Tirage des poules sur les tireurs pointés, comme « Générer les poules » de l'écran,
 * puis poules lancées (phase Poules). Pistes : poule n sur la piste n (salle / journée).
 */
export function generatePools(
  ctx: DomainContext,
  competitionId: string,
  options: GeneratePoolsOptions = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  const existing = sessionPools(session);
  const played = existing.some(p => p.matches?.some(m => m.status === MatchStatus.FINISHED));
  if (played && !options.replace) {
    throw new DomainError(
      'pools_have_scores',
      'Des matchs de poule sont déjà joués : relancer avec replace=true pour les effacer'
    );
  }
  if (sessionTableau(session).length > 0 && !options.replace) {
    throw new DomainError('bracket_exists', 'Le tableau est déjà construit : replace=true requis');
  }
  const fencers = ctx.db
    .getFencersByCompetition(competitionId)
    .filter(f => f.status === FencerStatus.CHECKED_IN);
  const min = options.minPerPool ?? 5;
  const max = options.maxPerPool ?? 7;
  if (min > max) throw new DomainError('invalid_pool_size', 'minPerPool > maxPerPool');
  if (options.poolCount !== undefined && options.poolCount > Math.floor(fencers.length / 3)) {
    throw new DomainError('invalid_pool_count', 'Trop de poules pour le nombre de tireurs pointés');
  }
  let pools: Pool[];
  try {
    pools = buildPools(fencers, {
      poolMaxScore: effectiveSettings(comp).poolMaxScore,
      poolCount: options.poolCount,
      minPerPool: min,
      maxPerPool: max,
      boutOrder: comp.settings?.poolBoutOrder,
      newId: uuidv4,
    });
  } catch (e) {
    throw new DomainError('not_enough_fencers', (e as Error).message);
  }
  const strips = resolveSetting(ctx, 'stripCount', { competitionId });
  if (strips > 0) pools.forEach((p, i) => (p.strip = (i % strips) + 1));
  const overallRanking = computeOverallRankingFor(pools, isLaser(comp));
  const summary = {
    dryRun: !!options.dryRun,
    fencerCount: fencers.length,
    poolCount: pools.length,
    pools: pools.map(p => ({
      number: p.number,
      strip: p.strip ?? null,
      fencers: p.fencers.map(f => ({ ...fencerRef(f)!, ranking: f.ranking ?? null })),
      matchCount: p.matches.length,
    })),
  };
  if (options.dryRun) return summary;

  ctx.db.transaction(() => {
    const phases = ctx.db.getPhasesByCompetition(competitionId);
    const phase =
      phases.find(p => p.type === 'pool') ?? ctx.db.createPhase(competitionId, 'pool', 1, 'Poules');
    ctx.db.clearPoolsForPhase(phase.id);
    for (const pool of pools) {
      ctx.db.createPool(phase.id, pool.number, pool.id);
      pool.fencers.forEach((f, pos) => ctx.db.addFencerToPool(pool.id, f.id, pos));
      for (const m of pool.matches) {
        ctx.db.createMatch(
          {
            id: m.id,
            number: m.number,
            fencerA: m.fencerA,
            fencerB: m.fencerB,
            maxScore: m.maxScore,
          },
          pool.id
        );
      }
      if (pool.strip) ctx.db.updatePool(pool);
    }
    writeSession(ctx, competitionId, {
      currentPhase: PHASE.pools,
      currentPoolRound: 1,
      pools,
      poolHistory: [],
      overallRanking,
      tableauMatches: [],
      finalResults: [],
      consolationBrackets: [],
      skipPoolPhase: false,
      poolsLaunched: true,
      poolPrepParams: { poolCount: pools.length, minFencersPerPool: min, maxFencersPerPool: max },
    });
  });
  emitSession(ctx, competitionId);
  return summary;
}

/** Arbitre de poule : premier arbitre neutre (aucun club de la poule), le moins chargé */
export function chooseNeutralReferee(
  pool: Pick<Pool, 'fencers'>,
  candidates: Referee[],
  load: Map<string, number>
): Referee | null {
  if (candidates.length === 0) return null;
  const clubs = new Set(pool.fencers.map(f => f.club).filter((c): c is string => !!c));
  const neutral = candidates.filter(r => !r.club || !clubs.has(r.club));
  const list = neutral.length > 0 ? neutral : candidates;
  let best = list[0];
  for (const r of list) if ((load.get(r.id) ?? 0) < (load.get(best.id) ?? 0)) best = r;
  return best;
}

/**
 * Arbitres des poules : un arbitre principal par poule sans arbitre (ou toutes avec
 * replace), choisi parmi les arbitres pointés, hors club des tireurs de la poule.
 */
export function assignPoolReferees(
  ctx: DomainContext,
  competitionId: string,
  options: { replace?: boolean; includeUnchecked?: boolean; dryRun?: boolean } = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  const pools = sessionPools(session);
  if (pools.length === 0)
    throw new DomainError('no_pools', 'Aucune poule : generate_pools d’abord');
  const referees = ctx.db.getRefereesByCompetition(competitionId);
  const candidates = options.includeUnchecked
    ? referees
    : referees.filter(r => r.status !== 'unavailable');
  if (candidates.length === 0) {
    throw new DomainError(
      'no_referees',
      options.includeUnchecked ? 'Aucun arbitre dans l’épreuve' : 'Aucun arbitre pointé'
    );
  }
  const load = new Map<string, number>();
  for (const p of pools) {
    const id = p.referees?.[0]?.id;
    if (id && !options.replace) load.set(id, (load.get(id) ?? 0) + 1);
  }
  const assignments: Array<{
    poolNumber: number;
    referee: string;
    refereeId: string;
    /** Club partagé avec un tireur de la poule (aucun arbitre neutre disponible) */
    clubConflict?: string;
  }> = [];
  const warnings: string[] = [];
  const matchChanges: Array<{ matchId: string; refereeId: string | null }> = [];
  const nextPools = pools.map(pool => {
    if (pool.referees?.length && !options.replace) return pool;
    const ref = chooseNeutralReferee(pool, candidates, load);
    if (!ref) return pool;
    load.set(ref.id, (load.get(ref.id) ?? 0) + 1);
    const name = `${ref.firstName} ${ref.lastName}`.trim();
    const clubConflict =
      ref.club && pool.fencers.some(f => f.club === ref.club) ? ref.club : undefined;
    assignments.push({
      poolNumber: pool.number,
      referee: name,
      refereeId: ref.id,
      ...(clubConflict ? { clubConflict } : {}),
    });
    if (clubConflict) {
      warnings.push(
        `Poule ${pool.number} : ${name} est du club ${clubConflict}, comme un tireur de la poule (aucun arbitre neutre disponible)`
      );
    }
    const { matches, changes } = propagatePoolReferee(pool.matches, pool.referees?.[0]?.id, ref);
    matchChanges.push(...changes);
    return { ...pool, referees: [ref], matches };
  });
  const result = { dryRun: !!options.dryRun, assignments, warnings };
  if (options.dryRun || assignments.length === 0) return result;
  ctx.db.transaction(() => {
    for (const pool of nextPools) {
      const a = assignments.find(x => x.poolNumber === pool.number);
      if (a) ctx.db.updatePoolReferees(pool.id, [a.refereeId]);
    }
    for (const c of matchChanges) ctx.db.updateMatch(c.matchId, { refereeId: c.refereeId });
    writeSession(ctx, competitionId, { pools: nextPools });
  });
  emitSession(ctx, competitionId);
  return result;
}

// ─── Matchs ──────────────────────────────────────────────────────────────────

export interface MatchListItem {
  matchId: string;
  kind: 'pool' | 'bracket';
  poolNumber: number | null;
  round: number | null;
  fencerA: ReturnType<typeof fencerRef>;
  fencerB: ReturnType<typeof fencerRef>;
  scoreA: number | null;
  scoreB: number | null;
  state: 'pending' | 'ready' | 'done';
  strip: number | null;
}

const scoreNum = (s: unknown): number | null =>
  s == null ? null : typeof s === 'number' ? s : ((s as { value?: number | null }).value ?? null);

/** Matchs de poule et de tableau, avec leur identifiant pour record_score */
export function listMatches(
  ctx: DomainContext,
  competitionId: string,
  filter: { poolNumber?: number; state?: 'pending' | 'ready' | 'done' } = {}
): MatchListItem[] {
  getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  const out: MatchListItem[] = [];
  for (const pool of sessionPools(session)) {
    if (filter.poolNumber !== undefined && pool.number !== filter.poolNumber) continue;
    for (const m of pool.matches ?? []) {
      out.push({
        matchId: m.id,
        kind: 'pool',
        poolNumber: pool.number,
        round: null,
        fencerA: fencerRef(m.fencerA),
        fencerB: fencerRef(m.fencerB),
        scoreA: scoreNum(m.scoreA),
        scoreB: scoreNum(m.scoreB),
        state: m.status === MatchStatus.FINISHED ? 'done' : 'ready',
        strip: pool.strip ?? null,
      });
    }
  }
  if (filter.poolNumber === undefined) {
    for (const m of sessionTableau(session)) {
      if (m.isBye) continue;
      const v = bracketMatchView(m);
      out.push({
        matchId: m.id,
        kind: 'bracket',
        poolNumber: null,
        round: m.round,
        fencerA: v.fencerA,
        fencerB: v.fencerB,
        scoreA: v.scoreA,
        scoreB: v.scoreB,
        state: v.state,
        strip: v.strip,
      });
    }
  }
  return out.filter(m => !filter.state || m.state === filter.state);
}

export interface RecordScoreInput {
  matchId: string;
  scoreA: number;
  scoreB: number;
  /** Vainqueur imposé (égalité tranchée par V, abandon, forfait, exclusion) */
  winner?: 'A' | 'B';
  /** Statut du perdant */
  specialStatus?: PoolSpecialStatus;
  /** Égalité : tireur prioritaire (minute supplémentaire) */
  priority?: 'A' | 'B';
  /** Simulation : contrôles et résultat (classement, vainqueur) sans rien écrire */
  dryRun?: boolean;
}

/** Saisie d'un score, mêmes validations que l'écran ; poules et tableau */
export function recordScore(ctx: DomainContext, competitionId: string, input: RecordScoreInput) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  const pools = sessionPools(session);
  const poolIndex = pools.findIndex(p => p.matches?.some(m => m.id === input.matchId));
  if (poolIndex >= 0) return recordPoolScore(ctx, comp, session, pools, poolIndex, input);
  if (sessionTableau(session).some(m => m.id === input.matchId)) {
    return recordBracketScore(ctx, comp, session, input);
  }
  throw new DomainError('match_not_found', `Match introuvable : ${input.matchId} (list_matches)`);
}

function recordPoolScore(
  ctx: DomainContext,
  comp: Competition,
  session: Record<string, unknown>,
  pools: Pool[],
  poolIndex: number,
  input: RecordScoreInput
) {
  if (sessionTableau(session).length > 0) {
    throw new DomainError('bracket_exists', 'Tableau déjà construit : score de poule figé');
  }
  const pool = pools[poolIndex];
  const matchIndex = pool.matches.findIndex(m => m.id === input.matchId);
  const match = pool.matches[matchIndex];
  const error = validatePoolScore({
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    maxScore: effectiveSettings(comp).poolMaxScore,
    winner: input.winner,
    priority: input.priority,
    specialStatus: input.specialStatus,
    isLaserSabre: isLaser(comp),
    tieByVictory: allowsVictoryTieBreak(comp.weapon),
  });
  if (error) throw new DomainError(error, `Score refusé : ${error}`);
  const scores = buildMatchScores(
    input.scoreA,
    input.scoreB,
    input.winner,
    input.specialStatus,
    input.priority
  );
  const scoredPool = applyScoreToPool(pool, matchIndex, scores, isLaser(comp));
  let nextPools = pools.map((p, i) => (i === poolIndex ? scoredPool : p));
  // Abandon, forfait, exclusion : comme l'écran, statut du perdant propagé et ses autres
  // matchs perdus (handleFencerForfeit), liste d'appel alignée (specialStatusPatch)
  const loser = input.specialStatus
    ? scores.scoreA.isVictory
      ? match.fencerB
      : match.fencerA
    : null;
  if (loser && input.specialStatus) {
    nextPools = applyFencerForfeit(nextPools, loser.id, input.specialStatus, isLaser(comp)).pools;
  }
  const updatedPool = nextPools[poolIndex];
  const overallRanking = computeOverallRankingAllRoundsFor(nextPools, [], isLaser(comp));
  if (!input.dryRun)
    ctx.db.transaction(() => {
      ctx.db.updateMatch(match.id, {
        scoreA: scores.scoreA,
        scoreB: scores.scoreB,
        status: MatchStatus.FINISHED,
      });
      if (loser && input.specialStatus) {
        const previous = pools.flatMap(p => p.matches);
        ctx.db.saveAbandonSnapshot(
          loser.id,
          comp.id,
          pools.flatMap(p => p.fencers).find(f => f.id === loser.id)?.status ??
            FencerStatus.CHECKED_IN,
          input.specialStatus,
          previous
            .filter(m => m.fencerA?.id === loser.id || m.fencerB?.id === loser.id)
            .map(m => ({
              matchId: m.id,
              status: m.status as string,
              scoreA: m.scoreA ? { ...m.scoreA } : null,
              scoreB: m.scoreB ? { ...m.scoreB } : null,
            }))
        );
        ctx.db.updateFencer(loser.id, specialStatusPatch(input.specialStatus));
        // Matchs du perdant modifiés (dont ce match, remis à 0 pour un forfait) : miroir en base
        const before = new Map(previous.map(m => [m.id, m]));
        const same = (a: unknown, b: unknown) =>
          JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        for (const m of nextPools.flatMap(p => p.matches)) {
          const old = before.get(m.id);
          if (!old) continue;
          const changed =
            m.id === match.id ||
            old.status !== m.status ||
            !same(old.scoreA, m.scoreA) ||
            !same(old.scoreB, m.scoreB);
          if (changed) {
            ctx.db.updateMatch(m.id, { scoreA: m.scoreA, scoreB: m.scoreB, status: m.status });
          }
        }
      }
      ctx.db.logScoreChange({
        matchId: match.id,
        previousScoreA: match.scoreA ?? undefined,
        previousScoreB: match.scoreB ?? undefined,
        newScoreA: scores.scoreA,
        newScoreB: scores.scoreB,
        changedBy: 'mcp',
        reason: 'mcp_entry',
        poolId: pool.id,
      });
      for (const p of nextPools) {
        const old = pools.find(x => x.id === p.id);
        const complete = p.matches.every(m => m.status === MatchStatus.FINISHED);
        if (old && complete !== old.isComplete) ctx.db.updatePool({ ...p, isComplete: complete });
      }
      writeSession(ctx, comp.id, { pools: nextPools, overallRanking });
    });
  if (!input.dryRun) {
    emitSession(ctx, comp.id);
    if (loser) ctx.emitChange?.({ scope: 'fencers', competitionIds: [comp.id] });
  }
  return {
    dryRun: !!input.dryRun,
    kind: 'pool' as const,
    poolNumber: pool.number,
    pool: summarizePool(updatedPool),
    allPoolsComplete: nextPools.every(p => p.matches.every(m => m.status === MatchStatus.FINISHED)),
  };
}

/** Classement d'entrée du tableau, comme l'écran (vainqueurs de poule, formule) */
function tableauRanking(comp: Competition, session: Record<string, unknown>): PoolRanking[] {
  const overall = Array.isArray(session.overallRanking)
    ? (session.overallRanking as PoolRanking[])
    : [];
  return computeEffectiveTableauRanking(overall, sessionPools(session), {
    isRapieres: false,
    rapieresTableauMode: undefined,
    poolWinnersOnly: effectiveSettings(comp).poolWinnersOnly,
    customFormula: getActiveFormula(comp.weapon, comp.settings),
    postPoolSplitCriteria: undefined,
    activeSplitGroup: null,
    splitOffCompetitionIds: undefined,
  });
}

const ELIMINATED_STATUSES = new Set<string>([
  FencerStatus.ABANDONED,
  FencerStatus.FORFAIT,
  FencerStatus.EXCLUDED,
  FencerStatus.ELIMINATED,
]);

function persistTableau(ctx: DomainContext, comp: Competition, matches: TableauMatch[]): void {
  const audit = { changedBy: 'mcp', reason: 'mcp_entry' };
  const maxScore = effectiveSettings(comp).tableMaxScore;
  ctx.db.upsertMultipleTableauMatches(
    comp.id,
    matches.map(m => ({
      matchId: m.id,
      round: m.round,
      position: m.position,
      fencerAId: m.fencerA?.id ?? null,
      fencerBId: m.fencerB?.id ?? null,
      scoreA:
        m.scoreA != null ? { value: m.scoreA, isVictory: m.winner?.id === m.fencerA?.id } : null,
      scoreB:
        m.scoreB != null ? { value: m.scoreB, isVictory: m.winner?.id === m.fencerB?.id } : null,
      status: m.winner || m.isBye ? 'finished' : 'not_started',
      maxScore,
      isBye: m.isBye,
    })),
    audit
  );
}

/**
 * Tableau d'élimination directe depuis le classement après poules (tireurs éliminés,
 * abandons, forfaits et exclus écartés), avec ou sans petite finale.
 */
export function buildBracket(
  ctx: DomainContext,
  competitionId: string,
  options: { thirdPlaceMatch?: boolean; replace?: boolean; dryRun?: boolean } = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  if (comp.settings?.playAllPositions) {
    throw new DomainError(
      'unsupported_format',
      '« Tirer toutes les places » : à piloter à l’écran'
    );
  }
  const eff = effectiveSettings(comp);
  if (!eff.hasDirectElimination) {
    throw new DomainError('no_direct_elimination', 'Épreuve sans élimination directe');
  }
  const pools = sessionPools(session);
  if (
    !session.skipPoolPhase &&
    (pools.length === 0 ||
      !pools.every(p => p.matches.every(m => m.status === MatchStatus.FINISHED)))
  ) {
    throw new DomainError('pools_not_complete', 'Toutes les poules doivent être terminées');
  }
  const existing = sessionTableau(session);
  if (existing.some(m => m.winner && !m.isBye) && !options.replace) {
    throw new DomainError(
      'bracket_has_scores',
      'Des matchs du tableau sont joués : replace=true requis'
    );
  }
  // Statuts à jour (abandon, exclusion après les poules)
  // Statuts du classement (comme l'écran) : un décompte différent ferait régénérer le tableau
  const qualified = tableauRanking(comp, session)
    .filter(r => !ELIMINATED_STATUSES.has(r.fencer.status))
    .sort((a, b) => a.rank - b.rank);
  if (qualified.length < 2) {
    throw new DomainError('not_enough_fencers', 'Moins de 2 tireurs qualifiés pour le tableau');
  }
  const thirdPlace = options.thirdPlaceMatch ?? eff.thirdPlaceMatch;
  const size = getTableauSize(qualified.length);
  const matches = buildTableauMatches(qualified, size, false, thirdPlace);
  const summary = {
    dryRun: !!options.dryRun,
    size,
    qualified: qualified.length,
    thirdPlaceMatch: thirdPlace,
    firstRound: matches
      .filter(m => m.round === size)
      .map(bracketMatchView)
      .sort((a, b) => a.position - b.position),
  };
  if (options.dryRun) return summary;
  ctx.db.transaction(() => {
    if (thirdPlace !== eff.thirdPlaceMatch) {
      ctx.db.updateCompetition(comp.id, {
        settings: { ...comp.settings, thirdPlaceMatch: thirdPlace } as Competition['settings'],
      });
    }
    persistTableau(ctx, comp, matches);
    writeSession(ctx, competitionId, {
      currentPhase: PHASE.tableau,
      tableauMatches: matches,
      finalResults: [],
      consolationBrackets: [],
    });
  });
  emitSession(ctx, competitionId);
  if (thirdPlace !== eff.thirdPlaceMatch) {
    ctx.emitChange?.({ scope: 'competitions', competitionIds: [comp.id] });
  }
  return summary;
}

function recordBracketScore(
  ctx: DomainContext,
  comp: Competition,
  session: Record<string, unknown>,
  input: RecordScoreInput
) {
  if (comp.settings?.playAllPositions) {
    throw new DomainError(
      'unsupported_format',
      '« Tirer toutes les places » : à piloter à l’écran'
    );
  }
  let matches = sessionTableau(session).map(m => ({ ...m }));
  const target = matches.find(m => m.id === input.matchId)!;
  if (target.isBye || !target.fencerA || !target.fencerB) {
    throw new DomainError('match_not_ready', 'Match incomplet (tireur attendu) ou exempt');
  }
  if (target.winner) {
    // Correction : possible tant que le vainqueur n'a pas tiré le tour suivant
    const reset = resetTableauMatch(matches, target.id);
    if (!reset) throw new DomainError('next_match_played', 'Le tour suivant est déjà joué');
    matches = reset;
  }
  const { scoreA, scoreB } = input;
  if (![scoreA, scoreB].every(s => Number.isInteger(s) && s >= 0)) {
    throw new DomainError('score_invalid', 'Score refusé : score_invalid');
  }
  const max = effectiveSettings(comp).tableMaxScore;
  if (!input.specialStatus && max > 0 && (scoreA > max || scoreB > max)) {
    throw new DomainError('score_above_max', `Score refusé : ${max} touches maximum`);
  }
  if (scoreA === scoreB && !input.winner) {
    throw new DomainError(
      'draw_needs_winner',
      'Égalité : préciser le vainqueur (winner), pas de match nul au tableau'
    );
  }
  if (input.specialStatus && !input.winner) {
    throw new DomainError('winner_required', 'Abandon, forfait ou exclusion : préciser winner');
  }
  const m = matches.find(x => x.id === input.matchId)!;
  const tieWinner = input.winner ?? null;
  const winner = input.specialStatus
    ? input.winner === 'A'
      ? m.fencerA
      : m.fencerB
    : resolveTableauWinner(m.fencerA, m.fencerB, scoreA, scoreB, tieWinner);
  if (!winner) throw new DomainError('winner_unresolved', 'Vainqueur indéterminé');
  if (!input.specialStatus && input.winner && scoreA !== scoreB) {
    const expected = scoreA > scoreB ? 'A' : 'B';
    if (expected !== input.winner) {
      throw new DomainError('winner_contradicts_score', 'Vainqueur contraire au score');
    }
  }
  const loser = winner.id === m.fencerA!.id ? m.fencerB! : m.fencerA!;
  Object.assign(m, {
    scoreA,
    scoreB,
    winner,
    specialStatus: input.specialStatus ? { fencerId: loser.id, status: input.specialStatus } : null,
  });
  const size = deriveFirstRound(matches);
  propagateWinners(matches, size);
  const done = isTableauDone(matches);
  const finalResults = done
    ? calculateFinalResults(matches, tableauRanking(comp, session), size)
    : [];
  if (!input.dryRun)
    ctx.db.transaction(() => {
      // Journal des scores : écrit par l'upsert (auteur « mcp »)
      persistTableau(ctx, comp, matches);
      if (input.specialStatus)
        ctx.db.updateFencer(loser.id, specialStatusPatch(input.specialStatus));
      // Tableau terminé : phase Résultats, comme onComplete à l'écran
      writeSession(ctx, comp.id, {
        tableauMatches: matches,
        finalResults,
        ...(done ? { currentPhase: PHASE.results } : {}),
      });
    });
  if (!input.dryRun) {
    emitSession(ctx, comp.id);
    if (input.specialStatus) ctx.emitChange?.({ scope: 'fencers', competitionIds: [comp.id] });
  }
  return {
    dryRun: !!input.dryRun,
    kind: 'bracket' as const,
    match: bracketMatchView(m),
    bracketComplete: done,
    podium: finalResults.slice(0, 4).map(r => ({ rank: r.rank, fencer: fencerRef(r.fencer) })),
  };
}

// ─── Résultats ──────────────────────────────────────────────────────────────

/** Données de résultats d'une épreuve (export) */
export function resultsData(ctx: DomainContext, competitionId: string) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  const fencers: Fencer[] = ctx.db.getFencersByCompetition(competitionId);
  return {
    competition: { ...comp, fencers, referees: ctx.db.getRefereesByCompetition(competitionId) },
    pools: sessionPools(session),
    overallRanking: Array.isArray(session.overallRanking)
      ? (session.overallRanking as PoolRanking[])
      : [],
    tableauMatches: sessionTableau(session),
    finalResults: Array.isArray(session.finalResults)
      ? (session.finalResults as Array<{ rank: number; fencer: Fencer; eliminatedAt: string }>)
      : [],
    fencers,
    referees: ctx.db.getRefereesByCompetition(competitionId),
  };
}
