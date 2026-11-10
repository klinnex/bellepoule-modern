/**
 * BellePoule Modern - Phase « Classement » de la compétition (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { Fencer, Pool, PoolRanking, Weapon } from '../../../shared/types';
import RapieresRankingPanel from '../../../features/rapieres/RapieresRankingPanel';
import type { RapieresTeamStats } from '../../../features/rapieres/RapieresRankingPanel';
import type { RapieresTeamInfo } from '../../../features/rapieres/rapieres.types';
import { rapieresPoolNumbers } from '../../../features/rapieres/rapieresCalculations';
import PoolRankingView from '../PoolRankingView';

type RankingViewProps = React.ComponentProps<typeof PoolRankingView>;

interface RankingPhaseProps {
  poolRoundSelector: React.ReactNode;
  /** Tour terminé consulté (lecture seule) ; null = tour courant */
  viewedPoolRound: number | null;
  viewedRoundPools: Pool[] | null;
  computeOverallRanking: (pools: Pool[]) => PoolRanking[];
  pools: Pool[];
  overallRanking: PoolRanking[];
  fencers: Fencer[];
  weapon: Weapon;
  competitionTitle: string;
  hasDirectElimination: boolean;
  skipPoolPhase: boolean;
  poolWinnersOnly: boolean;
  postPoolSplitCriteria: RankingViewProps['splitCriteria'];
  splitOffCompetitionIds: RankingViewProps['splitOffGroups'];
  onGoToTableau: RankingViewProps['onGoToTableau'];
  onGoToResults: () => void;
  onPoolsChange: RankingViewProps['onPoolsChange'];
  onRankingChange: (ranking: PoolRanking[]) => void;
  onSplitOff: RankingViewProps['onSplitOff'];
  nextRoundAction: RankingViewProps['nextRoundAction'];
  // Rapières
  isRapieres: boolean;
  launchedWave: number;
  rapieresTeams: Record<string, RapieresTeamInfo>;
  rapieresStats: Map<string, RapieresTeamStats>;
}

const RankingPhase: React.FC<RankingPhaseProps> = ({
  poolRoundSelector,
  viewedPoolRound,
  viewedRoundPools,
  computeOverallRanking,
  pools,
  overallRanking,
  fencers,
  weapon,
  competitionTitle,
  hasDirectElimination,
  skipPoolPhase,
  poolWinnersOnly,
  postPoolSplitCriteria,
  splitOffCompetitionIds,
  onGoToTableau,
  onGoToResults,
  onPoolsChange,
  onRankingChange,
  onSplitOff,
  nextRoundAction,
  isRapieres,
  launchedWave,
  rapieresTeams,
  rapieresStats,
}) => (
  <>
    {poolRoundSelector}
    {viewedRoundPools && (
      <PoolRankingView
        key={`round-${viewedPoolRound}`}
        pools={viewedRoundPools}
        ranking={computeOverallRanking(viewedRoundPools)}
        weapon={weapon}
        hasDirectElimination={hasDirectElimination}
        rapieres={isRapieres}
      />
    )}
    {!viewedRoundPools && (
      <PoolRankingView
        pools={pools}
        ranking={overallRanking}
        weapon={weapon}
        hasDirectElimination={hasDirectElimination}
        isInitialRanking={skipPoolPhase}
        rapieres={isRapieres}
        onGoToTableau={onGoToTableau}
        onGoToResults={onGoToResults}
        onPoolsChange={onPoolsChange}
        onRankingChange={onRankingChange}
        poolWinnersOnly={poolWinnersOnly}
        splitCriteria={postPoolSplitCriteria}
        splitOffGroups={splitOffCompetitionIds}
        onSplitOff={onSplitOff}
        nextRoundAction={nextRoundAction}
      />
    )}
    {isRapieres && !viewedRoundPools && (
      <RapieresRankingPanel
        competitionTitle={competitionTitle}
        wave={launchedWave}
        ranked={overallRanking.map(r => ({ teamId: r.fencer.id, rank: r.rank }))}
        fencers={fencers}
        teams={rapieresTeams}
        stats={rapieresStats}
        poolOf={rapieresPoolNumbers(pools)}
      />
    )}
  </>
);

export default React.memo(RankingPhase);
