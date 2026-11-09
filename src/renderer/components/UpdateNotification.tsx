/**
 * BellePoule Modern - Update Notification Component
 * Affichage des notifications de mise à jour dans l'interface
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { useTranslation } from '../hooks/useTranslation';
import { formatNumber } from '../../shared/utils/localeFormat';
import { SHOW_UPDATE_EVENT } from './UpdateMenuButton';

const MB = 1024 * 1024;

interface UpdateNotificationProps {
  visible?: boolean;
}

interface UpdateInfo {
  hasUpdate: boolean;
  currentBuild: number;
  latestBuild: number;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ visible: propVisible }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [visible, setVisible] = useState(propVisible || false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [bytes, setBytes] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    // Écouter les événements de mise à jour depuis le processus principal
    const offAvailable = api?.onUpdateAvailable?.(info => {
      setUpdateInfo(info);
      if (!dismissed) setVisible(true);
    });
    // Téléchargement lancé (bannière, menu Aide ou fond) : bannière affichée avec le %
    const offProgress = api?.onUpdateProgress?.(data => {
      setProgress(data.progress);
      if (data.total) setBytes({ done: data.downloaded ?? 0, total: data.total });
      if (data.latestVersion && data.latestBuild !== undefined) {
        const { latestVersion, latestBuild } = data;
        setUpdateInfo(
          prev =>
            prev ?? {
              hasUpdate: true,
              currentBuild: data.currentBuild ?? 0,
              latestBuild,
              latestVersion,
              downloadUrl: '',
              releaseNotes: '',
            }
        );
      }
      // Nouveau téléchargement (0 %) : réafficher même si la bannière avait été fermée
      if (data.progress === 0) setDismissed(false);
      setVisible(true);
    });
    // Bouton clignotant de l'en-tête : réaffiche la bannière même fermée
    const onShow = (e: Event) => {
      const info = (e as CustomEvent<UpdateInfo | undefined>).detail;
      if (info) setUpdateInfo(info);
      setDismissed(false);
      setVisible(true);
    };
    window.addEventListener(SHOW_UPDATE_EVENT, onShow);
    return () => {
      offAvailable?.();
      offProgress?.();
      window.removeEventListener(SHOW_UPDATE_EVENT, onShow);
    };
  }, [dismissed]);

  // Téléchargement + vérification + installation dans l'app (sans navigateur)
  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    // Retour visuel immédiat : la lame s'affiche avant le premier octet
    setProgress(p => p ?? 0);
    showToast(t('updateNotif.redirect'), 'info');
    try {
      const res = await window.electronAPI?.updater?.downloadAndInstall?.();
      if (!res) {
        showToast(t('updateNotif.failed'), 'error');
      } else if (!res.success) {
        if (res.error === 'no_asset') showToast(t('updateNotif.noAsset'), 'warning');
        else if (res.error === 'busy') showToast(t('updateNotif.busy'), 'info');
        else showToast(t('updateNotif.failed'), 'error');
      }
    } catch {
      showToast(t('updateNotif.failed'), 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    showToast(t('updateNotif.later'), 'info');
  };

  const handleViewRelease = () => {
    // Ouvre vers la page de la release spécifique (pas l'historique complet)
    if (updateInfo?.latestVersion) {
      const releaseUrl = `https://github.com/klinnex/bellepoule-modern/releases/tag/v${updateInfo.latestVersion}`;
      window.open(releaseUrl, '_blank');
    } else {
      window.open('https://github.com/klinnex/bellepoule-modern/releases/latest', '_blank');
    }
  };

  // Progression au dixième de % + Mo téléchargés / total (langue active)
  const progressLabel =
    progress === null
      ? ''
      : t('updateNotif.progress', {
          n: formatNumber(progress, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          done: formatNumber((bytes?.done ?? 0) / MB, { maximumFractionDigits: 1 }),
          total: formatNumber((bytes?.total ?? 0) / MB, { maximumFractionDigits: 1 }),
        });

  if (!visible || !updateInfo || dismissed) {
    return null;
  }

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <div className="update-notification-icon">🚀</div>
        <div className="update-notification-text">
          <h4>{t('updateNotif.title')}</h4>
          <p>
            {t('updateNotif.version')} <strong>v{updateInfo.latestVersion}</strong>{' '}
            {`(Build #${updateInfo.latestBuild})`}
          </p>
          {progress !== null && progress < 100 && (
            <>
              <p className="update-notification-multiple">{progressLabel}</p>
              {/* Sabre laser : la lame s'allume avec le pourcentage */}
              <div className="update-saber">
                <span className="update-saber-hilt" aria-hidden="true" />
                <progress
                  className="update-notification-progress"
                  max={100}
                  // valeur au dixième : la lame avance en continu
                  value={progress}
                  aria-label={progressLabel}
                />
              </div>
            </>
          )}
          {updateInfo.latestBuild - updateInfo.currentBuild > 1 && (
            <p className="update-notification-multiple">
              {t('updateNotif.behind', { n: updateInfo.latestBuild - updateInfo.currentBuild })}
            </p>
          )}
        </div>
        <div className="update-notification-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDownload}
            disabled={busy}
            aria-busy={busy}
          >
            {t('updateNotif.download')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleViewRelease}>
            {t('updateNotif.notes')}
          </button>
          <button
            aria-label={t('actions.close')}
            className="btn btn-ghost btn-sm"
            onClick={handleDismiss}
          >
            ✖️
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(UpdateNotification);
