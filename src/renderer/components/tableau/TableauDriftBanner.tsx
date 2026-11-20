/**
 * BellePoule Modern - Tableau non conforme au classement corrigé (#1996)
 * Après une ou plusieurs corrections de poule gardées, le tableau tiré ne correspond plus
 * au classement : bandeau persistant et reconstruction en une fois (accord du DT).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { TriangleAlert } from 'lucide-react';
import type { PoolCorrectionImpact } from '../../../shared/utils/poolCorrectionImpact';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import { TableauDriftList } from '../pool/PoolCorrectionDialog';
import { useTranslation } from '../../hooks/useTranslation';

/** Le bandeau reste compact au-dessus du tableau (128 tireurs et plus) */
const MAX_BANNER_SEEDS = 6;

interface TableauDriftBannerProps {
  drift: PoolCorrectionImpact;
  onRebuild: () => void;
}

export const TableauDriftBanner: React.FC<TableauDriftBannerProps> = ({ drift, onRebuild }) => {
  const { t } = useTranslation();
  return (
    <div className="pool-correction-warn tableau-drift" role="alert" data-testid="tableau-drift">
      <p>
        <Icon icon={TriangleAlert} /> <strong>{t('poolCorrection.drift_title')}</strong>
      </p>
      <TableauDriftList impact={drift} maxSeeds={MAX_BANNER_SEEDS} />
      <p className="tableau-drift-actions">
        <span>{t('poolCorrection.drift_hint')}</span>
        <Button variant="danger" onClick={onRebuild} data-testid="tableau-drift-rebuild">
          {t('poolCorrection.rebuild_only')}
        </Button>
      </p>
    </div>
  );
};
