/**
 * BellePoule Modern - Paramètres → Documents → Économie d'encre
 * Réglage du poste : fonds retirés et textes en noir sur toute impression et tout PDF.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useToast } from './Toast';
import { HINT, BOLD, TOGGLE_LABEL } from './settingsModal.styles';

const api = () => window.electronAPI?.settings;

export const InkSavingSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void api()
      ?.get()
      .then(s => {
        if (alive) setEnabled(s.inkSaving === true);
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!api()) return null;

  const handleChange = async (checked: boolean) => {
    setEnabled(checked);
    try {
      const s = await api()!.update({ inkSaving: checked });
      setEnabled(s.inkSaving === true);
    } catch {
      setEnabled(!checked);
      showToast(t('settings.ink_saving_error'), 'error');
    }
  };

  return (
    <div className="form-group">
      <label style={BOLD}>{t('settings.ink_saving_title')}</label>
      <p style={HINT}>{t('settings.ink_saving_hint')}</p>
      <label className="u-row cursor-pointer">
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null}
          onChange={e => void handleChange(e.target.checked)}
        />
        <span style={TOGGLE_LABEL}>{t('settings.ink_saving_enable')}</span>
      </label>
    </div>
  );
};

export default InkSavingSettingsSection;
