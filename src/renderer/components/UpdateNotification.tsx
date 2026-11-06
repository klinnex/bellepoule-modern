/**
 * BellePoule Modern - Update Notification Component
 * Affichage des notifications de mise à jour dans l'interface
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { useTranslation } from '../hooks/useTranslation';

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
    return () => {
      offAvailable?.();
      offProgress?.();
    };
  }, [dismissed]);

  // Téléchargement + vérification + installation dans l'app (sans navigateur)
  const handleDownload = async () => {
    showToast(t('updateNotif.redirect'), 'info');
    try {
      const res = await window.electronAPI?.updater?.downloadAndInstall?.();
      if (res && !res.success && res.error !== 'no_asset') {
        showToast(t('updateNotif.failed'), 'error');
      }
    } catch {
      showToast(t('updateNotif.failed'), 'error');
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
              <p className="update-notification-multiple">
                {t('updateNotif.progress', { n: progress })}
              </p>
              {/* Sabre laser : la lame s'allume avec le pourcentage */}
              <div className="update-saber">
                <span className="update-saber-hilt" aria-hidden="true" />
                <progress
                  className="update-notification-progress"
                  max={100}
                  value={progress}
                  aria-label={t('updateNotif.progress', { n: progress })}
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
          <button className="btn btn-primary btn-sm" onClick={handleDownload}>
            {t('updateNotif.download')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleViewRelease}>
            {t('updateNotif.notes')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleDismiss}>
            ✖️
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(UpdateNotification);
