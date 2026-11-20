/**
 * BellePoule Modern - Modales de planification et d'export de la compétition (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React, { Suspense } from 'react';
import type { Competition, Fencer, Pool, PoolRanking } from '../../../shared/types';
import type { ConsolationBracket, FinalResult, TableauMatch } from '../tableau/tableauTypes';
import type { Phase } from '../../hooks/useCompetitionSession';
import type { useExport } from '../../hooks/useExport';
import { useOperation } from '../common/OperationProgress';
import { useToast } from '../Toast';
import type { CompetitionModalFlags } from './modalFlags';

const PlanningAssistant = React.lazy(() => import('./PlanningAssistant'));
const ExportCenterModal = React.lazy(() => import('./ExportCenterModal'));
const FFEExportModal = React.lazy(() => import('../FFEExportModal'));

interface CompetitionExportModalsProps {
  modals: CompetitionModalFlags;
  competition: Competition;
  currentPhase: Phase;
  setCurrentPhase: (phase: Phase) => void;
  fencers: Fencer[];
  pools: Pool[];
  currentPoolRound: number;
  overallRanking: PoolRanking[];
  finalResults: FinalResult[];
  tableauMatches: TableauMatch[];
  consolationBrackets: ConsolationBracket[];
  arenaCount: number;
  isLaserSabre: boolean;
  exports: ReturnType<typeof useExport>;
  poolsRemoteInfo: Parameters<ReturnType<typeof useExport>['exportPoolsPDF']>[2];
}

const CompetitionExportModals: React.FC<CompetitionExportModalsProps> = ({
  modals,
  competition,
  currentPhase,
  setCurrentPhase,
  fencers,
  pools,
  currentPoolRound,
  overallRanking,
  finalResults,
  tableauMatches,
  consolationBrackets,
  arenaCount,
  isLaserSabre,
  exports,
  poolsRemoteInfo,
}) => {
  const { showToast, showActionableError } = useToast();
  const { runOperation } = useOperation();
  const {
    exportFencersList,
    exportPoolsPDF,
    printPoolsPDF,
    exportRanking,
    exportRankingExcelCSV,
    exportResults,
    exportResultsHTML,
    exportResultsXML,
    exportDetailedStats,
  } = exports;
  return (
    <>
      {modals.showPlanningAssistant && (
        <Suspense fallback={null}>
          <PlanningAssistant
            competition={competition}
            pools={pools}
            tableauBrackets={
              currentPhase === 'tableau'
                ? [tableauMatches, ...consolationBrackets.map(b => b.matches)]
                : undefined
            }
            suggestedArenaCount={arenaCount || Math.min(pools.length, 4) || 1}
            onClose={() => modals.setShowPlanningAssistant(false)}
          />
        </Suspense>
      )}

      {modals.showExportCenter && (
        <Suspense fallback={null}>
          <ExportCenterModal
            fencers={fencers}
            pools={pools}
            currentPoolRound={currentPoolRound}
            overallRanking={overallRanking}
            finalResults={finalResults}
            tableauMatchesCount={tableauMatches.length}
            isLaserSabre={isLaserSabre}
            onClose={() => modals.setShowExportCenter(false)}
            exportFencersList={exportFencersList}
            exportPoolsPDF={(p, round) => exportPoolsPDF(p, round, poolsRemoteInfo)}
            printPoolsPDF={(p, round) => printPoolsPDF(p, round, poolsRemoteInfo)}
            exportRanking={exportRanking}
            exportRankingExcelCSV={exportRankingExcelCSV}
            exportResults={exportResults}
            exportResultsHTML={exportResultsHTML}
            exportResultsXML={exportResultsXML}
            exportDetailedStats={exportDetailedStats}
            onGoToTableau={() => {
              setCurrentPhase('tableau');
              modals.setShowExportCenter(false);
            }}
            onGoToResults={() => {
              setCurrentPhase('results');
              modals.setShowExportCenter(false);
            }}
            onExportCompetition={
              window.electronAPI?.file?.exportCompetition
                ? () => {
                    const exporting = window.electronAPI.file.exportCompetition(competition.id);
                    void runOperation('export', () => exporting)
                      .then(r => r?.success && showToast('Compétition exportée', 'success'))
                      .catch(err => showActionableError('messages.export_competition_failed', err));
                  }
                : undefined
            }
            onExportFFE={() => {
              modals.setShowFFEExport(true);
              modals.setShowExportCenter(false);
            }}
          />
        </Suspense>
      )}

      {modals.showFFEExport && (
        <Suspense fallback={null}>
          <FFEExportModal ranking={overallRanking} onClose={() => modals.setShowFFEExport(false)} />
        </Suspense>
      )}
    </>
  );
};

export default React.memo(CompetitionExportModals);
