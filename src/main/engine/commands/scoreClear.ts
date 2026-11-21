/**
 * BellePoule Modern - Annulation d'un score (#1115, #1980, docs/adr/0005 et 0017)
 * clearScore : match de poule remis à jouer (classements recalculés), ou match de tableau
 * rouvert (vainqueur retiré du tour suivant ; refus si le tour suivant est joué). Mêmes
 * règles que l'écran (resetTableauMatch). Journal : ScoreCleared.
 * Licensed under GPL-3.0
 */
import { MatchStatus, type Pool } from '../../../shared/types';
import {
  computeOverallRankingAllRoundsFor,
  computePoolRankingFor,
} from '../../../shared/utils/poolOrchestration';
import {
  deriveFirstRound,
  isBracketComplete,
  resetTableauMatch,
} from '../../../shared/domain/tableau/tableauTypes';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { EVENT, recordEvents } from './eventLog';
import { readSession } from './sessionView';
import {
  PHASE,
  assertScoreSupported,
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

export function clearScore(
  ctx: CommandContext,
  input: { competitionId: string; matchId: string; dryRun?: boolean }
) {
  const comp = getCompetitionOrThrow(ctx, input.competitionId);
  assertScoreSupported(comp);
  const session = readSession(ctx, comp.id);
  const pools = sessionPools(session);
  const tableau = sessionTableau(session);
  const poolIndex = pools.findIndex(p => p.matches.some(m => m.id === input.matchId));

  if (poolIndex >= 0) {
    if (tableau.length > 0) {
      throw new CommandError('bracket_exists', 'Tableau déjà tiré : poules figées');
    }
    const report = { dryRun: !!input.dryRun, kind: 'pool' as const, matchId: input.matchId };
    if (input.dryRun) return report;
    const now = new Date();
    const pool = pools[poolIndex];
    const previous = pool.matches.find(m => m.id === input.matchId)!;
    const cleared: Pool = {
      ...pool,
      matches: pool.matches.map(m =>
        m.id === input.matchId
          ? { ...m, scoreA: null, scoreB: null, status: MatchStatus.NOT_STARTED, updatedAt: now }
          : m
      ),
      isComplete: false,
      updatedAt: now,
    };
    cleared.ranking = computePoolRankingFor(cleared, isLaser(comp));
    const nextPools = pools.map((p, i) => (i === poolIndex ? cleared : p));
    ctx.db.transaction(() => {
      ctx.db.updateMatch(input.matchId, {
        scoreA: null,
        scoreB: null,
        status: MatchStatus.NOT_STARTED,
      });
      if (pool.isComplete) ctx.db.updatePool({ ...cleared, isComplete: false });
      if (previous.scoreA || previous.scoreB) {
        ctx.db.logScoreChange({
          matchId: input.matchId,
          poolId: pool.id,
          previousScoreA: previous.scoreA ?? undefined,
          previousScoreB: previous.scoreB ?? undefined,
          newScoreA: null,
          newScoreB: null,
          changedBy: ctx.actor?.source === 'screen' ? 'ui' : (ctx.actor?.source ?? 'mcp'),
          reason: 'score_cleared',
        });
      }
      writeSession(ctx, comp.id, {
        pools: nextPools,
        overallRanking: computeOverallRankingAllRoundsFor(
          nextPools,
          sessionPoolHistory(session),
          isLaser(comp)
        ),
      });
      recordEvents(ctx, comp.id, [
        { type: EVENT.scoreCleared, payload: { matchId: input.matchId, poolId: pool.id } },
      ]);
    });
    emitSession(ctx, comp.id);
    return report;
  }

  const brackets = sessionConsolation(session);
  const inMain = tableau.some(m => m.id === input.matchId);
  const bracket = brackets.find(b => b.matches.some(m => m.id === input.matchId));
  if (!inMain && !bracket) {
    throw new CommandError('match_not_found', `Match introuvable : ${input.matchId}`);
  }
  const list = inMain ? tableau : bracket!.matches;
  const target = list.find(m => m.id === input.matchId)!;
  // « Toutes les places » : perdants déjà versés dans un tableau de classement → à l'écran
  const parentId = bracket?.id ?? 'main';
  const size = deriveFirstRound(tableau);
  if (
    comp.settings?.playAllPositions &&
    ((inMain && target.round === size * 2) ||
      brackets.some(b => b.parentBracketId === parentId && b.sourceRound === target.round))
  ) {
    throw new CommandError(
      'next_match_played',
      'Tableau de classement déjà construit depuis ce tour : annulation à l’écran'
    );
  }
  const reset = resetTableauMatch(list, input.matchId);
  if (!reset) throw new CommandError('next_match_played', 'Le tour suivant est déjà joué');
  const report = { dryRun: !!input.dryRun, kind: 'bracket' as const, matchId: input.matchId };
  if (input.dryRun) return report;
  const matches = inMain ? reset : tableau.map(m => ({ ...m }));
  const nextBrackets = bracket
    ? brackets.map(b =>
        b.id === bracket.id ? { ...b, matches: reset, isComplete: isBracketComplete(reset) } : b
      )
    : brackets;
  const settled = settleBracket(comp, session, matches, nextBrackets, false);
  ctx.db.transaction(() => {
    persistTableau(ctx, comp, matches);
    writeSession(ctx, comp.id, {
      tableauMatches: matches,
      consolationBrackets: settled.brackets,
      finalResults: settled.finalResults,
      ...(session.currentPhase === PHASE.results ? { currentPhase: PHASE.tableau } : {}),
    });
    recordEvents(ctx, comp.id, [{ type: EVENT.scoreCleared, payload: { matchId: input.matchId } }]);
  });
  emitSession(ctx, comp.id);
  return report;
}
