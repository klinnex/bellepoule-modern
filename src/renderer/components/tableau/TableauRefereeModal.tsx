/**
 * BellePoule Modern - TableauRefereeModal
 * Modal d'assignation d'un ou plusieurs arbitres (mode expert) à un match du tableau
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';

type RefereeInfo = { id: string; firstName: string; lastName: string };

interface TableauRefereeModalProps {
  /** Arbitres actuels ; le premier est l'arbitre principal */
  currentReferees: RefereeInfo[];
  /** Nombre max d'arbitres sélectionnables (mode expert) ; 1 = sélection unique */
  maxReferees?: number;
  referees: Array<RefereeInfo & { club?: string }>;
  onAssign: (referees: RefereeInfo[]) => void;
  onClose: () => void;
}

const REF_BTN: React.CSSProperties = { padding: '0.75rem', fontSize: '0.875rem' };
const CLUB_SPAN: React.CSSProperties = { marginLeft: '0.5rem', opacity: 0.6, fontSize: '0.8rem' };

const TableauRefereeModal: React.FC<TableauRefereeModalProps> = ({
  currentReferees,
  maxReferees = 1,
  referees,
  onAssign,
  onClose,
}) => {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isMulti ? 'Assigner les arbitres' : 'Assigner un arbitre'}
          </h3>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <p style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
            {isMulti
              ? `Sélectionnez jusqu'à ${maxReferees} arbitres pour ce match (le premier sélectionné est l'arbitre principal) :`
              : "Sélectionnez l'arbitre pour ce match :"}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              className={`btn ${currentReferees.length === 0 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onAssign([])}
              style={REF_BTN}
            >
              ✕ Aucun arbitre
            </button>
            {referees.length === 0 && (
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>
                Aucun arbitre enregistré pour cette compétition
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
                ✓ Valider ({pendingIds.length}/{maxReferees})
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
    </div>
  );
};

export default TableauRefereeModal;
