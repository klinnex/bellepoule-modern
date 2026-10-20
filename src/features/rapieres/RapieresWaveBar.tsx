/**
 * BellePoule Modern - Tournoi des rapières : pilotage des vagues (phase Poules) (#1118)
 * Le DT lance chaque vague (toutes les poules en même temps) une fois la précédente saisie,
 * et peut arrêter les vagues avant leur terme pour passer au classement.
 * Licensed under GPL-3.0
 */

import React from 'react';
import type { Pool } from '../../shared/types';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import { canLaunchNextWave, isWaveComplete, waveCount } from './rapieresCalculations';

interface RapieresWaveBarProps {
  pools: Pool[];
  launchedWave: number;
  wavesEnded: boolean;
  onLaunchWave: (wave: number) => void;
  onEndWaves: () => void;
  onResumeWaves: () => void;
  /** Imprime les feuilles de match de la vague active (même rendu que les feuilles du tableau) */
  onPrintWaveSheets?: () => void;
}

const RapieresWaveBar: React.FC<RapieresWaveBarProps> = ({
  pools,
  launchedWave,
  wavesEnded,
  onLaunchWave,
  onEndWaves,
  onResumeWaves,
  onPrintWaveSheets,
}) => {
  const { t } = useTranslation();
  const total = waveCount(pools);
  const next = launchedWave + 1;
  const canLaunch = canLaunchNextWave(pools, launchedWave);
  const allDone = launchedWave >= total && isWaveComplete(pools, launchedWave);

  return (
    <div
      className="card"
      role="region"
      aria-label={t('rapieres.waves')}
      style={{
        padding: '0.75rem 1rem',
        margin: '0 auto 1.5rem',
        maxWidth: '60rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        borderLeft: '4px solid #7c3aed',
      }}
    >
      <strong>
        {launchedWave === 0
          ? t('rapieres.no_wave')
          : t('rapieres.waves_progress', { current: String(launchedWave), total: String(total) })}
      </strong>
      {wavesEnded ? (
        <>
          <span className="text-muted">{t('rapieres.waves_ended')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onResumeWaves}>
            {t('rapieres.resume_waves')}
          </button>
        </>
      ) : (
        <>
          {launchedWave < total && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canLaunch}
              onClick={() => onLaunchWave(next)}
            >
              {t('rapieres.launch_wave', { n: String(next) })}
            </button>
          )}
          {launchedWave > 0 && launchedWave < total && !canLaunch && (
            <span className="text-muted">{t('rapieres.wave_incomplete')}</span>
          )}
          {allDone && <span className="text-muted">{t('rapieres.all_waves_done')}</span>}
          {launchedWave > 0 && onPrintWaveSheets && (
            <button type="button" className="btn btn-secondary" onClick={onPrintWaveSheets}>
              {t('rapieres.print_wave_sheets')}
            </button>
          )}
          {launchedWave > 0 && !allDone && (
            <button type="button" className="btn btn-warning" onClick={onEndWaves}>
              {t('rapieres.end_waves')}
            </button>
          )}
        </>
      )}
      {launchedWave > 0 && !wavesEnded && !allDone && (
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            gap: '0.4rem',
            alignItems: 'center',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '0.9rem',
              height: '0.9rem',
              borderRadius: '3px',
              border: '2px solid #7c3aed',
              background: 'rgba(124,58,237,0.18)',
            }}
          />
          <span className="text-muted">{t('rapieres.wave_legend')}</span>
        </span>
      )}
    </div>
  );
};

export default RapieresWaveBar;
