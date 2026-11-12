/**
 * BellePoule Modern - QR code de l'URL du lobby (télécommande)
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface LobbyQrCodeProps {
  url: string;
}

export const LobbyQrCode: React.FC<LobbyQrCodeProps> = ({ url }) => {
  const { t } = useTranslation();
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then(m => m.default.toDataURL(url, { width: 220, margin: 1 }))
      .then(dataUrl => {
        if (!cancelled) setQr({ url, dataUrl });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="xiaomi-lobby-qr">
      <strong>{t('rsm.lobby_qr')}</strong>
      {qr && qr.url === url ? (
        <img src={qr.dataUrl} alt={t('rsm.qr_code')} width={220} height={220} />
      ) : (
        <span>{t('rsm.generating')}</span>
      )}
      <code>{url}</code>
    </div>
  );
};
