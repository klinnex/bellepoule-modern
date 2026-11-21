/**
 * BellePoule Modern - Retrait et réintégration d'un tireur (#1980, docs/adr/0016)
 * withdrawFencer : abandon, forfait, exclusion (carton noir) ; reinstateFencer : annulation.
 * Règle : shared/domain/fencers/withdrawal (planWithdrawal, planReinstatement). Écritures dans
 * la transaction de runCommand : statut, instantané (fencer_abandons), matchs (base et état
 * de session), journal (FencerWithdrawn, FencerReinstated).
 * Licensed under GPL-3.0
 */
import {
  FencerStatus,
  MatchStatus,
  type Competition,
  type Fencer,
  type Pool,
} from '../../../shared/types';
import {
  planReinstatement,
  planWithdrawal,
  type WithdrawalMatchSnapshot,
  type WithdrawalPlan,
  type WithdrawalReason,
  type WithdrawalState,
} from '../../../shared/domain/fencers/withdrawal';
import { isPoolComplete } from '../../../shared/domain/pools/poolCompletion';
import { computeOverallRankingAllRoundsFor } from '../../../shared/utils/poolOrchestration';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import type { NewJournalEvent } from '../../../database/repos/eventLogRepo';
import { EVENT, recordEvents } from './eventLog';
import { readSession } from './sessionView';
import {
  PHASE,
  emitSession,
  isLaser,
  persistTableau,
  sessionConsolation,
  sessionPoolHistory,
  sessionPools,
  sessionTableau,
  settleBracket,
  writeSession,
} from './sport';

export interface WithdrawFencerInput {
  competitionId: string;
  fencerId: string;
  reason: WithdrawalReason;
  blackCard?: boolean;
  matchId?: string;
  dryRun?: boolean;
}

export interface ReinstateFencerInput {
  competitionId: string;
  fencerId: string;
  dryRun?: boolean;
}

const REFUSAL_MESSAGES: Record<string, string> = {
  already_withdrawn: 'Tireur déjà retiré : le réintégrer d’abord (reinstateFencer)',
  tableau_complete: 'Tableau terminé : plus de retrait possible',
  match_not_ready:
    'Adversaire du prochain match pas encore connu : retirer quand le match est formé',
  withdrawal_not_found: 'Aucun retrait à annuler pour ce tireur',
  next_match_played: 'Un match qui suit a déjà été joué : réintégration impossible',
};

function refuse(code: string): never {
  throw new CommandError(code, REFUSAL_MESSAGES[code] ?? code);
}

function assertSupportedFormat(comp: Competition): void {
  if (comp.isTeamEvent) {
    throw new CommandError(
      'unsupported_format',
      'Épreuve par équipes : retrait d’une équipe à l’écran'
    );
  }
}

function fencerOrThrow(ctx: CommandContext, competitionId: string, fencerId: string): Fencer {
  const fencer = ctx.db.getFencersByCompetition(competitionId).find(f => f.id === fencerId);
  if (!fencer) throw new CommandError('fencer_not_found', `Tireur introuvable : ${fencerId}`);
  return fencer;
}

function stateOf(comp: Competition, session: Record<string, unknown>): WithdrawalState {
  return {
    pools: sessionPools(session),
    tableau: sessionTableau(session).map(m => ({ ...m })),
    consolation: sessionConsolation(session).map(b => ({
      ...b,
      matches: b.matches.map(m => ({ ...m })),
    })),
    isLaserSabre: isLaser(comp),
  };
}

/** Matchs de poule modifiés : miroir en base, complétude des poules */
function persistPools(
  ctx: CommandContext,
  before: Pool[],
  after: Pool[],
  matchIds: string[]
): void {
  const ids = new Set(matchIds);
  for (const m of after.flatMap(p => p.matches)) {
    if (ids.has(m.id)) {
      ctx.db.updateMatch(m.id, { scoreA: m.scoreA, scoreB: m.scoreB, status: m.status });
    }
  }
  for (const p of after) {
    const old = before.find(x => x.id === p.id);
    const complete = isPoolComplete(p);
    if (old && complete !== old.isComplete) ctx.db.updatePool({ ...p, isComplete: complete });
  }
}

/**
 * Écrit un retrait déjà planifié (withdrawFencer, recordScore avec statut spécial) :
 * statut et motif, instantané, matchs, état de session ; rend les événements à journaliser.
 * À appeler dans la transaction de la commande.
 */
export function applyWithdrawal(
  ctx: CommandContext,
  comp: Competition,
  session: Record<string, unknown>,
  fencer: Fencer,
  plan: WithdrawalPlan,
  input: { reason: WithdrawalReason; blackCard?: boolean; matchId?: string | null },
  /** Instantané fourni par l'appelant (recordScore : état d'avant le score) */
  snapshot: WithdrawalMatchSnapshot[] = plan.snapshot
): { events: NewJournalEvent[]; done: boolean } {
  ctx.db.saveAbandonSnapshot(fencer.id, comp.id, fencer.status, input.reason, snapshot);
  ctx.db.updateFencer(fencer.id, { status: plan.status, exclusionReason: plan.exclusionReason });
  const events: NewJournalEvent[] = [
    {
      type: EVENT.fencerWithdrawn,
      payload: {
        fencerId: fencer.id,
        reason: input.reason,
        blackCard: input.reason === 'exclusion' && !!input.blackCard,
        matchId: input.matchId ?? plan.forfeitedMatchIds[0] ?? null,
        forfeitedMatchIds: plan.forfeitedMatchIds,
      },
    },
  ];
  let done = false;
  if (plan.phase === 'pools') {
    persistPools(ctx, sessionPools(session), plan.pools, plan.forfeitedMatchIds);
    const overallRanking = computeOverallRankingAllRoundsFor(
      plan.pools,
      sessionPoolHistory(session),
      isLaser(comp)
    );
    writeSession(ctx, comp.id, { pools: plan.pools, overallRanking });
  } else if (plan.phase === 'tableau' && plan.forfeitedMatchIds.length > 0) {
    const mainChanged = plan.tableau.some(m => plan.forfeitedMatchIds.includes(m.id));
    const settled = settleBracket(comp, session, plan.tableau, plan.consolation, mainChanged);
    done = settled.done;
    persistTableau(ctx, comp, plan.tableau);
    writeSession(ctx, comp.id, {
      tableauMatches: plan.tableau,
      consolationBrackets: settled.brackets,
      finalResults: settled.finalResults,
      ...(done ? { currentPhase: PHASE.results } : {}),
    });
    const decided = [...plan.tableau, ...settled.brackets.flatMap(b => b.matches)].find(
      m => m.id === plan.forfeitedMatchIds[0]
    );
    if (decided?.winner) {
      events.push({
        type: EVENT.tableauMatchDecided,
        payload: { matchId: decided.id, winnerId: decided.winner.id },
      });
    }
    if (done) events.push({ type: EVENT.tableauCompleted, payload: {} });
  }
  return { events, done };
}

/** Retrait d'un tireur : abandon, forfait, exclusion (carton noir) */
export function withdrawFencer(ctx: CommandContext, input: WithdrawFencerInput) {
  const comp = getCompetitionOrThrow(ctx, input.competitionId);
  assertSupportedFormat(comp);
  const fencer = fencerOrThrow(ctx, comp.id, input.fencerId);
  const session = readSession(ctx, comp.id);
  const state = stateOf(comp, session);
  if (state.tableau.length > 0 && comp.settings?.postPoolSplitCriteria) {
    throw new CommandError('unsupported_format', 'Tableaux séparés après les poules : à l’écran');
  }
  const plan = planWithdrawal(state, {
    fencerId: fencer.id,
    currentStatus: fencer.status,
    reason: input.reason,
    blackCard: input.blackCard,
    now: new Date(),
  });
  if (!plan.ok) refuse(plan.code);
  const report = {
    dryRun: !!input.dryRun,
    fencerId: fencer.id,
    status: plan.status,
    exclusionReason: plan.exclusionReason,
    phase: plan.phase,
    forfeitedMatchIds: plan.forfeitedMatchIds,
  };
  if (input.dryRun) return report;
  ctx.db.transaction(() => {
    const { events } = applyWithdrawal(ctx, comp, session, fencer, plan, input);
    recordEvents(ctx, comp.id, events);
  });
  ctx.emitChange?.({ scope: 'fencers', competitionIds: [comp.id] });
  if (plan.phase !== 'checkin') emitSession(ctx, comp.id);
  return report;
}

/** Réintégration d'un tireur retiré : statut et matchs d'avant le retrait */
export function reinstateFencer(ctx: CommandContext, input: ReinstateFencerInput) {
  const comp = getCompetitionOrThrow(ctx, input.competitionId);
  assertSupportedFormat(comp);
  const fencer = fencerOrThrow(ctx, comp.id, input.fencerId);
  const session = readSession(ctx, comp.id);
  const state = stateOf(comp, session);
  const stored = ctx.db.getAbandonSnapshot(fencer.id);
  const snapshot =
    stored && stored.competitionId === comp.id
      ? {
          previousStatus: stored.previousStatus,
          matchSnapshots: stored.matchSnapshots as WithdrawalMatchSnapshot[],
        }
      : null;
  // Pas d'instantané (retrait antérieur au moteur) : tireur retiré remis présent, matchs inchangés
  const fallback =
    !snapshot &&
    fencer.status !== FencerStatus.CHECKED_IN &&
    fencer.status !== FencerStatus.NOT_CHECKED_IN
      ? { previousStatus: FencerStatus.CHECKED_IN, matchSnapshots: [] }
      : null;
  if (
    snapshot &&
    state.tableau.length > 0 &&
    snapshot.matchSnapshots.some(s => s.status !== 'tableau')
  ) {
    throw new CommandError(
      'bracket_exists',
      'Tableau déjà tiré : réintégrer en poules passe par la correction de poule'
    );
  }
  const plan = planReinstatement(state, {
    fencerId: fencer.id,
    snapshot: snapshot ?? fallback,
    now: new Date(),
  });
  if (!plan.ok) refuse(plan.code);
  const report = {
    dryRun: !!input.dryRun,
    fencerId: fencer.id,
    status: plan.status,
    restoredMatchIds: plan.restoredMatchIds,
  };
  if (input.dryRun) return report;
  ctx.db.transaction(() => {
    ctx.db.updateFencer(fencer.id, { status: plan.status, exclusionReason: null });
    ctx.db.deleteAbandonSnapshot(fencer.id);
    const tableauTouched = plan.tableau !== state.tableau || plan.consolation !== state.consolation;
    if (tableauTouched) {
      const settled = settleBracket(comp, session, plan.tableau, plan.consolation, false);
      persistTableau(ctx, comp, plan.tableau);
      writeSession(ctx, comp.id, {
        tableauMatches: plan.tableau,
        consolationBrackets: settled.brackets,
        finalResults: settled.finalResults,
        ...(session.currentPhase === PHASE.results ? { currentPhase: PHASE.tableau } : {}),
      });
    } else if (state.pools.length > 0) {
      persistPools(ctx, state.pools, plan.pools, plan.restoredMatchIds);
      // Match remis « à jouer » : l'état de session garde le statut NOT_STARTED
      const overallRanking = computeOverallRankingAllRoundsFor(
        plan.pools,
        sessionPoolHistory(session),
        isLaser(comp)
      );
      writeSession(ctx, comp.id, { pools: plan.pools, overallRanking });
    }
    recordEvents(ctx, comp.id, [
      {
        type: EVENT.fencerReinstated,
        payload: {
          fencerId: fencer.id,
          restoredStatus: plan.status,
          restoredMatchIds: plan.restoredMatchIds,
        },
      },
    ]);
  });
  ctx.emitChange?.({ scope: 'fencers', competitionIds: [comp.id] });
  emitSession(ctx, comp.id);
  return report;
}

/** Statut des matchs remis à jouer (utilisé par les tests) */
export const NOT_STARTED = MatchStatus.NOT_STARTED;
