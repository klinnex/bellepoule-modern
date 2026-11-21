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
} from '../../../shared/domain/tableau/tableauTypes';
import type { PoolTableauFreeze } from '../../components/pool/poolViewTypes';
import { PoolCorrectionDialog } from '../../components/pool/PoolCorrectionDialog';
import { logger, LogCategory } from '@shared/services/logger';
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
  /** Absent : tableau refait sans nouvelle correction (corrections cumulées) */
  score?: {
    poolIndex: number;
    matchIndex: number;
    input: PoolScoreInput;
    winner: 'A' | 'B' | null;
    /** Rend l'issue de la commande (recordScore avec correction, docs/adr/0017) */
    apply: (reason?: string, rebuildTableau?: boolean) => unknown;
  };
  impact: PoolCorrectionImpact;
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

  /**
   * Écart cumulé entre le tableau tiré et le classement courant : plusieurs corrections
   * gardées peuvent rendre le tableau non conforme ; il se refait ensuite en une fois.
   */
  const tableauDrift = useMemo(() => {
    if (tableauMatches.length === 0) return null;
    const impact = computePoolCorrectionImpact({
      before: overallRanking,
      after: overallRanking,
      tableauMatches,
      consolationMatches,
    });
    return impact.tableauOutdated ? impact : null;
  }, [overallRanking, tableauMatches, consolationMatches]);

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
      apply: (reason?: string, rebuildTableau?: boolean) => unknown
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
      setPending({ score: { poolIndex, matchIndex, input, winner, apply }, impact });
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

  const keepTableau = async () => {
    if (!pending?.score) return;
    const outcome = await pending.score.apply(
      t(pending.impact.tableauOutdated ? 'poolCorrection.reason_keep' : 'poolCorrection.reason_ok')
    );
    if (outcome === 'refused') return;
    showToast(
      t(
        pending.impact.tableauOutdated ? 'poolCorrection.applied_keep' : 'poolCorrection.applied_ok'
      ),
      pending.impact.tableauOutdated ? 'warning' : 'success'
    );
    setPending(null);
  };

  /** Refaire le tableau sur le classement courant, sans nouvelle correction */
  const requestRebuild = useCallback(() => {
    if (tableauDrift) setPending({ impact: tableauDrift });
  }, [tableauDrift]);

  const rebuildTableau = async () => {
    if (!pending) return;
    let engineCleared = false;
    if (pending.score) {
      // Correction et tableau retiré en une commande (recordScore, docs/adr/0017)
      const outcome = await pending.score.apply(t('poolCorrection.reason_rebuild'), true);
      if (outcome === 'refused') return;
      engineCleared = outcome === 'recorded';
    } else
      logger.info(
        LogCategory.BUSINESS,
        'Tableau refait après corrections de poule cumulées (#1996)'
      );
    // Tableau retiré sur le classement corrigé à l'ouverture de l'onglet Tableau (par le
    // moteur avec la correction, sinon à l'écran)
    if (!engineCleared) {
      setTableauMatches([]);
      setConsolationBrackets([]);
      setFinalResults([]);
    }
    setCorrectingPoolId(null);
    setPending(null);
    showToast(
      t(pending.score ? 'poolCorrection.applied_rebuild' : 'poolCorrection.rebuilt'),
      'warning'
    );
    setCurrentPhase('tableau');
  };

  const score = pending?.score;
  const pendingPool = score ? pools[score.poolIndex] : undefined;
  const pendingMatch = score ? pendingPool?.matches[score.matchIndex] : undefined;
  const dialog =
    pending && (!score || (pendingPool && pendingMatch)) ? (
      <PoolCorrectionDialog
        correction={
          score && pendingPool && pendingMatch
            ? {
                poolNumber: pendingPool.number,
                match: pendingMatch,
                next: {
                  scoreA: score.input.scoreA,
                  scoreB: score.input.scoreB,
                  winner: score.winner,
                },
              }
            : undefined
        }
        impact={pending.impact}
        onCancel={() => setPending(null)}
        onKeepTableau={keepTableau}
        onRebuildTableau={rebuildTableau}
      />
    ) : null;

  return {
    poolsFrozen: frozen,
    freezeFor,
    requestScore,
    poolCorrectionDialog: dialog,
    tableauDrift,
    requestRebuild,
  };
}
