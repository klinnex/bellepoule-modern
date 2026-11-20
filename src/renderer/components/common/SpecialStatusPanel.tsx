/**
 * BellePoule Modern - Panneau de choix du tireur pour un statut spécial (médical / forfait / exclusion)
 * Affichage unique poules + tableau, sans pop-up (#1418). Exclusion : question « Carton noir ? » Oui/Non
 * après le choix du tireur.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from './Button';

export type SpecialStatus = 'abandon' | 'forfait' | 'exclusion';

export interface SpecialStatusFencer {
  id: string;
  name: string;
}

interface SpecialStatusPanelProps {
  status: SpecialStatus;
  /** Deux tireurs dans l'ordre d'affichage (null = case vide) */
  fencers: [SpecialStatusFencer | null, SpecialStatusFencer | null];
  /** blackCard n'est vrai que pour une exclusion confirmée « Carton noir : Oui » */
  onConfirm: (fencerId: string, blackCard: boolean) => void;
  onCancel: () => void;
}

const STATUS_LABELS: Record<SpecialStatus, string> = {
  abandon: 'tableauScore.abandon',
  forfait: 'tableauScore.forfait',
  exclusion: 'tableauScore.exclusion',
};

const STATUS_ACTION: Record<SpecialStatus, string> = {
  abandon: 'tableauScore.who_abandon',
  forfait: 'tableauScore.who_forfait',
  exclusion: 'tableauScore.who_exclusion',
};

const SpecialStatusPanel: React.FC<SpecialStatusPanelProps> = ({
  status,
  fencers,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [excludedId, setExcludedId] = useState<string | null>(null);

  const pick = (f: SpecialStatusFencer | null) => {
    if (!f) return;
    if (status === 'exclusion') setExcludedId(f.id);
    else onConfirm(f.id, false);
  };

  if (excludedId !== null) {
    const name = fencers.find(f => f?.id === excludedId)?.name ?? '';
    return (
      <div className="is-e2a8c5">
        <p className="is-cfe518">
          {t('tableauScore.black_card_question')} — {name}
        </p>
        <div className="is-027866">
          <Button variant="danger" onClick={() => onConfirm(excludedId, true)}>
            {t('actions.yes')}
          </Button>
          <Button variant="warning" onClick={() => onConfirm(excludedId, false)}>
            {t('actions.no')}
          </Button>
          <Button onClick={() => setExcludedId(null)}>{t('actions.cancel')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="is-e2a8c5">
      <p className="is-cfe518">
        {t(STATUS_LABELS[status])} — {t(STATUS_ACTION[status])}
      </p>
      <div className="is-027866">
        {fencers.map((f, i) => (
          <Button key={i} variant="danger" disabled={!f} onClick={() => pick(f)}>
            {f?.name || '—'}
          </Button>
        ))}
        <Button onClick={onCancel}>{t('actions.cancel')}</Button>
      </div>
    </div>
  );
};

export default React.memo(SpecialStatusPanel);
