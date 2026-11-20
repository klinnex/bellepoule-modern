/**
 * BellePoule Modern - Carte de poule de la phase Poules (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Fencer, Pool, Referee, Weapon } from '../../../shared/types';
import type { Arena } from '../../../shared/types/remote';
import { specialStatusPatch } from '../../../shared/utils/forfeit';
import type { useFencerManagement } from '../../hooks/useFencerManagement';
import type { usePoolManagement } from '../../hooks/usePoolManagement';
import type { usePoolStripChange } from '../../hooks/usePoolStripChange';
import type { buildStripQrs } from '../../hooks/useExport';
import { presetScale } from '../pool/WindowSizePresets';
import type { PoolTableauFreeze } from '../pool/poolViewTypes';
import type { usePoolCorrection } from '../../hooks/competitionView/usePoolCorrection';

const PoolView = React.lazy(() => import('../PoolView'));

type PoolManagement = ReturnType<typeof usePoolManagement>;

export interface CompetitionPoolCardProps {
  pool: Pool;
  poolIndex: number;
  weapon: Weapon;
  competitionId: string;
  competitionTitle: string;
  tieBreakByVictory: boolean;
  poolMaxScore: number;
  maxRefereesPerPool: number;
  updateScore: PoolManagement['updateScore'];
  resetMatch: PoolManagement['resetMatch'];
  cancelMatch: PoolManagement['cancelMatch'];
  handleFencerForfeit: PoolManagement['handleFencerForfeit'];
  computePoolRanking: PoolManagement['computePoolRanking'];
  setPools: Dispatch<SetStateAction<Pool[]>>;
  updateFencer: ReturnType<typeof useFencerManagement>['updateFencer'];
  fireWebhookNotif: (title: string, body: string) => void;
  assignedPoolFencerIds: Set<string>;
  remoteStripStart: number;
  remoteArenaCount: number;
  onStripChange: ReturnType<typeof usePoolStripChange>;
  arenaStates: Arena[];
  isRemoteActive: boolean;
  remoteServerUrl: string | null;
  poolCardSize: Parameters<typeof presetScale>[0];
  stripQrs: ReturnType<typeof buildStripQrs>;
  autoFillReferees: Referee[] | undefined;
  onAutoFillReferees: (assignments: Map<string, Referee>) => void;
  onRefereeAssigned: (poolId: string, poolReferees: Referee[]) => void;
  waveMatchIds: Set<string> | undefined;
  categoryOf?: (fencer: Fencer) => string;
  /** Tableau tiré : poule figée, correction explicite (#1996) */
  tableauFreeze?: PoolTableauFreeze;
  /** Score de poule : appliqué tel quel sans tableau, sinon mesure d'impact (#1996) */
  requestScore?: ReturnType<typeof usePoolCorrection>['requestScore'];
}

const CompetitionPoolCard: React.FC<CompetitionPoolCardProps> = ({
  pool,
  poolIndex,
  weapon,
  competitionId,
  competitionTitle,
  tieBreakByVictory,
  poolMaxScore,
  maxRefereesPerPool,
  updateScore,
  resetMatch,
  cancelMatch,
  handleFencerForfeit,
  computePoolRanking,
  setPools,
  updateFencer,
  fireWebhookNotif,
  assignedPoolFencerIds,
  remoteStripStart,
  remoteArenaCount,
  onStripChange,
  arenaStates,
  isRemoteActive,
  remoteServerUrl,
  poolCardSize,
  stripQrs,
  autoFillReferees,
  onAutoFillReferees,
  onRefereeAssigned,
  waveMatchIds,
  categoryOf,
  tableauFreeze,
  requestScore,
}) => {
  // Tableau tiré : ni remise à zéro, ni abandon, ni ajout ou déplacement de tireur (#1996)
  const frozen = !!tableauFreeze;
  // Enregistrement du score (+ notification et tablette), après vérification éventuelle (#1996)
  const applyScore = (
    matchIndex: number,
    scoreA: number,
    scoreB: number,
    winner?: 'A' | 'B',
    specialStatus?: 'abandon' | 'forfait' | 'exclusion',
    priority?: 'A' | 'B',
    correction?: string
  ) => {
    updateScore(poolIndex, matchIndex, scoreA, scoreB, winner, specialStatus, priority, correction);
    if (winner) {
      const m = pool.matches[matchIndex];
      const nameA = m?.fencerA ? `${m.fencerA.lastName}` : 'A';
      const nameB = m?.fencerB ? `${m.fencerB.lastName}` : 'B';
      fireWebhookNotif(
        `Match terminé — ${competitionTitle}`,
        `${nameA} ${scoreA} – ${scoreB} ${nameB} (Poule ${pool.number})`
      );
    }
    if (isRemoteActive && competitionId) {
      const match = pool.matches[matchIndex];
      if (match) {
        window.electronAPI.remote
          .finishPoolMatch(competitionId, match.id, scoreA, scoreB, winner, specialStatus)
          .catch(() => {});
      }
    }
  };

  return (
    <div className="competition-pool-card-1">
      <PoolView
        pool={pool}
        weapon={weapon}
        tieBreakByVictory={tieBreakByVictory}
        competitionName={competitionTitle}
        maxScore={poolMaxScore}
        competitionId={competitionId}
        maxRefereesPerPool={maxRefereesPerPool}
        tableauFreeze={tableauFreeze}
        onScoreUpdate={(matchIndex, scoreA, scoreB, winner, specialStatus, priority) => {
          const apply = (correction?: string) =>
            applyScore(matchIndex, scoreA, scoreB, winner, specialStatus, priority, correction);
          if (requestScore) {
            requestScore(
              poolIndex,
              matchIndex,
              { scoreA, scoreB, winner, specialStatus, priority },
              apply
            );
          } else {
            apply();
          }
        }}
        onMatchReset={
          frozen
            ? undefined
            : matchIndex => {
                const match = pool.matches[matchIndex];
                if (!match) return;
                resetMatch(poolIndex, matchIndex);
                if (competitionId) {
                  window.electronAPI.remote.resetPoolMatch(competitionId, match.id).catch(() => {});
                }
              }
        }
        onMatchCancel={
          frozen
            ? undefined
            : matchIndex => {
                const match = pool.matches[matchIndex];
                if (!match) return;
                cancelMatch(poolIndex, matchIndex);
                if (competitionId) {
                  window.electronAPI.remote.resetPoolMatch(competitionId, match.id).catch(() => {});
                }
              }
        }
        onFencerStatusChange={
          frozen
            ? undefined
            : (fencerId, status, blackCard) => {
                if (status === 'abandon' || status === 'forfait' || status === 'exclusion') {
                  handleFencerForfeit(fencerId, status);
                  // Liste d'appel : statut aligné avec la saisie manuelle du score
                  updateFencer(fencerId, specialStatusPatch(status, blackCard));
                }
              }
        }
        assignedFencerIds={assignedPoolFencerIds}
        onFencerAdded={
          frozen
            ? undefined
            : updatedPool => {
                updatedPool.ranking = computePoolRanking(updatedPool);
                setPools(prev => prev.map(p => (p.id === updatedPool.id ? updatedPool : p)));
              }
        }
        stripRange={{ start: remoteStripStart, end: remoteArenaCount }}
        onStripChange={onStripChange}
        arenas={arenaStates}
        isRemoteActive={isRemoteActive}
        remoteServerUrl={remoteServerUrl ?? undefined}
        cardScale={presetScale(poolCardSize)}
        stripQr={stripQrs?.[pool.id]}
        onMatchArenaChange={(matchId, oldArena, newArena, fencerA, fencerB) => {
          if (!isRemoteActive || !competitionId) return;
          window.electronAPI.remote
            .updateMatchArena(
              competitionId,
              matchId,
              oldArena,
              newArena,
              fencerA ?? undefined,
              fencerB ?? undefined
            )
            .catch(() => {});
        }}
        autoFillReferees={autoFillReferees}
        onAutoFillReferees={onAutoFillReferees}
        onRefereeAssigned={onRefereeAssigned}
        waveMatchIds={waveMatchIds}
        categoryOf={categoryOf}
      />
    </div>
  );
};

export default React.memo(CompetitionPoolCard);
