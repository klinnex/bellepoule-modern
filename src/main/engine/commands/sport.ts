/**
 * BellePoule Modern - Couche domaine : orchestration sportive (#1880, lot 3)
 * Poules, arbitres de poule, scores, tableau, export des résultats, dans le main.
 * Mêmes fonctions pures que l'écran (poolOrchestration, tableauCalculations) ; l'état de
 * session est réécrit puis l'écran ouvert le relit (competition:event « session:changed »).
 *
 * Formats pris en charge : épreuve individuelle, un tour de poules, tableau simple
 * (avec ou sans petite finale). Équipes, rapières, tours multiples et « toutes les
 * places » restent pilotés à l'écran (erreur explicite), sauf pour la saisie des scores
 * (recordScore, #1980) : tours multiples, rapières et « toutes les places » y sont admis ;
 * seules les épreuves par équipes (modèle de relais distinct) et les tableaux séparés
 * après les poules restent refusés.
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
} from '../../../shared/types';
import {
  applyFencerForfeit,
  applyScoreToPool,
  buildMatchScores,
  buildPools,
  computeOverallRankingAllRoundsFor,
  computeOverallRankingFor,
  validatePoolScore,
  type PoolSpecialStatus,
} from '../../../shared/utils/poolOrchestration';
import { allowsVictoryTieBreak } from '../../../shared/utils/tieBreak';
import { isTieAtScoreLimit } from '../../../shared/domain/match/matchEndValidation';
import {
  getActiveFormula,
  resolveCompetitionSettings,
} from '../../../shared/utils/customFormulaSettings';
import { getDefaultMaxScores } from '../../../shared/utils/defaultMaxScores';
import { specialStatusPatch } from '../../../shared/utils/forfeit';
import {
  planTableau,
  calculateFinalResults,
  isTableauDone,
  placeBarrageWinners,
  syncConsolationBrackets,
  buildCombinedResults,
} from '../../../shared/domain/tableau/tableauCalculations';
import {
  deriveFirstRound,
  isBracketComplete,
  propagateWinners,
  resetTableauMatch,
  resolveTableauWinner,
  type ConsolationBracket,
  type TableauMatch,
} from '../../../shared/domain/tableau/tableauTypes';
import type { RapieresSession } from '../../../shared/domain/rapieres/rapieres.types';
import { computeEffectiveTableauRanking } from '../../../shared/domain/ranking/tableauRanking';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { EVENT, recordEvents } from './eventLog';
import { resolveSetting } from './settings';
import { bracketMatchView, fencerRef, readSession, summarizePool } from './sessionView';
import { areAllPoolsComplete, isPoolComplete } from '../../../shared/domain/pools/poolCompletion';
import type { PoolSeparation } from '../../../shared/domain/pools/poolDraw';

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
export function assertSupported(comp: Competition, session: Record<string, unknown>): void {
  if (comp.isTeamEvent) {
    throw new CommandError('unsupported_format', 'Épreuve par équipes : à piloter à l’écran');
  }
  if (comp.settings?.specialMode) {
    throw new CommandError('unsupported_format', 'Mode spécial (rapières) : à piloter à l’écran');
  }
  if (
    effectiveSettings(comp).poolRounds > 1 ||
    Number(session.currentPoolRound ?? 1) > 1 ||
    (Array.isArray(session.poolHistory) && session.poolHistory.length > 0)
  ) {
    throw new CommandError('unsupported_format', 'Plusieurs tours de poules : à piloter à l’écran');
  }
}

/**
 * Formats admis pour la saisie d'un score (#1980, ADR-0005) : tous sauf les épreuves par
 * équipes, dont les matchs sont des relais portés par leur propre modèle (teamArena).
 */
export function assertScoreSupported(comp: Competition): void {
  if (comp.isTeamEvent) {
    throw new CommandError(
      'unsupported_format',
      'Épreuve par équipes : scores par l’arène d’équipe ou l’écran'
    );
  }
}

/** Écrit l'état de session (fusion) et prévient l'écran, qui le relit */
export function writeSession(
  ctx: CommandContext,
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

export const emitSession = (ctx: CommandContext, competitionId: string) =>
  ctx.emitChange?.({ scope: 'session', competitionIds: [competitionId] });

export const sessionPools = (session: Record<string, unknown>): Pool[] =>
  Array.isArray(session.pools) ? (session.pools as Pool[]) : [];
const sessionTableau = (session: Record<string, unknown>): TableauMatch[] =>
  Array.isArray(session.tableauMatches) ? (session.tableauMatches as TableauMatch[]) : [];
const sessionConsolation = (session: Record<string, unknown>): ConsolationBracket[] =>
  Array.isArray(session.consolationBrackets)
    ? (session.consolationBrackets as ConsolationBracket[])
    : [];
const sessionPoolHistory = (session: Record<string, unknown>): Pool[][] =>
  Array.isArray(session.poolHistory) ? (session.poolHistory as Pool[][]) : [];
const isRapieres = (comp: Competition) => comp.settings?.specialMode === 'rapieres';

// ─── Poules ──────────────────────────────────────────────────────────────────

export interface GeneratePoolsOptions {
  poolCount?: number;
  minPerPool?: number;
  maxPerPool?: number;
  /** Remplacer des poules dont des matchs sont déjà joués (destructif) */
  replace?: boolean;
  dryRun?: boolean;
  /** Critères de séparation ordonnés, comme la préparation des poules de l'écran */
  separation?: PoolSeparation[];
}

/**
 * Tirage des poules sur les tireurs pointés, comme « Générer les poules » de l'écran,
 * puis poules lancées (phase Poules). Pistes : poule n sur la piste n (salle / journée).
 */
export function generatePools(
  ctx: CommandContext,
  competitionId: string,
  options: GeneratePoolsOptions = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  const existing = sessionPools(session);
  const played = existing.some(p => p.matches?.some(m => m.status === MatchStatus.FINISHED));
  if (played && !options.replace) {
    throw new CommandError(
      'pools_have_scores',
      'Des matchs de poule sont déjà joués : relancer avec replace=true pour les effacer'
    );
  }
  if (sessionTableau(session).length > 0 && !options.replace) {
    throw new CommandError('bracket_exists', 'Le tableau est déjà construit : replace=true requis');
  }
  const fencers = ctx.db
    .getFencersByCompetition(competitionId)
    .filter(f => f.status === FencerStatus.CHECKED_IN);
  const min = options.minPerPool ?? 5;
  const max = options.maxPerPool ?? 7;
  if (min > max) throw new CommandError('invalid_pool_size', 'minPerPool > maxPerPool');
  if (options.poolCount !== undefined && options.poolCount > Math.floor(fencers.length / 3)) {
    throw new CommandError(
      'invalid_pool_count',
      'Trop de poules pour le nombre de tireurs pointés'
    );
  }
  let pools: Pool[];
  try {
    pools = buildPools(fencers, {
      poolMaxScore: effectiveSettings(comp).poolMaxScore,
      poolCount: options.poolCount,
      minPerPool: min,
      maxPerPool: max,
      boutOrder: comp.settings?.poolBoutOrder,
      separation: options.separation,
      newId: uuidv4,
    });
  } catch (e) {
    throw new CommandError('not_enough_fencers', (e as Error).message);
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
  /** Tableau de classement (« toutes les places ») : nom ; null pour le tableau principal */
  bracket?: string | null;
}

const scoreNum = (s: unknown): number | null =>
  s == null ? null : typeof s === 'number' ? s : ((s as { value?: number | null }).value ?? null);

/** Matchs de poule et de tableau, avec leur identifiant pour record_score */
export function listMatches(
  ctx: CommandContext,
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
        bracket: null,
      });
    }
    for (const b of sessionConsolation(session)) {
      for (const m of b.matches) {
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
          bracket: b.name,
        });
      }
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
export function recordScore(ctx: CommandContext, competitionId: string, input: RecordScoreInput) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertScoreSupported(comp);
  const pools = sessionPools(session);
  const poolIndex = pools.findIndex(p => p.matches?.some(m => m.id === input.matchId));
  if (poolIndex >= 0) return recordPoolScore(ctx, comp, session, pools, poolIndex, input);
  if (
    sessionTableau(session).some(m => m.id === input.matchId) ||
    sessionConsolation(session).some(b => b.matches.some(m => m.id === input.matchId))
  ) {
    return recordBracketScore(ctx, comp, session, input);
  }
  if (
    sessionPoolHistory(session).some(r => r.some(p => p.matches?.some(m => m.id === input.matchId)))
  ) {
    throw new CommandError('round_closed', 'Match d’un tour de poules terminé : score figé');
  }
  throw new CommandError('match_not_found', `Match introuvable : ${input.matchId} (list_matches)`);
}

function recordPoolScore(
  ctx: CommandContext,
  comp: Competition,
  session: Record<string, unknown>,
  pools: Pool[],
  poolIndex: number,
  input: RecordScoreInput
) {
  if (sessionTableau(session).length > 0) {
    throw new CommandError('bracket_exists', 'Tableau déjà construit : score de poule figé');
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
  if (error) throw new CommandError(error, `Score refusé : ${error}`);
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
  // Tours multiples (#1051) : classement du tour courant, puis éliminés des tours précédents
  const overallRanking = computeOverallRankingAllRoundsFor(
    nextPools,
    sessionPoolHistory(session),
    isLaser(comp)
  );
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
      const completed: string[] = [];
      for (const p of nextPools) {
        const old = pools.find(x => x.id === p.id);
        const complete = isPoolComplete(p);
        if (old && complete !== old.isComplete) ctx.db.updatePool({ ...p, isComplete: complete });
        const wasComplete = !!old && isPoolComplete(old);
        if (complete && !wasComplete) completed.push(p.id);
      }
      writeSession(ctx, comp.id, { pools: nextPools, overallRanking });
      recordEvents(ctx, comp.id, [
        {
          type: EVENT.scoreRecorded,
          payload: {
            matchId: match.id,
            poolId: pool.id,
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            winnerId: (scores.scoreA.isVictory ? match.fencerA : match.fencerB)?.id ?? null,
            ...(input.specialStatus
              ? { specialStatus: input.specialStatus, fencerId: loser?.id ?? null }
              : {}),
          },
        },
        ...completed.map(poolId => ({ type: EVENT.poolCompleted, payload: { poolId } })),
      ]);
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
    allPoolsComplete: areAllPoolsComplete(nextPools),
  };
}

/** Classement d'entrée du tableau, comme l'écran (vainqueurs de poule, formule) */
function tableauRanking(comp: Competition, session: Record<string, unknown>): PoolRanking[] {
  const overall = Array.isArray(session.overallRanking)
    ? (session.overallRanking as PoolRanking[])
    : [];
  const rapieres = session.rapieres as Partial<RapieresSession> | undefined;
  return computeEffectiveTableauRanking(overall, sessionPools(session), {
    isRapieres: isRapieres(comp),
    rapieresTableauMode: isRapieres(comp) ? rapieres?.tableauMode : undefined,
    poolWinnersOnly: effectiveSettings(comp).poolWinnersOnly,
    customFormula: getActiveFormula(comp.weapon, comp.settings),
    postPoolSplitCriteria: undefined,
    activeSplitGroup: null,
    splitOffCompetitionIds: undefined,
  });
}

function persistTableau(ctx: CommandContext, comp: Competition, matches: TableauMatch[]): void {
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
  ctx: CommandContext,
  competitionId: string,
  options: { thirdPlaceMatch?: boolean; replace?: boolean; dryRun?: boolean } = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  if (comp.settings?.playAllPositions) {
    throw new CommandError(
      'unsupported_format',
      '« Tirer toutes les places » : à piloter à l’écran'
    );
  }
  const eff = effectiveSettings(comp);
  if (!eff.hasDirectElimination) {
    throw new CommandError('no_direct_elimination', 'Épreuve sans élimination directe');
  }
  const pools = sessionPools(session);
  if (!session.skipPoolPhase && (pools.length === 0 || !areAllPoolsComplete(pools))) {
    throw new CommandError('pools_not_complete', 'Toutes les poules doivent être terminées');
  }
  const existing = sessionTableau(session);
  if (existing.some(m => m.winner && !m.isBye) && !options.replace) {
    throw new CommandError(
      'bracket_has_scores',
      'Des matchs du tableau sont joués : replace=true requis'
    );
  }
  // Statuts à jour (abandon, exclusion après les poules)
  // Statuts du classement (comme l'écran) : un décompte différent ferait régénérer le tableau
  const thirdPlace = options.thirdPlaceMatch ?? eff.thirdPlaceMatch;
  // Génération unique écran / moteur (#1979, lot 4)
  const { qualified, size, matches } = planTableau(tableauRanking(comp, session), {
    playAllPositions: false,
    thirdPlaceMatch: thirdPlace,
  });
  if (qualified.length < 2) {
    throw new CommandError('not_enough_fencers', 'Moins de 2 tireurs qualifiés pour le tableau');
  }
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

/** Tableau principal ou tableau de classement (« toutes les places ») contenant le match */
function locateBracketMatch(
  main: TableauMatch[],
  brackets: ConsolationBracket[],
  matchId: string
): { list: TableauMatch[]; bracket: ConsolationBracket | null } {
  if (main.some(m => m.id === matchId)) return { list: main, bracket: null };
  const bracket = brackets.find(b => b.matches.some(m => m.id === matchId))!;
  return { list: bracket.matches, bracket };
}

function recordBracketScore(
  ctx: CommandContext,
  comp: Competition,
  session: Record<string, unknown>,
  input: RecordScoreInput
) {
  if (comp.settings?.postPoolSplitCriteria) {
    throw new CommandError(
      'unsupported_format',
      'Tableaux séparés après les poules : à piloter à l’écran'
    );
  }
  const playAll = !!comp.settings?.playAllPositions;
  let matches = sessionTableau(session).map(m => ({ ...m }));
  let brackets = sessionConsolation(session).map(b => ({
    ...b,
    matches: b.matches.map(m => ({ ...m })),
  }));
  const size = deriveFirstRound(matches);
  let { list, bracket } = locateBracketMatch(matches, brackets, input.matchId);
  const target = list.find(m => m.id === input.matchId)!;
  if (target.isBye || !target.fencerA || !target.fencerB) {
    throw new CommandError('match_not_ready', 'Match incomplet (tireur attendu) ou exempt');
  }
  if (target.winner) {
    // « Toutes les places » : perdants déjà versés dans un tableau de classement, ou
    // vainqueur de barrage déjà placé au premier tour : correction à l'écran
    const parentId = bracket?.id ?? 'main';
    const isBarrage = !bracket && target.round === size * 2;
    if (
      playAll &&
      (isBarrage ||
        brackets.some(b => b.parentBracketId === parentId && b.sourceRound === target.round))
    ) {
      throw new CommandError(
        'next_match_played',
        'Tableau de classement déjà construit depuis ce tour : correction à l’écran'
      );
    }
    // Correction : possible tant que le vainqueur n'a pas tiré le tour suivant
    const reset = resetTableauMatch(list, target.id);
    if (!reset) throw new CommandError('next_match_played', 'Le tour suivant est déjà joué');
    if (bracket) {
      brackets = brackets.map(b => (b.id === bracket!.id ? { ...b, matches: reset } : b));
      ({ list, bracket } = locateBracketMatch(matches, brackets, input.matchId));
    } else {
      matches = reset;
      list = matches;
    }
  }
  const { scoreA, scoreB } = input;
  if (![scoreA, scoreB].every(s => Number.isInteger(s) && s >= 0)) {
    throw new CommandError('score_invalid', 'Score refusé : score_invalid');
  }
  const max = effectiveSettings(comp).tableMaxScore;
  if (!input.specialStatus && max > 0 && (scoreA > max || scoreB > max)) {
    throw new CommandError('score_above_max', `Score refusé : ${max} touches maximum`);
  }
  if (!input.specialStatus && !isLaser(comp) && isTieAtScoreLimit(scoreA, scoreB, max)) {
    throw new CommandError('tie_at_max', `Score refusé : égalité impossible à ${max} touches`);
  }
  if (scoreA === scoreB && !input.winner) {
    throw new CommandError(
      'draw_needs_winner',
      'Égalité : préciser le vainqueur (winner), pas de match nul au tableau'
    );
  }
  if (input.specialStatus && !input.winner) {
    throw new CommandError('winner_required', 'Abandon, forfait ou exclusion : préciser winner');
  }
  const m = list.find(x => x.id === input.matchId)!;
  const tieWinner = input.winner ?? null;
  const winner = input.specialStatus
    ? input.winner === 'A'
      ? m.fencerA
      : m.fencerB
    : resolveTableauWinner(m.fencerA, m.fencerB, scoreA, scoreB, tieWinner);
  if (!winner) throw new CommandError('winner_unresolved', 'Vainqueur indéterminé');
  if (!input.specialStatus && input.winner && scoreA !== scoreB) {
    const expected = scoreA > scoreB ? 'A' : 'B';
    if (expected !== input.winner) {
      throw new CommandError('winner_contradicts_score', 'Vainqueur contraire au score');
    }
  }
  const loser = winner.id === m.fencerA!.id ? m.fencerB! : m.fencerA!;
  Object.assign(m, {
    scoreA,
    scoreB,
    winner,
    specialStatus: input.specialStatus ? { fencerId: loser.id, status: input.specialStatus } : null,
  });
  const ranking = tableauRanking(comp, session);
  if (bracket) {
    // Tableau de classement : propagation interne, comme updateConsolationMatch à l'écran
    propagateWinners(bracket.matches, bracket.size);
    bracket.isComplete = isBracketComplete(bracket.matches);
  } else {
    propagateWinners(matches, size);
    if (playAll) placeBarrageWinners(matches, size);
  }
  if (playAll) {
    // Perdants des tours terminés versés dans les tableaux de classement (useTableauViewScoring)
    brackets = syncConsolationBrackets(matches, brackets, size, ranking, Date.now()).brackets;
  }
  const mainDone = isTableauDone(matches);
  const hasBarrages = matches.some(x => x.round === size * 2);
  const done = playAll
    ? mainDone &&
      !((size >= 8 || hasBarrages) && brackets.length === 0) &&
      brackets.every(b => b.isComplete)
    : mainDone;
  const finalResults = done
    ? playAll
      ? buildCombinedResults(matches, brackets, ranking)
      : calculateFinalResults(matches, ranking, size)
    : [];
  if (!input.dryRun)
    ctx.db.transaction(() => {
      // Journal des scores : écrit par l'upsert (auteur « mcp ») ; les tableaux de
      // classement ne vivent que dans l'état de session, comme à l'écran
      persistTableau(ctx, comp, matches);
      if (input.specialStatus)
        ctx.db.updateFencer(loser.id, specialStatusPatch(input.specialStatus));
      // Tableau terminé : phase Résultats, comme onComplete à l'écran
      writeSession(ctx, comp.id, {
        tableauMatches: matches,
        ...(playAll ? { consolationBrackets: brackets } : {}),
        finalResults,
        ...(done ? { currentPhase: PHASE.results } : {}),
      });
      recordEvents(ctx, comp.id, [
        {
          type: EVENT.scoreRecorded,
          payload: {
            matchId: m.id,
            scoreA,
            scoreB,
            winnerId: winner.id,
            ...(input.specialStatus
              ? { specialStatus: input.specialStatus, fencerId: loser.id }
              : {}),
          },
        },
        { type: EVENT.tableauMatchDecided, payload: { matchId: m.id, winnerId: winner.id } },
        ...(done ? [{ type: EVENT.tableauCompleted, payload: {} }] : []),
      ]);
    });
  if (!input.dryRun) {
    emitSession(ctx, comp.id);
    if (input.specialStatus) ctx.emitChange?.({ scope: 'fencers', competitionIds: [comp.id] });
  }
  return {
    dryRun: !!input.dryRun,
    kind: 'bracket' as const,
    match: bracketMatchView(m),
    bracket: bracket?.name ?? null,
    bracketComplete: done,
    podium: finalResults.slice(0, 4).map(r => ({ rank: r.rank, fencer: fencerRef(r.fencer) })),
  };
}

// ─── Résultats ──────────────────────────────────────────────────────────────

/** Données de résultats d'une épreuve (export) */
export function resultsData(ctx: CommandContext, competitionId: string) {
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
