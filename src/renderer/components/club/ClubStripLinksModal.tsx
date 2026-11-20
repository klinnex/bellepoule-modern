/**
 * BellePoule Modern - Mode Club (#1872) : liens d'une piste en saisie distante —
 * affichage de piste (/areneN) et tablette arbitre (/areneN/arbitre), URL à copier et QR.
 * Licensed under GPL-3.0
 */
import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../Toast';

export const stripLinks = (baseUrl: string, strip: number) => ({
  display: `${baseUrl}/arene${strip}`,
  referee: `${baseUrl}/arene${strip}/arbitre`,
});

const LinkBlock: React.FC<{ title: string; url: string }> = ({ title, url }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import('qrcode')).default;
      const data = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      if (!cancelled) setQr(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('clubSession.lobby_copied'), 'success');
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <section className="club-strip-link">
      <h3 className="club-strip-link-title">{title}</h3>
      {qr ? <img src={qr} width={200} height={200} alt={t('clubStrip.qr_alt', { title })} /> : null}
      <div className="club-row">
        <code className="club-lobby-url">{url}</code>
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={14} aria-hidden="true" />}
          aria-label={t('clubStrip.copy', { title })}
          title={t('clubStrip.copy', { title })}
          onClick={() => void copy()}
        />
      </div>
    </section>
  );
};

export const ClubStripLinksModal: React.FC<{
  baseUrl: string;
  strip: number;
  onClose: () => void;
}> = ({ baseUrl, strip, onClose }) => {
  const { t } = useTranslation();
  const links = stripLinks(baseUrl, strip);
  return (
    <Modal
      title={t('clubStrip.title', { n: strip })}
      onClose={onClose}
      size="lg"
      footer={<Button onClick={onClose}>{t('actions.close')}</Button>}
    >
      <div className="club-strip-links">
        <LinkBlock title={t('clubStrip.display')} url={links.display} />
        <LinkBlock title={t('clubStrip.referee')} url={links.referee} />
      </div>
    </Modal>
  );
};
