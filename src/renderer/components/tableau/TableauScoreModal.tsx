/**
 * BellePoule Modern - TableauScoreModal
 * Modale de saisie rapide du score d'un match de tableau
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TableauMatch } from './tableauTypes';
import { useTranslation } from '../../hooks/useTranslation';
import { MedicalCrossIcon } from '../common/MedicalCrossIcon';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import SpecialStatusPanel from '../common/SpecialStatusPanel';
import TiebreakerAnimation from '../TiebreakerAnimation';

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
  onSpecialStatus: (
    status: 'abandon' | 'forfait' | 'exclusion',
    fencerId: string,
    blackCard?: boolean
  ) => void;
  /** Annule le match (score effacé) — absent pour les barrages */
  onMatchCancel?: () => void;
  getRoundName: (round: number) => string;
  /** Égalité tranchée par V (manuel) ou tirage au sort : laser, olympique, rapières */
  tieBreakByVictory?: boolean;
  victoryA?: boolean;
  victoryB?: boolean;
  onVictoryChange?: (side: 'A' | 'B' | null) => void;
}

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
  tieBreakByVictory = false,
  victoryA = false,
  victoryB = false,
  onVictoryChange,
}) => {
  const { t } = useTranslation();
  // Focus piégé + Échap sur l'overlay (le ref du dialogue reste réservé au redimensionnement)
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [pendingStatus, setPendingStatus] = useState<'abandon' | 'forfait' | 'exclusion' | null>(
    null
  );
  const [showCoinFlip, setShowCoinFlip] = useState(false);

  const fencerName = (f: TableauMatch['fencerA']) =>
    f ? `${f.lastName} ${f.firstName}`.trim() : '';

  // Égalité saisie (scores renseignés des deux côtés) : Sabre Laser uniquement
  const hasBothScores = editScoreA !== '' && editScoreB !== '';
  const isTie =
    tieBreakByVictory &&
    hasBothScores &&
    (parseInt(editScoreA, 10) || 0) === (parseInt(editScoreB, 10) || 0);
  const canDrawLots = isTie && !!match.fencerA && !!match.fencerB;

  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  return createPortal(
    // Clic hors de la fenêtre : ne ferme pas (#1115)
    <div className="modal-overlay" ref={trapRef}>
      <div
        ref={modalRef}
        className="modal resizable is-240625"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header is-0430c2">
          <h3 className="modal-title">
            {t('tableauScore.quick_entry', { round: getRoundName(match.round) })}
          </h3>
        </div>
        <div className="modal-body is-a48125">
          {/* Ligne unique avec les deux tireurs côte à côte */}
          <div className="is-cef216">
            {/* Tireur A */}
            <div className="is-b3689a">
              <div className="is-29ee32">{match.fencerA?.lastName}</div>
              <div className="is-bd17c2">
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
            <span className="is-42b7f2">:</span>

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
            <div className="is-d0c392">
              <div className="is-0b536f">{match.fencerB?.lastName}</div>
              <div className="is-2415dc">
                {match.fencerB?.firstName} {match.fencerB?.club && `(${match.fencerB.club})`}
              </div>
            </div>
          </div>

          {/* Info score max */}
          {!isUnlimitedScore && maxScore > 0 && (
            <p className="text-sm text-muted is-89a4cc">
              {t('tableauScore.max_score', { n: maxScore })}
            </p>
          )}

          {/* Égalité Sabre Laser : vainqueur par V manuel ou tirage au sort */}
          {isTie && (
            <div className="tableau-tie">
              <p className="tableau-tie-hint">{t('tableauScore.tie_hint')}</p>
              <div className="tableau-tie-actions">
                <button
                  type="button"
                  className={victoryA ? 'btn btn-primary' : 'btn btn-secondary'}
                  aria-pressed={victoryA}
                  disabled={!match.fencerA}
                  onClick={() => onVictoryChange?.(victoryA ? null : 'A')}
                >
                  V · {match.fencerA?.lastName}
                </button>
                {canDrawLots && (
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={() => setShowCoinFlip(true)}
                  >
                    🪙 {t('tableauScore.coin_flip')}
                  </button>
                )}
                <button
                  type="button"
                  className={victoryB ? 'btn btn-primary' : 'btn btn-secondary'}
                  aria-pressed={victoryB}
                  disabled={!match.fencerB}
                  onClick={() => onVictoryChange?.(victoryB ? null : 'B')}
                >
                  V · {match.fencerB?.lastName}
                </button>
              </div>
            </div>
          )}

          {/* Boutons spéciaux sur une ligne */}
          {!pendingStatus ? (
            <div className="is-4e4f08">
              <button
                className="btn btn-warning is-d1e548"
                onClick={() => setPendingStatus('abandon')}
              >
                <MedicalCrossIcon /> {t('tableauScore.abandon')}
              </button>
              <button
                className="btn btn-warning is-d1e548"
                onClick={() => setPendingStatus('forfait')}
              >
                📋 {t('tableauScore.forfait')}
              </button>
              <button
                className="btn btn-danger is-d1e548"
                onClick={() => setPendingStatus('exclusion')}
              >
                🚫 {t('tableauScore.exclusion')}
              </button>
              {onMatchCancel && (
                <button className="btn btn-secondary is-d1e548" onClick={onMatchCancel}>
                  ⏸ {t('tableau.cancel_match')}
                </button>
              )}
            </div>
          ) : (
            <SpecialStatusPanel
              status={pendingStatus}
              fencers={[
                match.fencerA ? { id: match.fencerA.id, name: fencerName(match.fencerA) } : null,
                match.fencerB ? { id: match.fencerB.id, name: fencerName(match.fencerB) } : null,
              ]}
              onConfirm={(id, blackCard) => onSpecialStatus(pendingStatus, id, blackCard)}
              onCancel={() => setPendingStatus(null)}
            />
          )}
        </div>
        <div className="modal-footer is-40a237">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button className="btn btn-primary" onClick={onSubmit}>
            {t('actions.validate')}
          </button>
        </div>
      </div>
      {showCoinFlip && canDrawLots && (
        <TiebreakerAnimation
          fencerA={match.fencerA!}
          fencerB={match.fencerB!}
          onComplete={winner => {
            setShowCoinFlip(false);
            onVictoryChange?.(winner);
          }}
        />
      )}
    </div>,
    document.body
  );
};

const TableauScoreModal = React.memo(TableauScoreModalComponent);
export default TableauScoreModal;
