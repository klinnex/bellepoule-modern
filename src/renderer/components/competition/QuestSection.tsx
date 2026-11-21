/**
 * BellePoule Modern - Phase « Quest » (Sabre Laser) de la compétition (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React, { Suspense } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Fencer, PoolRanking, QuestPhaseConfig, Weapon } from '../../../shared/types';
import type { Phase } from '../../hooks/useCompetitionSession';
import { CV_STYLES } from './competitionViewStyles';

const QuestPhaseView = React.lazy(() => import('../QuestPhaseView'));

interface QuestSectionProps {
  /** Vrai quand l'onglet Quest est affiché (sinon monté mais masqué) */
  isActive: boolean;
  questConfig: QuestPhaseConfig;
  weapon: Weapon;
  poolMaxScore: number;
  getCheckedInFencers: () => Fencer[];
  overallRanking: PoolRanking[];
  setOverallRanking: Dispatch<SetStateAction<PoolRanking[]>>;
  /** Classement final de la Quest écrit par le moteur (adjustRanking, docs/adr/0017) */
  onRankingAdjust?: (ranking: PoolRanking[]) => Promise<'recorded' | 'local' | 'refused'>;
  setRankingValidated: Dispatch<SetStateAction<boolean>>;
  setCurrentPhase: Dispatch<SetStateAction<Phase>>;
  handleQuestConfigUpdate: (updates: Partial<QuestPhaseConfig>) => void | Promise<void>;
}

const QuestSection: React.FC<QuestSectionProps> = ({
  isActive,
  questConfig,
  weapon,
  poolMaxScore,
  getCheckedInFencers,
  overallRanking,
  setOverallRanking,
  onRankingAdjust,
  setRankingValidated,
  setCurrentPhase,
  handleQuestConfigUpdate,
}) => {
  return (
    <div style={isActive ? undefined : CV_STYLES.questWrapper}>
      <Suspense fallback={null}>
        <QuestPhaseView
          fencers={(() => {
            const checked = getCheckedInFencers();
            if (questConfig.hasPreliminaryPools && questConfig.qualifiersCount) {
              return overallRanking
                .slice(0, questConfig.qualifiersCount)
                .map(r => r.fencer)
                .filter(Boolean);
            }
            return checked;
          })()}
          questConfig={questConfig}
          competitionWeapon={weapon}
          maxScore={poolMaxScore}
          onQuestComplete={async ranking => {
            let final = ranking;
            if (questConfig.hasPreliminaryPools) {
              // Fusionner qualifiés re-classés par quest + non-qualifiés du classement poules
              const questFencerIds = new Set(ranking.map(r => r.fencer?.id).filter(Boolean));
              const nonQualifiers = overallRanking
                .filter(r => !questFencerIds.has(r.fencer?.id))
                .map((r, i) => ({ ...r, rank: ranking.length + i + 1 }));
              final = [...ranking, ...nonQualifiers];
            }
            const outcome = onRankingAdjust ? await onRankingAdjust(final) : 'local';
            if (outcome === 'refused') return;
            if (outcome === 'local') setOverallRanking(final);
            setRankingValidated(true);
            setCurrentPhase('ranking');
          }}
          onConfigUpdate={handleQuestConfigUpdate}
        />
      </Suspense>
    </div>
  );
};

export default React.memo(QuestSection);
