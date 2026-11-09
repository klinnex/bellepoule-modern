/**
 * BellePoule Modern - Bouton d'état des mises à jour dans l'en-tête.
 * « À jour » (clic : revérifier) / « Mise à jour dispo » clignotant (clic : bannière).
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import type { UpdateInfo } from '../../shared/types/preload';
import { Button } from './common/Button';

/** Événement fenêtre écouté par UpdateNotification pour se réafficher (detail : UpdateInfo). */
export const SHOW_UPDATE_EVENT = 'bp:show-update';

type Status = 'unknown' | 'checking' | 'uptodate' | 'available';

const UpdateMenuButton: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('unknown');
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  const check = useCallback(async () => {
    const updater = window.electronAPI?.updater;
    if (!updater?.check) return;
    setStatus('checking');
    try {
      const res = await updater.check();
      if (res?.hasUpdate) {
        setInfo(res);
        setStatus('available');
      } else setStatus(res ? 'uptodate' : 'unknown');
    } catch {
      setStatus('unknown');
    }
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    const off = api?.onUpdateAvailable?.(next => {
      if (!next?.hasUpdate) return;
      setInfo(next);
      setStatus('available');
    });
    // Vérification au lancement, sauf si l'utilisateur l'a désactivée (Préférences)
    void (async () => {
      const auto = await api?.updater?.getAutoCheck?.().catch(() => null);
      if (auto?.enabled !== false) await check();
    })();
    return () => off?.();
  }, [check]);

  if (!window.electronAPI?.updater) return null;

  if (status === 'available' && info) {
    const title = t('updateNotif.menuTitle', { version: info.latestVersion });
    return (
      <Button
        variant="primary"
        className="btn-icon-label update-menu-button"
        onClick={() => window.dispatchEvent(new CustomEvent(SHOW_UPDATE_EVENT, { detail: info }))}
        title={title}
        aria-label={title}
      >
        <Download size={15} />
        {t('updateNotif.menuButton')}
      </Button>
    );
  }

  const upToDate = status === 'uptodate';
  return (
    <Button
      className="btn-icon-label"
      onClick={() => void check()}
      disabled={status === 'checking'}
      aria-busy={status === 'checking'}
      title={upToDate ? t('updateNotif.menuUpToDateTitle') : t('updateNotif.menuCheck')}
    >
      {upToDate ? <CheckCircle2 size={15} /> : <RefreshCw size={15} />}
      {upToDate ? t('updateNotif.menuUpToDate') : t('updateNotif.menuCheck')}
    </Button>
  );
};

export default React.memo(UpdateMenuButton);
