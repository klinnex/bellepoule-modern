/**
 * BellePoule Modern - Libellé du bouton « copier l'URL » (icône lucide + texte)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { ClipboardCopy } from 'lucide-react';
import { Icon } from '../common/Icon';

interface CopyUrlLabelProps {
  copied: boolean;
  t: (key: string) => string;
}

export const CopyUrlLabel: React.FC<CopyUrlLabelProps> = ({ copied, t }) =>
  copied ? (
    <>{t('rsm.copied_short')}</>
  ) : (
    <>
      <Icon icon={ClipboardCopy} /> {t('rsm.copy_url_short')}
    </>
  );
