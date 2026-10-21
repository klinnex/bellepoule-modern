/**
 * BellePoule Modern - QR Code Share Component
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, memo } from 'react';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useToast } from './Toast';
import { useTranslation } from '../hooks/useTranslation';
import { logger, LogCategory } from '@shared/services/logger';
import { Competition } from '../../shared/types';

type QRMode = 'results' | 'checkin';

interface QRCodeShareProps {
  competition: Competition;
  onClose: () => void;
  mode?: QRMode;
}

const QRCodeShare_: React.FC<QRCodeShareProps> = ({
  competition,
  onClose,
  mode: initialMode = 'results',
}) => {
  const { t } = useTranslation();
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
        setError(t('qrShare.server_required'));
        setIsGenerating(false);
        return;
      }

      const path =
        activeMode === 'checkin'
          ? `/competition/${competition.id}/checkin`
          : `/competition/${competition.id}/results`;
      const url = `${info.serverInfo.url}${path}`;
      setShareUrl(url);

      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });
      setQrCodeUrl(dataUrl);
    } catch (err) {
      logger.error(LogCategory.UI, 'Erreur génération QR', err as Error);
      setError(t('qrShare.error'));
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
      showToast(t('qrShare.copied'), 'success');
    });
  };

  const modeConfig = {
    results: {
      title: t('qrShare.results_title'),
      description: t('qrShare.results_desc', { title: competition.title }),
      info: t('qrShare.results_info'),
    },
    checkin: {
      title: t('qrShare.checkin_title'),
      description: t('qrShare.checkin_desc', { title: competition.title }),
      info: t('qrShare.checkin_info'),
    },
  };

  const cfg = modeConfig[activeMode];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal modal--md"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__header">
          <h2 className="modal__title">📱 {cfg.title}</h2>
          <button className="modal__close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
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
              {m === 'results' ? t('qrShare.tab_results') : t('qrShare.tab_checkin')}
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
                  <p>{t('qrShare.generating')}</p>
                </div>
              ) : error ? (
                <div className="alert alert--error" style={{ whiteSpace: 'pre-line' }}>
                  {error}
                </div>
              ) : (
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="qrcode__canvas"
                  width={300}
                  height={300}
                />
              )}
            </div>

            {!error && shareUrl && (
              <div className="qrcode__url">
                <label className="form-label">{t('qrShare.url')}</label>
                <div className="qrcode__url-input">
                  <input type="text" value={shareUrl} readOnly className="form-control" />
                  <button className="btn btn-secondary" onClick={copyToClipboard}>
                    {t('qrShare.copy')}
                  </button>
                </div>
              </div>
            )}

            <div className="qrcode__info">
              <div className="alert alert--info">
                <strong>💡 </strong>
                {cfg.info}
              </div>
            </div>
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.close')}
          </button>
          <button
            className="btn btn-primary"
            onClick={downloadQRCode}
            disabled={!qrCodeUrl || isGenerating}
          >
            {t('qrShare.download')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const QRCodeShare = memo(QRCodeShare_);
