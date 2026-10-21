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

  useEffect(() => {
    // Écouter les événements de mise à jour depuis le processus principal
    const handleUpdateAvailable = (_event: any, info: UpdateInfo) => {
      setUpdateInfo(info);
      if (!dismissed) {
        setVisible(true);
      }
    };

    // @ts-ignore
    if (window.electronAPI?.onUpdateAvailable) {
      // @ts-ignore
      window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
    }

    return () => {
      // Nettoyage des écouteurs
    };
  }, [dismissed]);

  const handleDownload = () => {
    // Ouvre directement vers la dernière release (pas l'historique complet)
    window.open('https://github.com/klinnex/bellepoule-modern/releases/latest', '_blank');
    showToast(t('updateNotif.redirect'), 'info');
    setVisible(false);
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

/* Styles à ajouter dans le fichier CSS global */
export const updateNotificationStyles = `
.update-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  max-width: 400px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  animation: slideInRight 0.3s ease-out;
}

.update-notification-content {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 12px;
  color: white;
}

.update-notification-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.update-notification-text {
  flex: 1;
  min-width: 0;
}

.update-notification-text h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
}

.update-notification-text p {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

.update-notification-multiple {
  color: #ffd700 !important;
  font-weight: 600;
}

.update-notification-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.5);
}
`;
