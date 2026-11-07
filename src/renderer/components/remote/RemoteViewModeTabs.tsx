/**
 * BellePoule Modern - Onglets Basique / Expert de la Saisie distante (#1414)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { RemoteViewMode } from './remoteViewMode';

interface Props {
  mode: RemoteViewMode;
  onChange: (mode: RemoteViewMode) => void;
}

const RemoteViewModeTabs: React.FC<Props> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="rsm-mode-tabs" role="tablist" aria-label={t('rsm.mode_tabs_label')}>
      {(['basic', 'expert'] as const).map(m => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          className={`rsm-mode-tab${mode === m ? ' rsm-mode-tab--active' : ''}`}
          onClick={() => onChange(m)}
        >
          {t(m === 'basic' ? 'rsm.mode_basic' : 'rsm.mode_expert')}
        </button>
      ))}
    </div>
  );
};

export default RemoteViewModeTabs;
