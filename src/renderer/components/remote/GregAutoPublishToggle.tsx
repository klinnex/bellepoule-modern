/**
 * BellePoule Modern - Bouton ON/OFF de publication GREG automatique (#1328)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useGregAutoPublish } from '../../hooks/useGregAutoPublish';

interface Props {
  on: boolean;
  onChange: (on: boolean) => void;
}

const GregAutoPublishToggle: React.FC<Props> = ({ on, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="rsm-greg-auto">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`rsm-pill${on ? ' rsm-pill--on' : ''}`}
        onClick={() => onChange(!on)}
      >
        {on ? 'ON' : 'OFF'} · {t('exportCenter.greg_auto_title')}
      </button>
      <small>{t('exportCenter.greg_auto_desc')}</small>
    </div>
  );
};

/** Bouton + minuteur : `publish` est appelé tout de suite puis toutes les 15 s tant que ON. */
export const GregAutoPublish: React.FC<{ publish: () => void }> = ({ publish }) => {
  const [on, setOn] = useGregAutoPublish(publish);
  return <GregAutoPublishToggle on={on} onChange={setOn} />;
};

export default GregAutoPublishToggle;
