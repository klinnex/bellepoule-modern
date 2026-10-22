/**
 * BellePoule Modern - TableauRefereeModal
 * Modal d'assignation d'un ou plusieurs arbitres (mode expert) à un match du tableau
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../hooks/useTranslation';

type RefereeInfo = { id: string; firstName: string; lastName: string };

interface TableauRefereeModalProps {
  /** Arbitres actuels ; le premier est l'arbitre principal */
  currentReferees: RefereeInfo[];
  /** Nombre max d'arbitres sélectionnables (mode expert) ; 1 = sélection unique */
  maxReferees?: number;
  referees: Array<RefereeInfo & { club?: string; status?: string }>;
  onAssign: (referees: RefereeInfo[]) => void;
  onClose: () => void;
}

const REF_BTN: React.CSSProperties = { padding: '0.75rem', fontSize: '0.875rem' };
const CLUB_SPAN: React.CSSProperties = { marginLeft: '0.5rem', opacity: 0.6, fontSize: '0.8rem' };

const TableauRefereeModal: React.FC<TableauRefereeModalProps> = ({
  currentReferees,
  maxReferees = 1,
  referees: allReferees,
  onAssign,
  onClose,
}) => {
  const { t } = useTranslation();
  // Arbitres non pointés masqués, sauf ceux déjà assignés (#977)
  const referees = allReferees.filter(
    r => r.status !== 'unavailable' || currentReferees.some(c => c.id === r.id)
  );
  const isMulti = maxReferees > 1;
  const [pendingIds, setPendingIds] = useState<string[]>(() => currentReferees.map(r => r.id));

  const toggle = (id: string) => {
    setPendingIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= maxReferees) return prev;
      return [...prev, id];
    });
  };

  const confirm = () => {
    const byId = new Map([...referees, ...currentReferees].map(r => [r.id, r] as const));
    onAssign(
      pendingIds
        .map(id => byId.get(id))
        .filter((r): r is RefereeInfo => !!r)
        .map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName }))
    );
  };

  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tableau-referee-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="tableau-referee-title">
            {isMulti ? t('tableauReferee.title_multi') : t('tableauReferee.title_one')}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <p
            style={{ marginBottom: '1rem', color: 'var(--color-text-light)', fontSize: '0.875rem' }}
          >
            {isMulti
              ? t('tableauReferee.hint_multi', { n: maxReferees })
              : t('tableauReferee.hint_one')}
          </p>
          <div className="u-stack-2">
            <button
              className={`btn ${currentReferees.length === 0 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onAssign([])}
              style={REF_BTN}
            >
              {t('tableauReferee.none')}
            </button>
            {referees.length === 0 && (
              <p
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                }}
              >
                {t('tableauReferee.none_checked')}
              </p>
            )}
            {isMulti &&
              referees.map(ref => {
                const order = pendingIds.indexOf(ref.id);
                const selected = order >= 0;
                return (
                  <button
                    key={ref.id}
                    className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => toggle(ref.id)}
                    disabled={!selected && pendingIds.length >= maxReferees}
                    aria-pressed={selected}
                    style={{ ...REF_BTN, textAlign: 'left' }}
                  >
                    {selected ? `☑ ${order + 1}.` : '☐'} 🧑‍⚖️ {ref.lastName} {ref.firstName}
                    {ref.club && <span style={CLUB_SPAN}>({ref.club})</span>}
                  </button>
                );
              })}
            {isMulti && referees.length > 0 && (
              <button className="btn btn-primary" onClick={confirm} style={REF_BTN}>
                {t('tableauReferee.validate', { n: pendingIds.length, max: maxReferees })}
              </button>
            )}
            {!isMulti &&
              referees.map(ref => (
                <button
                  key={ref.id}
                  className={`btn ${currentReferees[0]?.id === ref.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() =>
                    onAssign([{ id: ref.id, firstName: ref.firstName, lastName: ref.lastName }])
                  }
                  style={{ ...REF_BTN, textAlign: 'left' }}
                >
                  🧑‍⚖️ {ref.lastName} {ref.firstName}
                  {ref.club && <span style={CLUB_SPAN}>({ref.club})</span>}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TableauRefereeModal;
