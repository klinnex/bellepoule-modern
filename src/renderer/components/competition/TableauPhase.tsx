/**
 * BellePoule Modern - Phase « Tableau » de la compétition (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import type { TableauViewProps } from '../tableau/tableauViewShared';
import React, { Suspense } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Referee } from '../../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { specialStatusPatch } from '../../../shared/utils/forfeit';
import type { PoolRanking, Weapon } from '../../../shared/types';
import type { Phase } from '../../hooks/useCompetitionSession';
import type { useFencerManagement } from '../../hooks/useFencerManagement';
import { useTranslation } from '../../hooks/useTranslation';
import { useConfirm } from '../ConfirmDialog';
import { TableSkeleton } from '../Skeleton';
import type {
  ConsolationBracket,
  FinalResult,
  TableauMatch,
} from '../../../shared/domain/tableau/tableauTypes';
import { SplitGroupTabs } from './SplitGroupTabs';
import { TableauDriftBanner } from '../tableau/TableauDriftBanner';
import type { PoolCorrectionImpact } from '../../../shared/utils/poolCorrectionImpact';

const TableauView = React.lazy(() => import('../TableauView'));

interface TableauPhaseProps {
  competitionId: string;
  weapon?: Weapon;
  postPoolSplitCriteria: string | undefined;
  activeSplitGroup: string | null;
  splitGroups: string[];
  onSwitchSplitGroup: (group: string) => void;
  ranking: PoolRanking[];
  tableauMatches: TableauMatch[];
  setTableauMatches: Dispatch<SetStateAction<TableauMatch[]>>;
  consolationBrackets: ConsolationBracket[];
  setConsolationBrackets: Dispatch<SetStateAction<ConsolationBracket[]>>;
  finalResults: FinalResult[];
  setFinalResults: Dispatch<SetStateAction<FinalResult[]>>;
  setTableauEditUnlocked: Dispatch<SetStateAction<boolean>>;
  setCurrentPhase: Dispatch<SetStateAction<Phase>>;
  tableMaxScore: number;
  thirdPlaceMatch: boolean;
  playAllPositions: boolean;
  remoteArenaCount: number;
  remoteStripStart: number;
  isRemoteActive: boolean;
  maxRefereesPerMatch: number;
  autoFillReferees: Referee[] | undefined;
  tieBreakByVictory: boolean;
  updateFencer: ReturnType<typeof useFencerManagement>['updateFencer'];
  /** Écart cumulé entre le tableau tiré et le classement corrigé (#1996) */
  tableauDrift?: PoolCorrectionImpact | null;
  onRebuildTableau?: () => void;
  /** Score par la commande recordScore (#1980) */
  onRecordScore?: TableauViewProps['onRecordScore'];
}

const TableauPhase: React.FC<TableauPhaseProps> = ({
  competitionId,
  weapon,
  postPoolSplitCriteria,
  activeSplitGroup,
  splitGroups,
  onSwitchSplitGroup,
  ranking,
  tableauMatches,
  setTableauMatches,
  consolationBrackets,
  setConsolationBrackets,
  finalResults,
  setFinalResults,
  setTableauEditUnlocked,
  setCurrentPhase,
  tableMaxScore,
  thirdPlaceMatch,
  playAllPositions,
  remoteArenaCount,
  remoteStripStart,
  isRemoteActive,
  maxRefereesPerMatch,
  autoFillReferees,
  tieBreakByVictory,
  updateFencer,
  tableauDrift,
  onRebuildTableau,
  onRecordScore,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  return (
    <Suspense fallback={<TableSkeleton label={t('competitionView.loading_tableau')} />}>
      {/* Sélecteur de groupe pour compétition couplée */}
      {postPoolSplitCriteria && activeSplitGroup && splitGroups.length > 1 && (
        <SplitGroupTabs
          groups={splitGroups}
          active={activeSplitGroup}
          onSelect={onSwitchSplitGroup}
        />
      )}
      {tableauDrift && onRebuildTableau && (
        <TableauDriftBanner drift={tableauDrift} onRebuild={onRebuildTableau} />
      )}
      {finalResults.length > 0 && (
        <div className="tableau-phase-1">
          <span>{t('competitionView.readonly')}</span>
          <button
            onClick={async () => {
              if (await confirm(t('competitionView.edit_confirm'))) {
                setFinalResults([]);
              }
            }}
            className="tableau-phase-2"
          >
            {t('competitionView.edit_tableau')}
          </button>
        </div>
      )}
      <TableauView
        ranking={ranking}
        matches={tableauMatches}
        onMatchesChange={setTableauMatches}
        consolationBrackets={consolationBrackets}
        onConsolationBracketsChange={setConsolationBrackets}
        maxScore={tableMaxScore === 0 ? 999 : tableMaxScore}
        thirdPlaceMatch={thirdPlaceMatch}
        playAllPositions={playAllPositions}
        arenaCount={remoteArenaCount}
        stripStart={remoteStripStart}
        readOnly={finalResults.length > 0}
        competitionId={competitionId}
        weapon={weapon}
        maxRefereesPerMatch={maxRefereesPerMatch}
        autoFillReferees={autoFillReferees}
        tieBreakByVictory={tieBreakByVictory}
        onRecordScore={onRecordScore}
        onBlackCard={id => updateFencer(id, specialStatusPatch('exclusion', true))}
        onComplete={results => {
          setFinalResults(results);
          setTableauEditUnlocked(false);
          setCurrentPhase('results');
        }}
        onMatchArenaChange={(matchId, oldArena, newArena, fencerAParam, fencerBParam) => {
          if (isRemoteActive) {
            const match = tableauMatches.find(m => m.id === matchId);
            window.electronAPI.remote.updateMatchArena(
              competitionId,
              matchId,
              oldArena,
              newArena,
              fencerAParam ?? match?.fencerA ?? null,
              fencerBParam ?? match?.fencerB ?? null
            );
          }
        }}
        onMatchRefereeChange={(matchId, refereeId) => {
          // updateMatch lève une erreur synchrone si l'ID n'est pas un UUID (ex. « 64-0 »)
          Promise.resolve()
            .then(() =>
              window.electronAPI.db.updateMatch(matchId, {
                refereeId: refereeId ?? undefined,
              })
            )
            .catch((e: unknown) =>
              logger.warn(
                LogCategory.DATABASE,
                'updateMatch (arbitre tableau) failed',
                e instanceof Error ? e : undefined
              )
            );
        }}
      />
    </Suspense>
  );
};

export default React.memo(TableauPhase);
