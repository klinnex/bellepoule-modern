/**
 * BellePoule Modern - Clôture d'un tour de poules (#1051, #1980, docs/adr/0017)
 * closePoolRound : qualifiés selon le classement du tour terminé (formule ou nombre de
 * qualifiés réglé), non-qualifiés éliminés, tour archivé avec son appel figé, nouveau tour à
 * pointer puis à tirer. Mêmes fonctions que l'écran (selectNextRoundFencers…).
 * Écritures dans la transaction de runCommand : tireurs, état de session, PoolRoundClosed.
 * Licensed under GPL-3.0
 */
import { FencerStatus, type Fencer, type Pool } from '../../../shared/types';
import { getRoundQualifierCount, selectNextRoundFencers } from '../../../shared/utils/poolRounds';
import {
  getActiveFormula,
  getAdvancementCount,
  getPoolRoundAdvancement,
} from '../../../shared/utils/customFormulaSettings';
import {
  computeOverallRankingAllRoundsFor,
  computeOverallRankingFor,
} from '../../../shared/utils/poolOrchestration';
import { areAllPoolsComplete } from '../../../shared/domain/pools/poolCompletion';
import { isTableauEligible } from '../../../shared/domain/fencers/fencerStatus';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { EVENT, recordEvents } from './eventLog';
import { readSession } from './sessionView';
import {
  PHASE,
  assertScoreSupported,
  emitSession,
  isLaser,
  sessionPoolHistory,
  sessionPools,
  sessionTableau,
  writeSession,
} from './sport';

/** Au moins 4 qualifiés pour un nouveau tour (règle de l'écran) */
export const MIN_ROUND_QUALIFIERS = 4;

export interface ClosePoolRoundInput {
  competitionId: string;
  /** Nombre de qualifiés imposé (défaut : formule, puis réglage poolRoundQualifiers) */
  qualifierCount?: number;
  dryRun?: boolean;
}

export function closePoolRound(ctx: CommandContext, input: ClosePoolRoundInput) {
  const comp = getCompetitionOrThrow(ctx, input.competitionId);
  assertScoreSupported(comp);
  const session = readSession(ctx, comp.id);
  const pools = sessionPools(session);
  if (sessionTableau(session).length > 0) {
    throw new CommandError('bracket_exists', 'Tableau déjà tiré : plus de tour de poules');
  }
  if (pools.length === 0 || !areAllPoolsComplete(pools)) {
    throw new CommandError(
      'pools_not_complete',
      'Toutes les poules du tour doivent être terminées'
    );
  }
  const round = Math.max(1, Number(session.currentPoolRound ?? 1) || 1);
  const ranking = computeOverallRankingFor(pools, isLaser(comp));
  const formula = getActiveFormula(comp.weapon, comp.settings);
  const qualifierCount =
    input.qualifierCount ??
    (formula
      ? getAdvancementCount(ranking.length, getPoolRoundAdvancement(formula, round - 1))
      : getRoundQualifierCount(comp.settings?.poolRoundQualifiers, round + 1));
  const { qualified, eliminated } = selectNextRoundFencers(ranking, qualifierCount);
  if (qualified.length < MIN_ROUND_QUALIFIERS) {
    throw new CommandError(
      'not_enough_qualifiers',
      `Il faut au moins ${MIN_ROUND_QUALIFIERS} qualifiés pour un nouveau tour de poules`
    );
  }
  const fencers = ctx.db.getFencersByCompetition(comp.id);
  const byId = new Map(fencers.map(f => [f.id, f]));
  // Retirés (abandon, forfait, exclusion) : statut conservé, seuls les actifs sont éliminés
  const toEliminate = eliminated.filter(f => {
    const status = byId.get(f.id)?.status;
    return status !== undefined && isTableauEligible({ status });
  });
  const report = {
    dryRun: !!input.dryRun,
    round,
    nextRound: round + 1,
    qualifierCount: qualifierCount ?? null,
    qualified: qualified.length,
    eliminated: toEliminate.length,
  };
  if (input.dryRun) return report;

  // Appel figé du tour terminé (consultation, export PDF par tour) : comme l'écran
  const appelSnapshot: Fencer[] =
    round > 1 ? fencers.filter(f => f.status !== FencerStatus.ELIMINATED) : fencers;
  const history: Pool[][] = [...sessionPoolHistory(session), pools];
  const appelHistory = Array.isArray(session.appelHistory)
    ? (session.appelHistory as Fencer[][]).slice(0, history.length - 1)
    : [];
  appelHistory[history.length - 1] = appelSnapshot;

  ctx.db.transaction(() => {
    for (const f of toEliminate) ctx.db.updateFencer(f.id, { status: FencerStatus.ELIMINATED });
    // Qualifiés : classement = place au tour terminé (seed du tirage suivant)
    for (const f of qualified) {
      if (byId.get(f.id)?.ranking !== f.ranking) ctx.db.updateFencer(f.id, { ranking: f.ranking });
    }
    writeSession(ctx, comp.id, {
      currentPhase: PHASE.checkin,
      currentPoolRound: round + 1,
      pools: [],
      poolHistory: history,
      appelHistory,
      overallRanking: computeOverallRankingAllRoundsFor([], history, isLaser(comp)),
      poolsLaunched: false,
    });
    recordEvents(ctx, comp.id, [
      {
        type: EVENT.poolRoundClosed,
        payload: {
          round,
          qualifierCount: qualifierCount ?? null,
          qualifiedIds: qualified.map(f => f.id),
          eliminatedIds: toEliminate.map(f => f.id),
        },
      },
    ]);
  });
  ctx.emitChange?.({ scope: 'fencers', competitionIds: [comp.id] });
  emitSession(ctx, comp.id);
  return report;
}
