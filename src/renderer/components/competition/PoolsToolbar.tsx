/**
 * BellePoule Modern - Barre d'outils de la vue Poules (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { Button } from '../common/Button';
import GlobalPoolColumnsMenu from '../pool/GlobalPoolColumnsMenu';
import WindowSizePresets from '../pool/WindowSizePresets';
import { useTranslation } from '../../hooks/useTranslation';

interface PoolsToolbarProps {
  isLaserSabre: boolean;
  poolCardSize: React.ComponentProps<typeof WindowSizePresets>['value'];
  onPoolCardSizeChange: React.ComponentProps<typeof WindowSizePresets>['onChange'];
  poolsViewMode: 'grid' | 'single';
  onPoolsViewModeChange: (mode: 'grid' | 'single') => void;
  poolCount: number;
  onPrintAll: () => void;
  onExportAll: () => void;
}

const PoolsToolbar: React.FC<PoolsToolbarProps> = ({
  isLaserSabre,
  poolCardSize,
  onPoolCardSizeChange,
  poolsViewMode,
  onPoolsViewModeChange,
  poolCount,
  onPrintAll,
  onExportAll,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '2rem',
      }}
    >
      <GlobalPoolColumnsMenu isLaserSabre={isLaserSabre} />
      <WindowSizePresets value={poolCardSize} onChange={onPoolCardSizeChange} />
      <select
        className="form-input"
        style={{ width: 'auto', fontWeight: 600 }}
        value={poolsViewMode}
        onChange={e => onPoolsViewModeChange(e.target.value as 'grid' | 'single')}
        title={t('competitionView.pools_mode')}
        aria-label={t('competitionView.pools_mode')}
      >
        <option value="grid">{t('competitionView.grid_view')}</option>
        <option value="single">{t('competitionView.single_view')}</option>
      </select>
      <Button variant="primary" onClick={onPrintAll} title={t('competitionView.print_title')}>
        {t('competitionView.print')}
      </Button>
      {poolCount > 1 && (
        <Button variant="success" onClick={onExportAll}>
          {t('competitionView.export_all')}
        </Button>
      )}
    </div>
  );
};

export default React.memo(PoolsToolbar);
