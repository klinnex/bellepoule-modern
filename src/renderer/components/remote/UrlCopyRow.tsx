/**
 * BellePoule Modern - Ligne « Copier URL + QR code » de la saisie distante (#1414)
 * Licensed under GPL-3.0
 */
import { TipButton } from '../Tooltip';
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
      <TipButton className="btn-copy btn-wide" onClick={() => onCopy(url, id)} tip={url}>
        <Icon icon={ClipboardList} />
        {copiedIndex === id ? t('rsm.copied_short') : t('rsm.copy_url_short')}
      </TipButton>
      <button className="btn-qr btn-wide" onClick={onQr} title={url}>
        <Icon icon={Smartphone} /> {t('rsm.qr_code')}
      </button>
    </div>
  );
};
