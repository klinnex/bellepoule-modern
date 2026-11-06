/**
 * BellePoule Modern - Bouton clignotant de l'en-tête quand une mise à jour est disponible.
 * Clic : réaffiche la bannière de mise à jour (même fermée).
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

/** Événement fenêtre écouté par UpdateNotification pour se réafficher. */
export const SHOW_UPDATE_EVENT = 'bp:show-update';

const UpdateMenuButton: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const off = window.electronAPI?.onUpdateAvailable?.(info => {
      if (info?.hasUpdate) setVersion(info.latestVersion);
    });
    return () => off?.();
  }, []);

  if (!version) return null;

  return (
    <button
      className="btn btn-primary btn-icon-label update-menu-button"
      onClick={() => window.dispatchEvent(new Event(SHOW_UPDATE_EVENT))}
      title={t('updateNotif.menuTitle', { version })}
      aria-label={t('updateNotif.menuTitle', { version })}
    >
      <Download size={15} />
      {t('updateNotif.menuButton')}
    </button>
  );
};

export default React.memo(UpdateMenuButton);
