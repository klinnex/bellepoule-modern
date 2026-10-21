/**
 * BellePoule Modern - TableauScoreModal
 * Modale de saisie rapide du score d'un match de tableau
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TableauMatch } from './tableauTypes';
import { useTranslation } from '../../hooks/useTranslation';

interface TableauScoreModalProps {
  match: TableauMatch;
  editScoreA: string;
  setEditScoreA: (v: string) => void;
  editScoreB: string;
  setEditScoreB: (v: string) => void;
  maxScore: number;
  isUnlimitedScore: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSubmit: () => void;
  onSpecialStatus: (status: 'abandon' | 'forfait' | 'exclusion', fencerId: string) => void;
  /** Annule le match (score effacé) — absent pour les barrages */
  onMatchCancel?: () => void;
  getRoundName: (round: number) => string;
}

const STATUS_LABELS: Record<'abandon' | 'forfait' | 'exclusion', string> = {
  abandon: 'tableauScore.abandon',
  forfait: 'tableauScore.forfait',
  exclusion: 'tableauScore.exclusion',
};

const STATUS_ACTION: Record<'abandon' | 'forfait' | 'exclusion', string> = {
  abandon: 'tableauScore.who_abandon',
  forfait: 'tableauScore.who_forfait',
  exclusion: 'tableauScore.who_exclusion',
};

const TableauScoreModalComponent: React.FC<TableauScoreModalProps> = ({
  match,
  editScoreA,
  setEditScoreA,
  editScoreB,
  setEditScoreB,
  maxScore,
  isUnlimitedScore,
  modalRef,
  onClose,
  onSubmit,
  onSpecialStatus,
  onMatchCancel,
  getRoundName,
}) => {
  const { t } = useTranslation();
  const [pendingStatus, setPendingStatus] = useState<'abandon' | 'forfait' | 'exclusion' | null>(
    null
  );

  const fencerName = (f: TableauMatch['fencerA']) =>
    f ? `${f.lastName} ${f.firstName}`.trim() : '';

  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  return createPortal(
    // Clic hors de la fenêtre : ne ferme pas (#1115)
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className="modal resizable"
        style={{
          maxWidth: '900px',
          width: '95%',
          minHeight: '400px',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header" style={{ cursor: 'move' }}>
          <h3 className="modal-title">
            {t('tableauScore.quick_entry', { round: getRoundName(match.round) })}
          </h3>
        </div>
        <div className="modal-body" style={{ padding: '2rem' }}>
          {/* Ligne unique avec les deux tireurs côte à côte */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Tireur A */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                flex: 1,
                minWidth: '200px',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 600, textAlign: 'right' }}>
                {match.fencerA?.lastName}
              </div>
              <div
                style={{ fontSize: '1rem', color: 'var(--color-text-light)', textAlign: 'right' }}
              >
                {match.fencerA?.firstName} {match.fencerA?.club && `(${match.fencerA.club})`}
              </div>
            </div>

            {/* Input Score A */}
            <input
              type="number"
              className="form-input"
              style={{
                width: '120px',
                textAlign: 'center',
                fontSize: '3rem',
                padding: '0.75rem',
                borderColor:
                  (parseInt(editScoreA, 10) || 0) > (isUnlimitedScore ? 999 : maxScore)
                    ? '#ef4444'
                    : undefined,
                borderWidth:
                  (parseInt(editScoreA, 10) || 0) > (isUnlimitedScore ? 999 : maxScore)
                    ? '2px'
                    : undefined,
              }}
              value={editScoreA}
              onChange={e => setEditScoreA(e.target.value)}
              min="0"
              max={isUnlimitedScore ? undefined : maxScore}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                } else if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault();
                  const modalBody = e.currentTarget.closest('.modal-body');
                  if (modalBody) {
                    const inputs = modalBody.querySelectorAll('input[type="number"]');
                    if (inputs.length > 1) {
                      const nextInput = inputs[1] as HTMLInputElement;
                      nextInput.focus();
                      nextInput.select();
                    }
                  }
                }
              }}
            />

            {/* Séparateur */}
            <span
              style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--color-text-muted)' }}
            >
              :
            </span>

            {/* Input Score B */}
            <input
              type="number"
              className="form-input"
              style={{
                width: '120px',
                textAlign: 'center',
                fontSize: '3rem',
                padding: '0.75rem',
                borderColor:
                  (parseInt(editScoreB, 10) || 0) > (isUnlimitedScore ? 999 : maxScore)
                    ? '#ef4444'
                    : undefined,
                borderWidth:
                  (parseInt(editScoreB, 10) || 0) > (isUnlimitedScore ? 999 : maxScore)
                    ? '2px'
                    : undefined,
              }}
              value={editScoreB}
              onChange={e => setEditScoreB(e.target.value)}
              min="0"
              max={isUnlimitedScore ? undefined : maxScore}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                } else if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault();
                  const modalBody = e.currentTarget.closest('.modal-body');
                  if (modalBody) {
                    const inputs = modalBody.querySelectorAll('input[type="number"]');
                    if (inputs.length > 0) {
                      const prevInput = inputs[0] as HTMLInputElement;
                      prevInput.focus();
                      prevInput.select();
                    }
                  }
                }
              }}
            />

            {/* Tireur B */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                flex: 1,
                minWidth: '200px',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 600, textAlign: 'left' }}>
                {match.fencerB?.lastName}
              </div>
              <div
                style={{ fontSize: '1rem', color: 'var(--color-text-light)', textAlign: 'left' }}
              >
                {match.fencerB?.firstName} {match.fencerB?.club && `(${match.fencerB.club})`}
              </div>
            </div>
          </div>

          {/* Info score max */}
          {!isUnlimitedScore && maxScore > 0 && (
            <p
              className="text-sm text-muted"
              style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '1rem' }}
            >
              {t('tableauScore.max_score', { n: maxScore })}
            </p>
          )}

          {/* Boutons spéciaux sur une ligne */}
          {!pendingStatus ? (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'center',
                borderTop: '1px solid var(--color-border)',
                paddingTop: '1rem',
                marginTop: '1rem',
              }}
            >
              <button
                className="btn btn-warning"
                onClick={() => setPendingStatus('abandon')}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              >
                🚴 {t('tableauScore.abandon')}
              </button>
              <button
                className="btn btn-warning"
                onClick={() => setPendingStatus('forfait')}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              >
                📋 {t('tableauScore.forfait')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setPendingStatus('exclusion')}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              >
                🚫 {t('tableauScore.exclusion')}
              </button>
              {onMatchCancel && (
                <button
                  className="btn btn-secondary"
                  onClick={onMatchCancel}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                >
                  ⏸ {t('tableau.cancel_match')}
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                alignItems: 'center',
                borderTop: '1px solid var(--color-border)',
                paddingTop: '1rem',
                marginTop: '1rem',
              }}
            >
              <p style={{ fontWeight: 600, margin: 0 }}>
                {t(STATUS_LABELS[pendingStatus])} — {t(STATUS_ACTION[pendingStatus])}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <button
                  className="btn btn-danger"
                  disabled={!match.fencerA}
                  onClick={() => match.fencerA && onSpecialStatus(pendingStatus, match.fencerA.id)}
                >
                  {fencerName(match.fencerA) || '—'}
                </button>
                <button
                  className="btn btn-danger"
                  disabled={!match.fencerB}
                  onClick={() => match.fencerB && onSpecialStatus(pendingStatus, match.fencerB.id)}
                >
                  {fencerName(match.fencerB) || '—'}
                </button>
                <button className="btn btn-secondary" onClick={() => setPendingStatus(null)}>
                  {t('actions.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
        <div
          className="modal-footer"
          style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button className="btn btn-primary" onClick={onSubmit}>
            {t('actions.validate')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const TableauScoreModal = React.memo(TableauScoreModalComponent);
export default TableauScoreModal;
