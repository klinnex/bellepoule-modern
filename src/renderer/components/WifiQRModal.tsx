/**
 * BellePoule Modern - WiFi QR Code Generator Modal
 * Licensed under GPL-3.0
 */

import React, { useState, useCallback, memo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { logger, LogCategory } from '@shared/services/logger';

type SecurityType = 'WPA' | 'WEP' | 'nopass';

interface WifiConfig {
  ssid: string;
  security: SecurityType;
  password: string;
  hidden: boolean;
}

interface WifiQRModalProps {
  onClose: () => void;
}

const WifiQRModal_: React.FC<WifiQRModalProps> = ({ onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [config, setConfig] = useState<WifiConfig>({
    ssid: '',
    security: 'WPA',
    password: '',
    hidden: false,
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>('');

  const buildWifiString = (cfg: WifiConfig): string => {
    const escape = (s: string) => s.replace(/([\\;,":])/, '\\$1');
    const parts: string[] = ['WIFI:'];
    parts.push(`T:${cfg.security};`);
    parts.push(`S:${escape(cfg.ssid)};`);
    if (cfg.security !== 'nopass') {
      parts.push(`P:${escape(cfg.password)};`);
    }
    if (cfg.hidden) parts.push('H:true;');
    parts.push(';');
    return parts.join('');
  };

  const generate = useCallback(async () => {
    if (!config.ssid.trim()) {
      setError('Le SSID est requis.');
      return;
    }
    if (config.security !== 'nopass' && !config.password) {
      setError('Le mot de passe est requis.');
      return;
    }
    setError('');
    setIsGenerating(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const url = await QRCode.toDataURL(buildWifiString(config), {
        width: 280,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(url);
    } catch (err) {
      logger.error(LogCategory.UI, 'Erreur génération QR WiFi', err as Error);
      setError('Erreur lors de la génération du QR code.');
    } finally {
      setIsGenerating(false);
    }
  }, [config]);

  const download = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `wifi-qr-${config.ssid.replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleChange = (field: keyof WifiConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setQrDataUrl('');
    setError('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal modal--md"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wifi-qr-title"
      >
        <div className="modal__header">
          <h2 className="modal__title" id="wifi-qr-title">
            📶 Générateur QR Code WiFi
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal__body">
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-muted, #6b7280)',
              marginBottom: '1rem',
            }}
          >
            Les tablettes arbitres scannent ce QR code pour rejoindre le réseau WiFi.
          </p>

          <div className="form-group">
            <label className="form-label" htmlFor="wifi-ssid">
              Nom du réseau (SSID)
            </label>
            <input
              id="wifi-ssid"
              type="text"
              className="form-control"
              placeholder="Mon-Réseau-WiFi"
              value={config.ssid}
              onChange={e => handleChange('ssid', e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="wifi-security">
              Type de sécurité
            </label>
            <select
              id="wifi-security"
              className="form-control"
              value={config.security}
              onChange={e => handleChange('security', e.target.value as SecurityType)}
            >
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Aucune (réseau ouvert)</option>
            </select>
          </div>

          {config.security !== 'nopass' && (
            <div className="form-group">
              <label className="form-label" htmlFor="wifi-password">
                Mot de passe
              </label>
              <input
                id="wifi-password"
                type="text"
                className="form-control"
                placeholder="Mot de passe WiFi"
                value={config.password}
                onChange={e => handleChange('password', e.target.value)}
              />
            </div>
          )}

          <div
            className="form-group"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <input
              id="wifi-hidden"
              type="checkbox"
              checked={config.hidden}
              onChange={e => handleChange('hidden', e.target.checked)}
            />
            <label
              htmlFor="wifi-hidden"
              className="form-label"
              style={{ marginBottom: 0, cursor: 'pointer' }}
            >
              Réseau masqué (SSID caché)
            </label>
          </div>

          {error && (
            <div className="alert alert--error" style={{ marginTop: '0.5rem' }}>
              {error}
            </div>
          )}

          {qrDataUrl && (
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <img
                src={qrDataUrl}
                alt="QR Code WiFi"
                width={280}
                height={280}
                style={{ borderRadius: '8px' }}
              />
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted, #6b7280)',
                  marginTop: '0.5rem',
                }}
              >
                Réseau : <strong>{config.ssid}</strong> ·{' '}
                {config.security !== 'nopass' ? config.security : 'Ouvert'}
              </p>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          {qrDataUrl && (
            <button className="btn btn-secondary" onClick={download}>
              💾 Télécharger
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={generate}
            disabled={isGenerating || !config.ssid.trim()}
          >
            {isGenerating ? 'Génération...' : '📶 Générer le QR Code'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const WifiQRModal = memo(WifiQRModal_);
