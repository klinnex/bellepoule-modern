/**
 * BellePoule Modern - Mode Club (#1872) : lobby des pistes pour la saisie distante en séance
 * (même lobby que le mode entraînement). Lien et QR à scanner par les tablettes arbitres.
 * Licensed under GPL-3.0
 */
import React, { useEffect, useState } from 'react';
import { Copy, LayoutGrid } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { useToast } from '../Toast';

export const ClubLobbyQr: React.FC<{ url: string }> = ({ url }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const QRCode = (await import('qrcode')).default;
      const data = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      if (!cancelled) setQr(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('clubSession.lobby_copied'), 'success');
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div className="club-lobby">
      <div className="club-row">
        <Button
          icon={<LayoutGrid size={15} aria-hidden="true" />}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {t('clubSession.lobby')}
        </Button>
        <code className="club-lobby-url">{url}</code>
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={14} aria-hidden="true" />}
          aria-label={t('clubSession.lobby_copy')}
          title={t('clubSession.lobby_copy')}
          onClick={() => void copy()}
        />
      </div>
      {open && (
        <div className="club-lobby-qr">
          {qr ? (
            <img src={qr} width={200} height={200} alt={t('clubSession.lobby_qr_alt')} />
          ) : null}
          <p className="club-muted">{t('clubSession.lobby_hint')}</p>
        </div>
      )}
    </div>
  );
};
