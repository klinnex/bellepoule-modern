/**
 * BellePoule Modern - Modales d'analyse, de partage et d'affichage public (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React, { Suspense } from 'react';
import type { Competition, Fencer, Pool } from '../../../shared/types';
import type { TableauMatch } from '../tableau/tableauTypes';
import type { usePoolManagement } from '../../hooks/usePoolManagement';
import { QRCodeShare } from '../QRCodeShare';
import KioskScoreEntry from './KioskScoreEntry';
import type { CompetitionModalFlags } from './modalFlags';

const FencerComparison = React.lazy(() =>
  import('../FencerComparison').then(m => ({ default: m.FencerComparison }))
);
const AnalyticsDashboard = React.lazy(() =>
  import('../AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard }))
);
const SeasonRankingView = React.lazy(() =>
  import('../SeasonRankingView').then(m => ({ default: m.SeasonRankingView }))
);
const FFEConnectModal = React.lazy(() => import('../FFEConnectModal'));
const PresentationMode = React.lazy(() =>
  import('../PresentationMode').then(m => ({ default: m.PresentationMode }))
);
const KioskDisplay = React.lazy(() => import('../KioskDisplay'));

interface CompetitionSecondaryModalsProps {
  modals: CompetitionModalFlags;
  competition: Competition;
  fencers: Fencer[];
  pools: Pool[];
  tableauMatches: TableauMatch[];
  poolMaxScore: number;
  allPoolsComplete: boolean;
  updateScore: ReturnType<typeof usePoolManagement>['updateScore'];
  onImportFencers: (fencers: Partial<Fencer>[]) => Promise<void>;
  onKioskFinish: () => void;
}

const CompetitionSecondaryModals: React.FC<CompetitionSecondaryModalsProps> = ({
  modals,
  competition,
  fencers,
  pools,
  tableauMatches,
  poolMaxScore,
  allPoolsComplete,
  updateScore,
  onImportFencers,
  onKioskFinish,
}) => {
  return (
    <>
      {/* Nouveaux modals */}
      {modals.showFencerComparison && (
        <Suspense fallback={null}>
          <FencerComparison
            fencers={fencers}
            pools={pools}
            tableauMatches={tableauMatches}
            onClose={() => modals.setShowFencerComparison(false)}
          />
        </Suspense>
      )}

      {modals.showAnalytics && (
        <Suspense fallback={null}>
          <AnalyticsDashboard
            competition={competition}
            pools={pools}
            matches={pools.flatMap(p => p.matches ?? [])}
            fencers={fencers}
            onClose={() => modals.setShowAnalytics(false)}
          />
        </Suspense>
      )}

      {modals.showQRCode && (
        <QRCodeShare competition={competition} onClose={() => modals.setShowQRCode(false)} />
      )}

      {modals.showSeasonRanking && (
        <Suspense fallback={null}>
          <SeasonRankingView
            onClose={() => modals.setShowSeasonRanking(false)}
            availableCompetitions={[competition]}
            availablePoolsByComp={{ [competition.id]: pools }}
          />
        </Suspense>
      )}

      {modals.showFFEConnect && (
        <Suspense fallback={null}>
          <FFEConnectModal
            onImport={async imported => {
              await onImportFencers(imported);
              modals.setShowFFEConnect(false);
            }}
            onClose={() => modals.setShowFFEConnect(false)}
          />
        </Suspense>
      )}

      {/* Mode Présentation */}
      {modals.showPresentation && (
        <Suspense fallback={null}>
          <PresentationMode
            competition={competition}
            pools={pools}
            onClose={() => modals.setShowPresentation(false)}
          />
        </Suspense>
      )}

      {/* Mode Kiosk Public - Affichage grand écran */}
      {modals.showKioskDisplay && (
        <Suspense fallback={null}>
          <KioskDisplay
            competition={competition}
            pools={pools}
            weapon={competition.weapon}
            tableauMatches={tableauMatches}
            onClose={() => modals.setShowKioskDisplay(false)}
          />
        </Suspense>
      )}

      {/* Mode Kiosk - Interface tablette arbitre */}
      {modals.showKiosk && pools.length > 0 && (
        <KioskScoreEntry
          pools={pools}
          poolMaxScore={poolMaxScore}
          allPoolsComplete={allPoolsComplete}
          updateScore={updateScore}
          onClose={() => modals.setShowKiosk(false)}
          onFinish={onKioskFinish}
        />
      )}
    </>
  );
};

export default React.memo(CompetitionSecondaryModals);
