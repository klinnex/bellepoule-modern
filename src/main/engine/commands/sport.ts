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
  applyScoreToPool,
  buildMatchScores,
  buildPools,
  computeOverallRankingAllRoundsFor,
  validatePoolScore,
  type PoolSpecialStatus,
} from '../../../shared/utils/poolOrchestration';
import { allowsVictoryTieBreak } from '../../../shared/utils/tieBreak';
import { planWithdrawal, WITHDRAWAL_STATUS } from '../../../shared/domain/fencers/withdrawal';
import { isWithdrawn } from '../../../shared/domain/fencers/fencerStatus';
import { isTieAtScoreLimit } from '../../../shared/domain/match/matchEndValidation';
import {
  getActiveFormula,
  resolveCompetitionSettings,
} from '../../../shared/utils/customFormulaSettings';
import { getDefaultMaxScores } from '../../../shared/utils/defaultMaxScores';
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
import {
  composePools,
  type PoolCompositionInput,
} from '../../../shared/domain/pools/poolComposition';
import {
  composeTableau,
  tableauComposition,
  type TableauMatchInput,
} from '../../../shared/domain/tableau/tableauComposition';

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

export const isLaser = (c: Competition) => c.weapon === Weapon.LASER;

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
export const sessionTableau = (session: Record<string, unknown>): TableauMatch[] =>
  Array.isArray(session.tableauMatches) ? (session.tableauMatches as TableauMatch[]) : [];
export const sessionConsolation = (session: Record<string, unknown>): ConsolationBracket[] =>
  Array.isArray(session.consolationBrackets)
    ? (session.consolationBrackets as ConsolationBracket[])
    : [];
export const sessionPoolHistory = (session: Record<string, unknown>): Pool[][] =>
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
  /**
   * Composition retenue par le DT à la préparation (écran, docs/adr/0017) : pas de tirage,
   * poules et ordre des matchs tels quels. Admise pour tous les formats individuels, tour
   * courant compris (tours multiples, rapières).
   */
  composition?: PoolCompositionInput[];
}

const SEPARATION_KEYS = ['byRanking', 'byClub', 'byRegion', 'byNation'] as const;

/** Critères ordonnés (contrat, MCP) → séparation du tirage ; classement toujours actif, en tête par défaut */
export function separationFromKeys(
  raw: Array<(typeof SEPARATION_KEYS)[number]> | undefined
): PoolSeparation[] | undefined {
  if (raw === undefined) return undefined;
  const keys = [...new Set(raw)];
  const ordered = keys.includes('byRanking') ? keys : (['byRanking', ...keys] as typeof keys);
  return [
    ...ordered.map(key => ({ key, enabled: true })),
    ...SEPARATION_KEYS.filter(k => !ordered.includes(k)).map(key => ({ key, enabled: false })),
  ];
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
  if (options.composition) assertScoreSupported(comp);
  else assertSupported(comp, session);
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
  const round = Math.max(1, Number(session.currentPoolRound ?? 1) || 1);
  const poolHistory = sessionPoolHistory(session);
  const min = options.minPerPool ?? 5;
  const max = options.maxPerPool ?? 7;
  let pools: Pool[];
  let fencers: Fencer[];
  if (options.composition) {
    const all = ctx.db.getFencersByCompetition(competitionId);
    const composed = composePools(options.composition, new Map(all.map(f => [f.id, f])), {
      poolMaxScore: effectiveSettings(comp).poolMaxScore,
      round,
      now: new Date(),
    });
    if (!composed.ok) {
      throw new CommandError(
        'invalid_composition',
        `Composition refusée : ${composed.code} (${composed.detail})`
      );
    }
    pools = composed.pools;
    fencers = pools.flatMap(p => p.fencers);
  } else {
    fencers = ctx.db
      .getFencersByCompetition(competitionId)
      .filter(f => f.status === FencerStatus.CHECKED_IN);
    if (min > max) throw new CommandError('invalid_pool_size', 'minPerPool > maxPerPool');
    if (options.poolCount !== undefined && options.poolCount > Math.floor(fencers.length / 3)) {
      throw new CommandError(
        'invalid_pool_count',
        'Trop de poules pour le nombre de tireurs pointés'
      );
    }
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
  }
  // Tours multiples (#1051) : classement du tour tiré, puis éliminés des tours précédents
  const overallRanking = computeOverallRankingAllRoundsFor(pools, poolHistory, isLaser(comp));
  const summary = {
    dryRun: !!options.dryRun,
    round,
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
    // Rapières : vagues remises à zéro par un nouveau tirage (resetRapieresWaves de l'écran)
    const rapieres = session.rapieres as Record<string, unknown> | undefined;
    writeSession(ctx, competitionId, {
      currentPhase: PHASE.pools,
      currentPoolRound: round,
      pools,
      poolHistory,
      overallRanking,
      ...(isRapieres(comp) && rapieres
        ? { rapieres: { ...rapieres, launchedWave: 0, wavesEnded: false } }
        : {}),
      tableauMatches: [],
      finalResults: [],
      consolationBrackets: [],
      skipPoolPhase: false,
      poolsLaunched: true,
      // Composition de l'écran : bornes de taille choisies à la préparation conservées
      poolPrepParams: {
        minFencersPerPool: min,
        maxFencersPerPool: max,
        ...(options.composition
          ? (session.poolPrepParams as Record<string, number> | undefined)
          : {}),
        poolCount: pools.length,
      },
    });
    recordEvents(ctx, competitionId, [
      {
        type: EVENT.poolsGenerated,
        payload: {
          round,
          pools: pools.map(p => ({
            poolId: p.id,
            number: p.number,
            strip: p.strip ?? null,
            fencerIds: p.fencers.map(f => f.id),
            matches: p.matches.map(m => ({
              matchId: m.id,
              fencerAId: m.fencerA!.id,
              fencerBId: m.fencerB!.id,
            })),
          })),
        },
      },
    ]);
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
  /** Exclusion sur carton noir (motif black_card, docs/adr/0016) */
  blackCard?: boolean;
  /**
   * Correction d'un score de poule après le tirage du tableau (#1996, docs/adr/0017) : motif
   * inscrit au journal des scores ; `rebuildTableau` retire le tableau, à refaire sur le
   * classement corrigé (sinon il est gardé tel quel)
   */
  correction?: { reason: string; rebuildTableau?: boolean };
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
  const tableauDrawn = sessionTableau(session).length > 0;
  if (tableauDrawn && !input.correction) {
    throw new CommandError('bracket_exists', 'Tableau déjà construit : score de poule figé');
  }
  if (tableauDrawn && input.specialStatus) {
    throw new CommandError(
      'correction_special_refused',
      'Correction après tirage : pas de statut spécial (retrait du tireur à part)'
    );
  }
  const correction = tableauDrawn ? input.correction : undefined;
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
  const applied = applyScoreToPool(pool, matchIndex, scores, isLaser(comp));
  // Match corrigé : motif et heure affichés à l'écran, comme une correction locale (#1996)
  const scoredPool = correction
    ? {
        ...applied,
        matches: applied.matches.map((m, i) =>
          i === matchIndex
            ? { ...m, correction: { reason: correction.reason, at: new Date().toISOString() } }
            : m
        ),
      }
    : applied;
  let nextPools = pools.map((p, i) => (i === poolIndex ? scoredPool : p));
  // Abandon, forfait, exclusion : comme l'écran, statut du perdant propagé et ses autres
  // matchs perdus (handleFencerForfeit), liste d'appel alignée (specialStatusPatch)
  const loser = input.specialStatus
    ? scores.scoreA.isVictory
      ? match.fencerB
      : match.fencerA
    : null;
  // Retrait du perdant : même règle que withdrawFencer (docs/adr/0016), même transaction
  const withdrawal =
    loser && input.specialStatus
      ? planWithdrawal(
          { pools: nextPools, tableau: [], consolation: [], isLaserSabre: isLaser(comp) },
          {
            fencerId: loser.id,
            currentStatus: ctx.db.getFencer(loser.id)?.status,
            reason: input.specialStatus,
            blackCard: input.blackCard,
            now: new Date(),
          }
        )
      : null;
  if (withdrawal?.ok) nextPools = withdrawal.pools;
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
      if (loser && input.specialStatus && withdrawal?.ok) {
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
        ctx.db.updateFencer(loser.id, {
          status: withdrawal.status,
          exclusionReason: withdrawal.exclusionReason,
        });
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
        ...scoreAudit(ctx),
        ...(correction ? { changedBy: 'correction', reason: correction.reason } : {}),
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
      writeSession(ctx, comp.id, {
        pools: nextPools,
        overallRanking,
        // Tableau retiré : refait sur le classement corrigé à l'ouverture de l'onglet Tableau
        ...(correction?.rebuildTableau
          ? { tableauMatches: [], consolationBrackets: [], finalResults: [] }
          : {}),
      });
      recordEvents(ctx, comp.id, [
        {
          type: EVENT.scoreRecorded,
          payload: {
            matchId: match.id,
            poolId: pool.id,
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            winnerId: (scores.scoreA.isVictory ? match.fencerA : match.fencerB)?.id ?? null,
            ...(correction
              ? {
                  correction: {
                    reason: correction.reason,
                    rebuildTableau: !!correction.rebuildTableau,
                  },
                }
              : {}),
            ...(input.specialStatus
              ? { specialStatus: input.specialStatus, fencerId: loser?.id ?? null }
              : {}),
          },
        },
        ...(loser && input.specialStatus && withdrawal?.ok
          ? [
              {
                type: EVENT.fencerWithdrawn,
                payload: {
                  fencerId: loser.id,
                  reason: input.specialStatus,
                  blackCard: input.specialStatus === 'exclusion' && !!input.blackCard,
                  matchId: match.id,
                  forfeitedMatchIds: [
                    match.id,
                    ...withdrawal.forfeitedMatchIds.filter(id => id !== match.id),
                  ],
                },
              },
            ]
          : []),
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

/**
 * Auteur au journal des scores (score_audit_log), selon l'origine de la commande : mêmes
 * valeurs qu'avant le passage par recordScore (écran « ui », tablette « referee » ou nom de
 * l'arbitre, appareil de piste « device », agent « mcp »).
 */
function scoreAudit(ctx: CommandContext): {
  changedBy: string;
  reason?: string;
  refereeId?: string;
  refereeName?: string;
  ipAddress?: string;
} {
  const base = scoreAuditBase(ctx);
  const extra = ctx.scoreAudit;
  return {
    ...base,
    ...extra,
    // Nom de l'arbitre au journal des scores comme avant ; le journal d'épreuve n'a que l'id
    changedBy: extra?.refereeName || base.changedBy,
    reason: extra?.reason ?? base.reason,
  };
}

function scoreAuditBase(ctx: CommandContext): { changedBy: string; reason?: string } {
  const by = ctx.actor;
  switch (by?.source) {
    case 'screen':
      return { changedBy: 'ui' };
    case 'tablet':
      return { changedBy: 'referee', reason: 'arena_finish' };
    case 'cyrano':
    case 'opp2':
      return { changedBy: 'device', reason: 'arena_finish' };
    default:
      return { changedBy: 'mcp', reason: 'mcp_entry' };
  }
}

/** Classement d'entrée du tableau, comme l'écran (vainqueurs de poule, formule) */
export function tableauRanking(comp: Competition, session: Record<string, unknown>): PoolRanking[] {
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

export function persistTableau(
  ctx: CommandContext,
  comp: Competition,
  matches: TableauMatch[]
): void {
  const { changedBy, reason } = scoreAudit(ctx);
  const audit = { changedBy, reason: reason ?? 'tableau_entry' };
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
  options: {
    thirdPlaceMatch?: boolean;
    replace?: boolean;
    dryRun?: boolean;
    /**
     * Placement calculé par l'écran (docs/adr/0017) : pas de planification ; admis pour tous
     * les formats individuels (rapières, tours multiples, « toutes les places »), hors
     * tableaux séparés après les poules.
     */
    composition?: TableauMatchInput[];
  } = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  if (options.composition) {
    assertScoreSupported(comp);
    if (comp.settings?.postPoolSplitCriteria) {
      throw new CommandError('unsupported_format', 'Tableaux séparés après les poules : à l’écran');
    }
  } else assertSupported(comp, session);
  if (!options.composition && comp.settings?.playAllPositions) {
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
  if (
    !options.composition &&
    !session.skipPoolPhase &&
    (pools.length === 0 || !areAllPoolsComplete(pools))
  ) {
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
  // Génération unique écran / moteur (#1979, lot 4) ; ou placement de l'écran, contrôlé
  let qualified: { length: number };
  let size: number;
  let matches: TableauMatch[];
  if (options.composition) {
    const all = ctx.db.getFencersByCompetition(competitionId);
    const composed = composeTableau(options.composition, new Map(all.map(f => [f.id, f])));
    if (!composed.ok) {
      throw new CommandError(
        'invalid_composition',
        `Tableau refusé : ${composed.code} (${composed.detail})`
      );
    }
    matches = composed.matches;
    size = deriveFirstRound(matches);
    const placed = new Set(
      matches
        .filter(m => m.round === size || m.round === size * 2)
        .flatMap(m => [m.fencerA?.id, m.fencerB?.id])
        .filter(Boolean)
    );
    qualified = { length: placed.size };
  } else {
    ({ qualified, size, matches } = planTableau(tableauRanking(comp, session), {
      playAllPositions: false,
      thirdPlaceMatch: thirdPlace,
    }));
  }
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
    recordEvents(ctx, competitionId, [
      {
        type: EVENT.tableauGenerated,
        payload: {
          size,
          thirdPlaceMatch: thirdPlace,
          playAllPositions: !!comp.settings?.playAllPositions,
          matches: tableauComposition(matches).map(m => ({
            ...m,
            seedA: m.seedA ?? null,
            seedB: m.seedB ?? null,
          })),
        },
      },
    ]);
  });
  emitSession(ctx, competitionId);
  if (thirdPlace !== eff.thirdPlaceMatch) {
    ctx.emitChange?.({ scope: 'competitions', competitionIds: [comp.id] });
  }
  return summary;
}

/**
 * Tableau après une décision (score, retrait) : propagation du tableau principal (et
 * barrages), tableaux de classement créés au fil des tours, achèvement et classement final.
 * Les tableaux de classement modifiés ont déjà propagé leurs vainqueurs.
 */
export function settleBracket(
  comp: Competition,
  session: Record<string, unknown>,
  matches: TableauMatch[],
  brackets: ConsolationBracket[],
  mainChanged: boolean
): {
  brackets: ConsolationBracket[];
  done: boolean;
  finalResults: ReturnType<typeof calculateFinalResults>;
} {
  const playAll = !!comp.settings?.playAllPositions;
  const size = deriveFirstRound(matches);
  const ranking = tableauRanking(comp, session);
  if (mainChanged) {
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
  return { brackets, done, finalResults };
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
  if (bracket) {
    // Tableau de classement : propagation interne, comme updateConsolationMatch à l'écran
    propagateWinners(bracket.matches, bracket.size);
    bracket.isComplete = isBracketComplete(bracket.matches);
  }
  const settled = settleBracket(comp, session, matches, brackets, !bracket);
  brackets = settled.brackets;
  const { done, finalResults } = settled;
  if (!input.dryRun)
    ctx.db.transaction(() => {
      // Journal des scores : écrit par l'upsert (auteur « mcp ») ; les tableaux de
      // classement ne vivent que dans l'état de session, comme à l'écran
      persistTableau(ctx, comp, matches);
      // Retrait du perdant : même règle que withdrawFencer (docs/adr/0016)
      const withdrawn = input.specialStatus && !isWithdrawn(ctx.db.getFencer(loser.id));
      if (input.specialStatus && withdrawn) {
        ctx.db.saveAbandonSnapshot(
          loser.id,
          comp.id,
          ctx.db.getFencer(loser.id)?.status ?? FencerStatus.QUALIFIED,
          input.specialStatus,
          [{ matchId: m.id, status: 'tableau', scoreA: null, scoreB: null }]
        );
        ctx.db.updateFencer(loser.id, {
          status: WITHDRAWAL_STATUS[input.specialStatus],
          exclusionReason:
            input.specialStatus === 'exclusion' && input.blackCard ? 'black_card' : null,
        });
      }
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
        ...(input.specialStatus && withdrawn
          ? [
              {
                type: EVENT.fencerWithdrawn,
                payload: {
                  fencerId: loser.id,
                  reason: input.specialStatus,
                  blackCard: input.specialStatus === 'exclusion' && !!input.blackCard,
                  matchId: m.id,
                  forfeitedMatchIds: [m.id],
                },
              },
            ]
          : []),
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
