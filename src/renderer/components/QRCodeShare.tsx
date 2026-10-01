/**
 * BellePoule Modern - QR Code Share Component
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect , memo} from 'react';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useToast } from './Toast';
import { logger, LogCategory } from '@shared/services/logger';
import { Competition } from '../../shared/types';

type QRMode = 'results' | 'checkin';

interface QRCodeShareProps {
  competition: Competition;
  onClose: () => void;
  mode?: QRMode;
}

const QRCodeShare_: React.FC<QRCodeShareProps> = ({ competition, onClose, mode: initialMode = 'results' }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { showToast } = useToast();
  const [activeMode, setActiveMode] = useState<QRMode>(initialMode);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');

  useEffect(() => {
    generateQRCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competition.id, activeMode]);

  const generateQRCode = async () => {
    setIsGenerating(true);
    setError('');
    setQrCodeUrl('');

    try {
      const info = await window.electronAPI.remote.getServerInfo(competition.id);
      if (!info.success || !info.serverInfo) {
        setError(
          "Le serveur distant doit être démarré pour partager les résultats.\nActivez la saisie distante depuis l'onglet correspondant."
        );
        setIsGenerating(false);
        return;
      }

      const path = activeMode === 'checkin'
        ? `/competition/${competition.id}/checkin`
        : `/competition/${competition.id}/results`;
      const url = `${info.serverInfo.url}${path}`;
      setShareUrl(url);

      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });
      setQrCodeUrl(dataUrl);
    } catch (err) {
      logger.error(LogCategory.UI, 'Erreur génération QR', err as Error);
      setError('Erreur lors de la génération du QR code');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadQRCode = () => {
    if (qrCodeUrl) {
      const link = document.createElement('a');
      link.href = qrCodeUrl;
      link.download = `qrcode-${activeMode}-${competition.title.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('URL copiée dans le presse-papier !', 'success');
    });
  };

  const modeConfig = {
    results: {
      title: 'Partager les résultats',
      description: `Scannez ce QR code pour accéder aux résultats de la compétition "${competition.title}"`,
      info: 'Les spectateurs peuvent voir les résultats en temps réel.',
    },
    checkin: {
      title: 'QR Code de pointage',
      description: `Les tireurs de "${competition.title}" scannent pour se pointer eux-mêmes.`,
      info: 'Affichez ce QR code à l\'entrée de la salle pour que les tireurs confirment leur présence.',
    },
  };

  const cfg = modeConfig[activeMode];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal modal--md" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__header">
          <h2 className="modal__title">📱 {cfg.title}</h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          {(['results', 'checkin'] as QRMode[]).map(m => (
            <button
              key={m}
              onClick={() => setActiveMode(m)}
              style={{
                flex: 1,
                padding: '0.625rem',
                background: 'none',
                border: 'none',
                borderBottom: activeMode === m ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeMode === m ? '#3b82f6' : '#6b7280',
                fontWeight: activeMode === m ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {m === 'results' ? '🏆 Résultats' : '✅ Pointage'}
            </button>
          ))}
        </div>

        <div className="modal__body">
          <div className="qrcode__container">
            <p className="qrcode__description">{cfg.description}</p>

            <div className="qrcode__image-container">
              {isGenerating ? (
                <div className="qrcode__loading">
                  <div className="spinner" />
                  <p>Génération du QR code...</p>
                </div>
              ) : error ? (
                <div className="alert alert--error" style={{ whiteSpace: 'pre-line' }}>{error}</div>
              ) : (
                <img src={qrCodeUrl} alt="QR Code" className="qrcode__canvas" width={300} height={300} />
              )}
            </div>

            {!error && shareUrl && (
              <div className="qrcode__url">
                <label className="form-label">URL :</label>
                <div className="qrcode__url-input">
                  <input type="text" value={shareUrl} readOnly className="form-control" />
                  <button className="btn btn-secondary" onClick={copyToClipboard}>📋 Copier</button>
                </div>
              </div>
            )}

            <div className="qrcode__info">
              <div className="alert alert--info">
                <strong>💡 </strong>{cfg.info}
              </div>
            </div>
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button
            className="btn btn-primary"
            onClick={downloadQRCode}
            disabled={!qrCodeUrl || isGenerating}
          >
            💾 Télécharger le QR Code
          </button>
        </div>
      </div>
    </div>
  );
};

export const QRCodeShare = memo(QRCodeShare_);
