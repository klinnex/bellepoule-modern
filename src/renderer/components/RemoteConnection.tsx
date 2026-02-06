/**
 * BellePoule Modern - Remote Connection Component
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from '../hooks/useTranslation';

interface RemoteConnectionProps {
  isServerRunning: boolean;
  serverPort: number;
  onPortChange: (port: number) => void;
  onStartServer: () => void;
  onStopServer: () => void;
}

const RemoteConnection: React.FC<RemoteConnectionProps> = ({
  isServerRunning,
  serverPort,
  onPortChange,
  onStartServer,
  onStopServer
}) => {
  const { t } = useTranslation();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [port, setPort] = useState<number>(serverPort);

  // Mettre à jour l'URL et le QR code quand le serveur démarre ou le port change
  useEffect(() => {
    if (isServerRunning) {
      updateConnectionInfo();
    } else {
      setServerUrl('');
      setQrCodeUrl('');
    }
  }, [isServerRunning, port]);

  const updateConnectionInfo = async () => {
    // Obtenir l'adresse IP locale
    const localIp = await getLocalIpAddress();
    const url = `http://${localIp}:${port}`;
    setServerUrl(url);
    
    // Générer le QR code
    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeUrl(qrDataUrl);
    } catch (err) {
      console.error('Erreur lors de la génération du QR code:', err);
    }
  };

  const getLocalIpAddress = async (): Promise<string> => {
    try {
      // Pour l'instant, utiliser localhost en attendant l'implémentation de la détection IP
      // Dans une version future, on pourrait détecter l'IP locale automatiquement
      return 'localhost';
    } catch (error) {
      console.error('Impossible d\'obtenir l\'adresse IP, utilisation de localhost:', error);
      return 'localhost';
    }
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = parseInt(e.target.value);
    if (!isNaN(newPort) && newPort > 0 && newPort <= 65535) {
      setPort(newPort);
      onPortChange(newPort);
    }
  };

  const handleStartServer = () => {
    onStartServer();
  };

  const handleStopServer = () => {
    onStopServer();
  };

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(serverUrl).then(() => {
      // Afficher un feedback visuel temporaire
      const button = document.getElementById('copy-url-btn');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copié!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    });
  };

  return (
    <div className="remote-connection">
      <h3>{t('remote.title')}</h3>
      
      <div className="form-group">
        <label htmlFor="remote-port">{t('remote.port')}</label>
        <div className="input-group">
          <input
            id="remote-port"
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={handlePortChange}
            disabled={isServerRunning}
            className="form-control"
            placeholder="8066"
          />
          <button
            className={`btn ${isServerRunning ? 'btn-danger' : 'btn-primary'}`}
            onClick={isServerRunning ? handleStopServer : handleStartServer}
          >
            {isServerRunning ? t('remote.stop') : t('remote.start')}
          </button>
        </div>
      </div>

      {isServerRunning && serverUrl && (
        <div className="connection-info">
          <div className="form-group">
            <label>{t('remote.url')}</label>
            <div className="input-group">
              <input
                type="text"
                value={serverUrl}
                readOnly
                className="form-control"
                placeholder="URL de connexion"
              />
              <button
                id="copy-url-btn"
                className="btn btn-secondary"
                onClick={copyUrlToClipboard}
              >
                {t('remote.copy')}
              </button>
            </div>
            <small className="text-muted">
              {t('remote.urlDescription')}
            </small>
          </div>

          {qrCodeUrl && (
            <div className="qr-code-section">
              <label>{t('remote.qrCode')}</label>
              <div className="qr-code-container">
                <img src={qrCodeUrl} alt="QR Code pour connexion" />
                <p className="qr-code-instructions">
                  {t('remote.qrCodeDescription')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RemoteConnection;