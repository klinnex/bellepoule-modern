/**
 * BellePoule Modern - Composition des poules en cours d'épreuve (#1980, docs/adr/0017)
 * addPoolFencer : tireur ajouté à une poule lancée, un match contre chaque tireur présent.
 * Règle : shared/domain/pools/poolComposition (addFencerToPool), partagée avec l'écran.
 * Écritures dans la transaction de runCommand : tables, état de session, PoolFencerAdded.
 * Licensed under GPL-3.0
 */
import { v4 as uuidv4 } from 'uuid';
import { addFencerToPool } from '../../../shared/domain/pools/poolComposition';
import {
  computeOverallRankingAllRoundsFor,
  computePoolRankingFor,
} from '../../../shared/utils/poolOrchestration';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { EVENT, recordEvents } from './eventLog';
import { readSession } from './sessionView';
import {
  assertScoreSupported,
  effectiveSettings,
  emitSession,
  isLaser,
  sessionPoolHistory,
  sessionPools,
  sessionTableau,
  writeSession,
} from './sport';

export interface AddPoolFencerInput {
  competitionId: string;
  poolId: string;
  fencerId: string;
  dryRun?: boolean;
}

export function addPoolFencer(ctx: CommandContext, input: AddPoolFencerInput) {
  const comp = getCompetitionOrThrow(ctx, input.competitionId);
  assertScoreSupported(comp);
  const session = readSession(ctx, comp.id);
  if (sessionTableau(session).length > 0) {
    throw new CommandError('bracket_exists', 'Tableau déjà tiré : poules figées');
  }
  const pools = sessionPools(session);
  const index = pools.findIndex(p => p.id === input.poolId);
  if (index < 0) throw new CommandError('pool_not_found', `Poule introuvable : ${input.poolId}`);
  const fencer = ctx.db.getFencersByCompetition(comp.id).find(f => f.id === input.fencerId);
  if (!fencer) throw new CommandError('fencer_not_found', `Tireur introuvable : ${input.fencerId}`);
  if (pools.some(p => p.fencers.some(f => f.id === fencer.id))) {
    throw new CommandError('fencer_already_in_pool', 'Tireur déjà placé dans une poule');
  }
  const added = addFencerToPool(pools[index], fencer, {
    maxScore: effectiveSettings(comp).poolMaxScore,
    newId: uuidv4,
    now: new Date(),
  });
  added.ranking = computePoolRankingFor(added, isLaser(comp));
  const newMatches = added.matches.slice(pools[index].matches.length);
  const report = {
    dryRun: !!input.dryRun,
    poolId: added.id,
    poolNumber: added.number,
    fencerId: fencer.id,
    matchIds: newMatches.map(m => m.id),
  };
  if (input.dryRun) return report;
  const nextPools = pools.map((p, i) => (i === index ? added : p));
  ctx.db.transaction(() => {
    ctx.db.syncPoolSnapshot(comp.id, {
      id: added.id,
      number: added.number,
      fencerIds: added.fencers.map(f => f.id),
      matches: added.matches.map(m => ({
        id: m.id,
        number: m.number,
        fencerAId: m.fencerA?.id ?? null,
        fencerBId: m.fencerB?.id ?? null,
        maxScore: m.maxScore,
      })),
    });
    if (pools[index].isComplete) ctx.db.updatePool({ ...added, isComplete: false });
    writeSession(ctx, comp.id, {
      pools: nextPools,
      overallRanking: computeOverallRankingAllRoundsFor(
        nextPools,
        sessionPoolHistory(session),
        isLaser(comp)
      ),
    });
    recordEvents(ctx, comp.id, [
      {
        type: EVENT.poolFencerAdded,
        payload: {
          poolId: added.id,
          fencerId: fencer.id,
          matches: newMatches.map(m => ({
            matchId: m.id,
            fencerAId: m.fencerA!.id,
            fencerBId: m.fencerB!.id,
          })),
        },
      },
    ]);
  });
  emitSession(ctx, comp.id);
  return report;
}
