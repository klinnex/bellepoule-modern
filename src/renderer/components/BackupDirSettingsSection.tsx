/**
 * BellePoule Modern - Paramètres → Sauvegarde → Dossier de sauvegarde
 * Licensed under GPL-3.0
 *
 * Dossier des sauvegardes automatiques et de « Enregistrer » (défaut : Documents/BellePoule).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { BackupDirDTO } from '../../shared/types/preload';
import { HINT, BOLD, SMALL_BTN } from './settingsModal.styles';
import { Button } from './common/Button';

const BackupDirSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<BackupDirDTO | null>(null);

  useEffect(() => {
    window.electronAPI?.backup
      ?.get?.()
      .then(setInfo)
      .catch(() => {
        // hors Electron (tests, navigateur) : section masquée
      });
  }, []);

  if (!info) return null;

  const choose = () => {
    void window.electronAPI.backup.chooseDir().then(setInfo);
  };
  const reset = () => {
    void window.electronAPI.backup.resetDir().then(setInfo);
  };

  return (
    <div className="form-group">
      <label style={BOLD}>{t('settings.backup_dir_title')}</label>
      <p style={HINT}>{t('settings.backup_dir_hint')}</p>
      <p style={HINT} data-testid="backup-dir-path">
        <code>{info.dir}</code>
        {info.isDefault && ` (${t('settings.backup_dir_default')})`}
      </p>
      <div className="u-row">
        <Button style={SMALL_BTN} onClick={choose}>
          {t('settings.backup_dir_choose')}
        </Button>
        {!info.isDefault && (
          <Button style={SMALL_BTN} onClick={reset}>
            {t('settings.backup_dir_reset')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default BackupDirSettingsSection;
