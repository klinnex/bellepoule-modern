/**
 * BellePoule Modern - Poules figées après le tirage du tableau, correction vérifiée (#1996)
 * Dès qu'un tableau existe, une poule ne se modifie plus qu'en mode correction : chaque
 * score passe par une mesure d'impact, puis « garder le tableau » ou « refaire le tableau ».
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Pool, PoolRanking } from '../../../shared/types';
import {
  applyScoreToPool,
  buildMatchScores,
  computeOverallRankingAllRoundsFor,
} from '../../../shared/utils/poolOrchestration';
import {
  arePoolsFrozenByTableau,
  computePoolCorrectionImpact,
  type PoolCorrectionImpact,
} from '../../../shared/utils/poolCorrectionImpact';
import type {
  ConsolationBracket,
  FinalResult,
  TableauMatch,
} from '../../components/tableau/tableauTypes';
import type { PoolTableauFreeze } from '../../components/pool/poolViewTypes';
import { PoolCorrectionDialog } from '../../components/pool/PoolCorrectionDialog';
import type { Phase } from '../useCompetitionSession';

type SpecialStatus = 'abandon' | 'forfait' | 'exclusion';

/** Score saisi dans une poule, dans l'ordre fencerA / fencerB du match */
export interface PoolScoreInput {
  scoreA: number;
  scoreB: number;
  winner?: 'A' | 'B';
  specialStatus?: SpecialStatus;
  priority?: 'A' | 'B';
}

interface Pending {
  poolIndex: number;
  matchIndex: number;
  input: PoolScoreInput;
  impact: PoolCorrectionImpact;
  winner: 'A' | 'B' | null;
  apply: (reason?: string) => void;
}

interface UsePoolCorrectionParams {
  pools: Pool[];
  poolHistory: Pool[][];
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatch[];
  consolationBrackets: ConsolationBracket[];
  /** Tableaux des groupes de répartition (formule à groupes) */
  splitTableauStates?: Record<string, { matches: TableauMatch[] } | undefined>;
  isLaserSabre: boolean;
  setTableauMatches: Dispatch<SetStateAction<TableauMatch[]>>;
  setConsolationBrackets: Dispatch<SetStateAction<ConsolationBracket[]>>;
  setFinalResults: Dispatch<SetStateAction<FinalResult[]>>;
  setCurrentPhase: (phase: Phase) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function usePoolCorrection({
  pools,
  poolHistory,
  overallRanking,
  tableauMatches,
  consolationBrackets,
  splitTableauStates,
  isLaserSabre,
  setTableauMatches,
  setConsolationBrackets,
  setFinalResults,
  setCurrentPhase,
  showToast,
  t,
}: UsePoolCorrectionParams) {
  const consolationMatches = useMemo(
    () => consolationBrackets.flatMap(b => b.matches),
    [consolationBrackets]
  );
  const splitMatchCount = Object.values(splitTableauStates ?? {}).reduce(
    (n, s) => n + (s?.matches.length ?? 0),
    0
  );
  const frozen = arePoolsFrozenByTableau(
    tableauMatches,
    consolationMatches.length + splitMatchCount
  );

  const [correctingPoolId, setCorrectingPoolId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  // Tableau effacé (refait, ou retour en arrière) : plus de mode correction
  useEffect(() => {
    if (!frozen) setCorrectingPoolId(null);
  }, [frozen]);

  const freezeFor = useCallback(
    (poolId: string): PoolTableauFreeze | undefined =>
      frozen
        ? {
            correcting: correctingPoolId === poolId,
            onStartCorrection: () => setCorrectingPoolId(poolId),
            onEndCorrection: () => setCorrectingPoolId(null),
          }
        : undefined,
    [frozen, correctingPoolId]
  );

  /**
   * Score de poule : appliqué tel quel sans tableau ; sinon mesure d'impact et décision.
   * `apply(reason)` enregistre le score (motif inscrit au journal des scores).
   */
  const requestScore = useCallback(
    (
      poolIndex: number,
      matchIndex: number,
      input: PoolScoreInput,
      apply: (reason?: string) => void
    ) => {
      if (!frozen) {
        apply();
        return;
      }
      if (input.specialStatus) {
        showToast(t('poolCorrection.special_refused'), 'error');
        return;
      }
      const pool = pools[poolIndex];
      if (!pool?.matches[matchIndex]) return;
      const corrected = applyScoreToPool(
        pool,
        matchIndex,
        buildMatchScores(input.scoreA, input.scoreB, input.winner, undefined, input.priority),
        isLaserSabre
      );
      const nextPools = pools.map((p, i) => (i === poolIndex ? corrected : p));
      const before =
        overallRanking.length > 0
          ? overallRanking
          : computeOverallRankingAllRoundsFor(pools, poolHistory, isLaserSabre);
      const after = computeOverallRankingAllRoundsFor(nextPools, poolHistory, isLaserSabre);
      const impact = computePoolCorrectionImpact({
        before,
        after,
        tableauMatches,
        consolationMatches,
      });
      const m = corrected.matches[matchIndex];
      const winner = m.scoreA?.isVictory ? 'A' : m.scoreB?.isVictory ? 'B' : null;
      setPending({ poolIndex, matchIndex, input, impact, winner, apply });
    },
    [
      frozen,
      pools,
      poolHistory,
      overallRanking,
      tableauMatches,
      consolationMatches,
      isLaserSabre,
      showToast,
      t,
    ]
  );

  const keepTableau = () => {
    if (!pending) return;
    pending.apply(
      t(pending.impact.tableauOutdated ? 'poolCorrection.reason_keep' : 'poolCorrection.reason_ok')
    );
    showToast(
      t(
        pending.impact.tableauOutdated ? 'poolCorrection.applied_keep' : 'poolCorrection.applied_ok'
      ),
      pending.impact.tableauOutdated ? 'warning' : 'success'
    );
    setPending(null);
  };

  const rebuildTableau = () => {
    if (!pending) return;
    pending.apply(t('poolCorrection.reason_rebuild'));
    // Tableau retiré sur le classement corrigé à l'ouverture de l'onglet Tableau
    setTableauMatches([]);
    setConsolationBrackets([]);
    setFinalResults([]);
    setCorrectingPoolId(null);
    setPending(null);
    showToast(t('poolCorrection.applied_rebuild'), 'warning');
    setCurrentPhase('tableau');
  };

  const pendingPool = pending ? pools[pending.poolIndex] : undefined;
  const pendingMatch = pendingPool?.matches[pending?.matchIndex ?? -1];
  const dialog =
    pending && pendingPool && pendingMatch ? (
      <PoolCorrectionDialog
        poolNumber={pendingPool.number}
        match={pendingMatch}
        next={{
          scoreA: pending.input.scoreA,
          scoreB: pending.input.scoreB,
          winner: pending.winner,
        }}
        impact={pending.impact}
        onCancel={() => setPending(null)}
        onKeepTableau={keepTableau}
        onRebuildTableau={rebuildTableau}
      />
    ) : null;

  return { poolsFrozen: frozen, freezeFor, requestScore, poolCorrectionDialog: dialog };
}
