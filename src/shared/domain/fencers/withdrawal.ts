/**
 * BellePoule Modern - Retrait et réintégration d'un tireur (#1980, docs/adr/0016)
 * Règle unique, appliquée par le moteur (withdrawFencer, reinstateFencer, recordScore avec
 * statut spécial) : effet sur les matchs selon la phase, statut et motif, instantané qui
 * permet l'annulation. Fonctions pures : l'heure est injectée.
 * Licensed under GPL-3.0
 */
import {
  FencerStatus,
  MatchStatus,
  type ExclusionReason,
  type Pool,
  type Score,
} from '../../types';
import { applyFencerForfeit, computePoolRankingFor } from '../../utils/poolOrchestration';
import { checkInForfeitReason } from '../../utils/forfeit';
import {
  isBracketComplete,
  resetTableauMatch,
  type ConsolationBracket,
  type TableauMatch,
} from '../tableau/tableauTypes';
import { isWithdrawnStatus } from './fencerStatus';

export type WithdrawalReason = 'abandon' | 'forfait' | 'exclusion';

export const WITHDRAWAL_STATUS: Record<WithdrawalReason, FencerStatus> = {
  abandon: FencerStatus.ABANDONED,
  forfait: FencerStatus.FORFAIT,
  exclusion: FencerStatus.EXCLUDED,
};

/** État d'un match avant le retrait (table fencer_abandons) */
export interface WithdrawalMatchSnapshot {
  matchId: string;
  /** Statut du match de poule ; « tableau » pour un match d'élimination directe */
  status: string;
  scoreA: unknown;
  scoreB: unknown;
}

/** État de l'épreuve utile au retrait (session de l'écran) */
export interface WithdrawalState {
  pools: Pool[];
  tableau: TableauMatch[];
  consolation: ConsolationBracket[];
  isLaserSabre: boolean;
}

export type WithdrawalRefusal =
  | 'already_withdrawn'
  | 'tableau_complete'
  | 'match_not_ready'
  | 'withdrawal_not_found'
  | 'next_match_played';

export interface WithdrawalPlan {
  ok: true;
  phase: 'checkin' | 'pools' | 'tableau';
  status: FencerStatus;
  exclusionReason: ExclusionReason | null;
  pools: Pool[];
  tableau: TableauMatch[];
  consolation: ConsolationBracket[];
  /** Matchs perdus par le retrait (poules : non disputés ; tableau : match en cours) */
  forfeitedMatchIds: string[];
  /** État d'avant, pour reinstateFencer */
  snapshot: WithdrawalMatchSnapshot[];
}

export type WithdrawalResult = WithdrawalPlan | { ok: false; code: WithdrawalRefusal };

const touches = (
  m: { fencerA?: { id: string } | null; fencerB?: { id: string } | null },
  id: string
) => m.fencerA?.id === id || m.fencerB?.id === id;

/** Motif enregistré : carton noir (exclusion confirmée), DNS (sorti avant tout match), sinon aucun */
export function withdrawalExclusionReason(
  reason: WithdrawalReason,
  blackCard: boolean,
  pools: Pool[],
  fencerId: string
): ExclusionReason | null {
  if (reason === 'exclusion') return blackCard ? 'black_card' : null;
  return checkInForfeitReason(pools, fencerId);
}

/** Match du tableau non décidé où figure le tireur (tableau principal puis classement) */
function pendingTableauMatch(
  state: WithdrawalState,
  fencerId: string
): { list: 'main' | string; match: TableauMatch } | null {
  const main = state.tableau.find(m => !m.isBye && !m.winner && touches(m, fencerId));
  if (main) return { list: 'main', match: main };
  for (const b of state.consolation) {
    const m = b.matches.find(x => !x.isBye && !x.winner && touches(x, fencerId));
    if (m) return { list: b.id, match: m };
  }
  return null;
}

const tableauDone = (state: WithdrawalState): boolean =>
  !!state.tableau.find(m => m.round === 2)?.winner &&
  state.consolation.every(b => b.isComplete) &&
  (!state.tableau.find(m => m.round === 3) || !!state.tableau.find(m => m.round === 3)?.winner);

/**
 * Retrait d'un tireur (abandon, forfait, exclusion) selon la phase :
 * - appel (ni poules ni tableau) : statut seul ;
 * - poules : matchs non disputés perdus (applyFencerForfeit), DNS si aucun match commencé ;
 * - tableau : match en cours perdu, l'adversaire gagne (la propagation est faite par le
 *   moteur, qui connaît le classement) ; adversaire inconnu : match_not_ready ; tableau
 *   terminé : tableau_complete.
 * Un tireur déjà retiré : already_withdrawn (réintégrer d'abord).
 */
export function planWithdrawal(
  state: WithdrawalState,
  input: {
    fencerId: string;
    currentStatus: string | null | undefined;
    reason: WithdrawalReason;
    blackCard?: boolean;
    now: Date;
  }
): WithdrawalResult {
  const { fencerId, reason } = input;
  if (isWithdrawnStatus(input.currentStatus)) return { ok: false, code: 'already_withdrawn' };
  const status = WITHDRAWAL_STATUS[reason];
  const exclusionReason = withdrawalExclusionReason(
    reason,
    !!input.blackCard,
    state.pools,
    fencerId
  );
  const base = {
    ok: true as const,
    status,
    exclusionReason,
    pools: state.pools,
    tableau: state.tableau,
    consolation: state.consolation,
  };

  if (state.tableau.length > 0) {
    if (tableauDone(state)) return { ok: false, code: 'tableau_complete' };
    const pending = pendingTableauMatch(state, fencerId);
    if (!pending) {
      // Déjà éliminé du tableau : le statut seul (classement final)
      return { ...base, phase: 'tableau', forfeitedMatchIds: [], snapshot: [] };
    }
    const { match } = pending;
    if (!match.fencerA || !match.fencerB) return { ok: false, code: 'match_not_ready' };
    const winner = match.fencerA.id === fencerId ? match.fencerB : match.fencerA;
    const decided: TableauMatch = {
      ...match,
      winner,
      specialStatus: { fencerId, status: reason },
    };
    const swap = (list: TableauMatch[]) => list.map(m => (m.id === match.id ? decided : m));
    const snapshot: WithdrawalMatchSnapshot[] = [
      { matchId: match.id, status: 'tableau', scoreA: match.scoreA, scoreB: match.scoreB },
    ];
    return pending.list === 'main'
      ? {
          ...base,
          phase: 'tableau',
          tableau: swap(state.tableau),
          forfeitedMatchIds: [match.id],
          snapshot,
        }
      : {
          ...base,
          phase: 'tableau',
          consolation: state.consolation.map(b =>
            b.id === pending.list ? { ...b, matches: swap(b.matches) } : b
          ),
          forfeitedMatchIds: [match.id],
          snapshot,
        };
  }

  const inPools = state.pools.some(
    p => p.fencers.some(f => f.id === fencerId) || p.matches.some(m => touches(m, fencerId))
  );
  if (!inPools) return { ...base, phase: 'checkin', forfeitedMatchIds: [], snapshot: [] };

  const before = state.pools.flatMap(p => p.matches).filter(m => touches(m, fencerId));
  const snapshot = before.map(m => ({
    matchId: m.id,
    status: m.status as string,
    scoreA: m.scoreA ? { ...m.scoreA } : null,
    scoreB: m.scoreB ? { ...m.scoreB } : null,
  }));
  const { pools } = applyFencerForfeit(
    state.pools,
    fencerId,
    reason,
    state.isLaserSabre,
    input.now
  );
  const beforeById = new Map(before.map(m => [m.id, m]));
  const forfeitedMatchIds = pools
    .flatMap(p => p.matches)
    .filter(m => {
      const old = beforeById.get(m.id);
      return (
        !!old &&
        (old.status !== m.status ||
          JSON.stringify(old.scoreA) !== JSON.stringify(m.scoreA) ||
          JSON.stringify(old.scoreB) !== JSON.stringify(m.scoreB))
      );
    })
    .map(m => m.id);
  return { ...base, phase: 'pools', pools, forfeitedMatchIds, snapshot };
}

export interface ReinstatementPlan {
  ok: true;
  status: FencerStatus;
  pools: Pool[];
  tableau: TableauMatch[];
  consolation: ConsolationBracket[];
  restoredMatchIds: string[];
}

export type ReinstatementResult = ReinstatementPlan | { ok: false; code: WithdrawalRefusal };

/**
 * Réintégration : statut d'avant le retrait, matchs remis dans leur état d'avant (instantané).
 * Tableau : le match perdu par le retrait est rouvert si le tour suivant n'est pas joué.
 */
export function planReinstatement(
  state: WithdrawalState,
  input: {
    fencerId: string;
    snapshot: { previousStatus: string; matchSnapshots: WithdrawalMatchSnapshot[] } | null;
    now: Date;
  }
): ReinstatementResult {
  const { fencerId, snapshot } = input;
  if (!snapshot) return { ok: false, code: 'withdrawal_not_found' };
  const status = (snapshot.previousStatus as FencerStatus) || FencerStatus.CHECKED_IN;
  let tableau = state.tableau;
  let consolation = state.consolation;
  const restoredMatchIds: string[] = [];

  for (const saved of snapshot.matchSnapshots.filter(s => s.status === 'tableau')) {
    const restore = (list: TableauMatch[]): TableauMatch[] | null => {
      const reset = resetTableauMatch(list, saved.matchId);
      if (!reset) return null;
      return reset.map(m =>
        m.id === saved.matchId
          ? {
              ...m,
              scoreA: (saved.scoreA as number | null) ?? null,
              scoreB: (saved.scoreB as number | null) ?? null,
            }
          : m
      );
    };
    if (tableau.some(m => m.id === saved.matchId)) {
      const next = restore(tableau);
      if (!next) return { ok: false, code: 'next_match_played' };
      tableau = next;
    } else {
      const bracket = consolation.find(b => b.matches.some(m => m.id === saved.matchId));
      if (!bracket) continue;
      const next = restore(bracket.matches);
      if (!next) return { ok: false, code: 'next_match_played' };
      consolation = consolation.map(b =>
        b.id === bracket.id ? { ...b, matches: next, isComplete: isBracketComplete(next) } : b
      );
    }
    restoredMatchIds.push(saved.matchId);
  }

  const poolSaved = new Map(
    snapshot.matchSnapshots.filter(s => s.status !== 'tableau').map(s => [s.matchId, s])
  );
  const restoreFencer = <T extends { id: string } | null>(f: T): T =>
    f && f.id === fencerId ? ({ ...f, status, exclusionReason: null } as T) : f;
  const pools = state.pools.map(pool => {
    const hasFencer =
      pool.fencers.some(f => f.id === fencerId) || pool.matches.some(m => touches(m, fencerId));
    if (!hasFencer) return pool;
    const matches = pool.matches.map(m => {
      if (!touches(m, fencerId)) return m;
      const saved = poolSaved.get(m.id);
      const base = { ...m, fencerA: restoreFencer(m.fencerA), fencerB: restoreFencer(m.fencerB) };
      if (!saved) return base;
      restoredMatchIds.push(m.id);
      return {
        ...base,
        status: saved.status as MatchStatus,
        scoreA: saved.scoreA as Score | null,
        scoreB: saved.scoreB as Score | null,
        updatedAt: input.now,
      };
    });
    const restored: Pool = {
      ...pool,
      fencers: pool.fencers.map(f => restoreFencer(f)),
      matches,
      updatedAt: input.now,
    };
    restored.ranking = computePoolRankingFor(restored, state.isLaserSabre);
    restored.isComplete = matches.every(m => m.status === MatchStatus.FINISHED);
    return restored;
  });

  return { ok: true, status, pools, tableau, consolation, restoredMatchIds };
}
