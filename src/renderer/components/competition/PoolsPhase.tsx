/**
 * BellePoule Modern - Phase « Poules » de la compétition (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React, { Suspense } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Pool, Weapon } from '../../../shared/types';
import RapieresWaveBar from '../../../features/rapieres/RapieresWaveBar';
import { useTranslation } from '../../hooks/useTranslation';
import EmptyState from '../common/EmptyState';
import { PoolViewSkeleton } from '../Skeleton';
import { presetScale } from '../pool/WindowSizePresets';
import { PhaseEmptyIcon } from './phaseIcons';
import PoolsToolbar from './PoolsToolbar';
import SinglePoolNav from './SinglePoolNav';

const PoolView = React.lazy(() => import('../PoolView'));

type ToolbarProps = React.ComponentProps<typeof PoolsToolbar>;

interface PoolsPhaseProps {
  poolRoundSelector: React.ReactNode;
  /** Tour terminé consulté (lecture seule) ; null = tour courant */
  historyPools: Pool[] | null;
  pools: Pool[];
  weapon: Weapon;
  competitionId: string;
  competitionTitle: string;
  tieBreakByVictory: boolean;
  poolMaxScore: number;
  isLaserSabre: boolean;
  onBackToCheckin: () => void;
  renderPoolCard: (pool: Pool, poolIndex: number) => React.ReactNode;
  // Rapières
  isRapieres: boolean;
  launchedWave: number;
  wavesEnded: boolean;
  onLaunchWave: (wave: number) => void;
  onEndWaves: () => void | Promise<void>;
  onResumeWaves: () => void;
  onPrintWaveSheets: () => void;
  onPrintWaveRange: (from: number, to: number) => void | Promise<void>;
  // Affichage
  poolCardSize: ToolbarProps['poolCardSize'];
  onPoolCardSizeChange: ToolbarProps['onPoolCardSizeChange'];
  poolsViewMode: 'grid' | 'single';
  onPoolsViewModeChange: (mode: 'grid' | 'single') => void;
  singlePoolIndex: number;
  setSinglePoolIndex: Dispatch<SetStateAction<number>>;
  onPrintAll: () => void;
  onExportAll: () => void;
}

const PoolsPhase: React.FC<PoolsPhaseProps> = ({
  poolRoundSelector,
  historyPools,
  pools,
  weapon,
  competitionId,
  competitionTitle,
  tieBreakByVictory,
  poolMaxScore,
  isLaserSabre,
  onBackToCheckin,
  renderPoolCard,
  isRapieres,
  launchedWave,
  wavesEnded,
  onLaunchWave,
  onEndWaves,
  onResumeWaves,
  onPrintWaveSheets,
  onPrintWaveRange,
  poolCardSize,
  onPoolCardSizeChange,
  poolsViewMode,
  onPoolsViewModeChange,
  singlePoolIndex,
  setSinglePoolIndex,
  onPrintAll,
  onExportAll,
}) => {
  const { t } = useTranslation();
  return (
    <div className="content">
      {poolRoundSelector}
      {historyPools ? (
        <div
          style={{
            display: 'grid',
            gap: '2rem',
            width: '100%',
            boxSizing: 'border-box',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))',
          }}
        >
          <Suspense fallback={null}>
            {historyPools.map(pool => (
              <div key={pool.id} style={{ minWidth: 0, overflow: 'auto' }}>
                {/* Tour terminé : consultation seule */}
                <div inert>
                  <PoolView
                    pool={pool}
                    weapon={weapon}
                    tieBreakByVictory={tieBreakByVictory}
                    competitionName={competitionTitle}
                    maxScore={poolMaxScore}
                    competitionId={competitionId}
                    onScoreUpdate={() => {}}
                  />
                </div>
              </div>
            ))}
          </Suspense>
        </div>
      ) : pools.length === 0 ? (
        <EmptyState
          icon={<PhaseEmptyIcon />}
          title={t('competitionView.no_pools')}
          description={t('competitionView.no_pools_hint')}
          actionLabel={t('competitionView.back_checkin')}
          onAction={onBackToCheckin}
        />
      ) : (
        <>
          {isRapieres && (
            <RapieresWaveBar
              pools={pools}
              launchedWave={launchedWave}
              wavesEnded={wavesEnded}
              onLaunchWave={onLaunchWave}
              onEndWaves={onEndWaves}
              onResumeWaves={onResumeWaves}
              onPrintWaveSheets={onPrintWaveSheets}
              onPrintWaveRange={onPrintWaveRange}
            />
          )}
          <PoolsToolbar
            isLaserSabre={isLaserSabre}
            poolCardSize={poolCardSize}
            onPoolCardSizeChange={onPoolCardSizeChange}
            poolsViewMode={poolsViewMode}
            onPoolsViewModeChange={onPoolsViewModeChange}
            poolCount={pools.length}
            onPrintAll={onPrintAll}
            onExportAll={onExportAll}
          />
          {poolsViewMode === 'single' ? (
            <>
              <SinglePoolNav
                pools={pools}
                singlePoolIndex={singlePoolIndex}
                setSinglePoolIndex={setSinglePoolIndex}
              />
              {/* Largeur ajustée au contenu, plafonnée (#1502) ; la taille de carte agit comme un zoom (#1124) */}
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <div
                  className="pools-single-card"
                  style={{
                    maxWidth: `${100 / presetScale(poolCardSize)}%`,
                    zoom: presetScale(poolCardSize),
                  }}
                >
                  <Suspense fallback={null}>
                    {pools[singlePoolIndex] &&
                      renderPoolCard(pools[singlePoolIndex], singlePoolIndex)}
                  </Suspense>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: '2rem',
                width: '100%',
                boxSizing: 'border-box',
                gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.round(Math.max(480, 280 + (pools[0]?.fencers?.length ?? 6) * 38) * presetScale(poolCardSize))}px), 1fr))`,
              }}
            >
              <Suspense fallback={<PoolViewSkeleton />}>
                {pools.map((pool, poolIndex) => renderPoolCard(pool, poolIndex))}
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(PoolsPhase);
