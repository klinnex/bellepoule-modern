/**
 * BellePoule Modern - Ligne « URL + copier + QR code » de la saisie distante (#1414)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { ClipboardList, Smartphone } from 'lucide-react';
import { Icon } from '../common/Icon';

interface Props {
  url: string;
  /** Identifiant de ligne : sert à afficher « Copié » sur le bon bouton */
  id: number;
  copiedIndex: number | null;
  onCopy: (url: string, id: number) => void;
  onQr: () => void;
}

export const UrlCopyRow: React.FC<Props> = ({ url, id, copiedIndex, onCopy, onQr }) => {
  const { t } = useTranslation();
  return (
    <div className="arena-url-row">
      <span className="arena-url-label">URL</span>
      <code className="arena-url-value">{url}</code>
      <button className="btn-copy" onClick={() => onCopy(url, id)} title={t('rsm.copy_url')}>
        {copiedIndex === id ? t('rsm.copied_short') : <Icon icon={ClipboardList} />}
      </button>
      <button className="btn-qr" onClick={onQr} title={t('rsm.qr_code')}>
        <Icon icon={Smartphone} />
      </button>
    </div>
  );
};
