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
import { Button } from '../common/Button';
import { Ban, ClipboardList, Coins, Pause } from 'lucide-react';
import { Icon } from '../common/Icon';
import { useAutoFitHeight } from '../../hooks/useAutoFitHeight';
import { tableauLeftSide, type TableauSide } from './tableauScoreSides';

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
  // Agrandissement automatique quand le contenu s'allonge (égalité, statut spécial, #1826)
  useAutoFitHeight(modalRef, true);
  const [pendingStatus, setPendingStatus] = useState<'abandon' | 'forfait' | 'exclusion' | null>(
    null
  );
  const [showCoinFlip, setShowCoinFlip] = useState(false);

  const fencerName = (f: TableauMatch['fencerA']) =>
    f ? `${f.lastName} ${f.firstName}`.trim() : '';

  // Position sur la piste : second appelé à gauche, gaucher à gauche face à un droitier (#1826)
  const leftKey = tableauLeftSide(match);
  const sideOf = (key: TableauSide) => ({
    key,
    fencer: key === 'A' ? match.fencerA : match.fencerB,
    score: key === 'A' ? editScoreA : editScoreB,
    setScore: key === 'A' ? setEditScoreA : setEditScoreB,
    victory: key === 'A' ? victoryA : victoryB,
  });
  const left = sideOf(leftKey);
  const right = sideOf(leftKey === 'A' ? 'B' : 'A');
  const limit = isUnlimitedScore ? 999 : maxScore;

  const renderVictory = (side: ReturnType<typeof sideOf>) => (
    <button
      type="button"
      className={`score-victory-btn${side.victory ? ' is-active' : ''}`}
      aria-pressed={side.victory}
      aria-label={`V · ${side.fencer?.lastName ?? ''}`}
      disabled={!side.fencer}
      onClick={() => onVictoryChange?.(side.victory ? null : side.key)}
    >
      V
    </button>
  );

  const renderScoreInput = (side: ReturnType<typeof sideOf>, isLeft: boolean) => {
    const over = (parseInt(side.score, 10) || 0) > limit;
    return (
      <input
        type="number"
        className="form-input"
        aria-label={side.fencer?.lastName ?? undefined}
        style={{
          width: '120px',
          textAlign: 'center',
          fontSize: '3rem',
          padding: '0.75rem',
          borderColor: over ? '#ef4444' : undefined,
          borderWidth: over ? '2px' : undefined,
        }}
        value={side.score}
        onChange={e => side.setScore(e.target.value)}
        min="0"
        max={isUnlimitedScore ? undefined : maxScore}
        autoFocus={isLeft}
        data-autofocus={isLeft ? '' : undefined}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          } else if (e.key === 'Tab' && e.shiftKey !== isLeft) {
            e.preventDefault();
            const inputs = e.currentTarget
              .closest('.modal-body')
              ?.querySelectorAll<HTMLInputElement>('input[type="number"]');
            const target = inputs?.[isLeft ? 1 : 0];
            if (target) {
              target.focus();
              target.select();
            }
          }
        }}
      />
    );
  };

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
          {/* Ligne unique : position réelle sur la piste (#1826) */}
          <div className="is-cef216">
            {/* Tireur gauche */}
            <div className="is-b3689a">
              <div className="is-29ee32">{left.fencer?.lastName}</div>
              <div className="is-bd17c2">
                {left.fencer?.firstName} {left.fencer?.club && `(${left.fencer.club})`}
              </div>
            </div>

            {/* Bouton Victoire gauche : comme en poules (#1442) */}
            {tieBreakByVictory && renderVictory(left)}

            {/* Score gauche : focus par défaut (#1826) */}
            {renderScoreInput(left, true)}

            {/* Séparateur */}
            <span className="is-42b7f2">:</span>

            {/* Score droite */}
            {renderScoreInput(right, false)}

            {/* Bouton Victoire droite */}
            {tieBreakByVictory && renderVictory(right)}

            {/* Tireur droite */}
            <div className="is-d0c392">
              <div className="is-0b536f">{right.fencer?.lastName}</div>
              <div className="is-2415dc">
                {right.fencer?.firstName} {right.fencer?.club && `(${right.fencer.club})`}
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
                {canDrawLots && (
                  <Button type="button" variant="warning" onClick={() => setShowCoinFlip(true)}>
                    <Icon icon={Coins} /> {t('tableauScore.coin_flip')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Boutons spéciaux sur une ligne */}
          {!pendingStatus ? (
            <div className="is-4e4f08">
              <Button
                variant="warning"
                className="is-d1e548"
                onClick={() => setPendingStatus('abandon')}
              >
                <MedicalCrossIcon /> {t('tableauScore.abandon')}
              </Button>
              <Button
                variant="warning"
                className="is-d1e548"
                onClick={() => setPendingStatus('forfait')}
              >
                <Icon icon={ClipboardList} /> {t('tableauScore.forfait')}
              </Button>
              <Button
                variant="danger"
                className="is-d1e548"
                onClick={() => setPendingStatus('exclusion')}
              >
                <Icon icon={Ban} /> {t('tableauScore.exclusion')}
              </Button>
              {onMatchCancel && (
                <Button className="is-d1e548" onClick={onMatchCancel}>
                  <Icon icon={Pause} /> {t('tableau.cancel_match')}
                </Button>
              )}
            </div>
          ) : (
            <SpecialStatusPanel
              status={pendingStatus}
              fencers={[
                left.fencer ? { id: left.fencer.id, name: fencerName(left.fencer) } : null,
                right.fencer ? { id: right.fencer.id, name: fencerName(right.fencer) } : null,
              ]}
              onConfirm={(id, blackCard) => onSpecialStatus(pendingStatus, id, blackCard)}
              onCancel={() => setPendingStatus(null)}
            />
          )}
        </div>
        <div className="modal-footer is-40a237">
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" onClick={onSubmit}>
            {t('actions.validate')}
          </Button>
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
