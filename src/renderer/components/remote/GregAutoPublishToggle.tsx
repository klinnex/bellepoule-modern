/**
 * BellePoule Modern - Bouton ON/OFF de publication GREG automatique (#1328)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface Props {
  on: boolean;
  onChange: (on: boolean) => void;
}

const GregAutoPublishToggle: React.FC<Props> = ({ on, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="rsm-greg-auto remote-score-manager">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`rsm-pill${on ? ' rsm-pill--on' : ''}`}
        onClick={() => onChange(!on)}
      >
        {on ? 'ON' : 'OFF'} · {t('exportCenter.greg_auto_title')}
      </button>
    </div>
  );
};

export default GregAutoPublishToggle;
