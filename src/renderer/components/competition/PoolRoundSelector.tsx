/**
 * BellePoule Modern - Sélecteur de tour de poules (#1051) (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { CV_STYLES } from './competitionViewStyles';

interface PoolRoundSelectorProps {
  currentPoolRound: number;
  viewedPoolRound: number | null;
  onViewRound: (round: number | null) => void;
}

/** Visible dès qu'un tour est terminé ; `null` = tour courant. */
const PoolRoundSelector: React.FC<PoolRoundSelectorProps> = ({
  currentPoolRound,
  viewedPoolRound,
  onViewRound,
}) => {
  const { t } = useTranslation();
  return (
    <div style={CV_STYLES.roundSelector}>
      <label htmlFor="pool-round-select" className="pool-round-selector-1">
        {t('pools.round_select_label')}
      </label>
      <select
        id="pool-round-select"
        className="form-input pool-round-selector-2"
        value={viewedPoolRound ?? currentPoolRound}
        onChange={e => {
          const r = Number(e.target.value);
          onViewRound(r === currentPoolRound ? null : r);
        }}
      >
        {Array.from({ length: currentPoolRound }, (_, i) => i + 1).map(r => (
          <option key={r} value={r}>
            {t('pools.round_option', { n: r })}
            {r === currentPoolRound ? ` (${t('pools.round_current')})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
};

export default React.memo(PoolRoundSelector);
