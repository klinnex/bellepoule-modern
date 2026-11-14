/**
 * BellePoule Modern - Rendu de la modale de saisie du score d'un match de poule
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Coins } from 'lucide-react';
import { Icon } from '../../components/common/Icon';
import { MedicalCrossIcon } from '../../components/common/MedicalCrossIcon';
import SpecialStatusPanel from '../../components/common/SpecialStatusPanel';
import { specialStatusFencers } from '../../components/pool/poolSpecialStatus';
import type { PoolViewProps } from '../../components/pool/poolViewTypes';
import { usePoolViewActions } from './usePoolViewActions';
import { usePoolViewInput } from './usePoolViewInput';
import { usePoolViewState } from './usePoolViewState';
import {
  SPECIAL_BTN,
  SCORE_ROW,
  SCORE_MODAL,
  nameCol,
  nameLast,
  nameFirst,
  victoryBtn,
  SCORE_SEP,
  SPECIAL_ROW,
  FOOTER_RIGHT,
  scoreInput,
} from '../../components/poolView.styles';
import TiebreakerAnimation from '../../components/TiebreakerAnimation';
import { Button } from '../../components/common/Button';
import { useAutoFitHeight } from '../useAutoFitHeight';

type Ctx = PoolViewProps &
  ReturnType<typeof usePoolViewState> &
  ReturnType<typeof usePoolViewInput> &
  ReturnType<typeof usePoolViewActions>;

/** Rendu de la modale de saisie du score d'un match de poule (extrait de PoolViewComponent, #1599) */
export function usePoolScoreModal(ctx: Ctx) {
  const {
    editingMatch,
    pool,
    scoreTrapRef,
    modalRef,
    t,
    tieByVictory,
    isLaserSabre,
    editScoreA,
    editScoreB,
    setShowPriorityDraw,
    priorityPick,
    showPriorityDraw,
    setPriorityPick,
    isMatchInverted,
    setVictoryA,
    victoryA,
    setVictoryB,
    maxScore,
    setEditScoreA,
    handleScoreSubmitRef,
    setEditScoreB,
    victoryB,
    pendingSpecialStatus,
    applySpecialStatus,
    setPendingSpecialStatus,
    handleSpecialStatus,
    onMatchCancel,
    closeAndResetScoreModal,
    showTieChooser,
    chooseTieWinner,
    setShowTieChooser,
    setEditingMatch,
    setIsMatchInverted,
    handleScoreSubmit,
  } = ctx;

  // Agrandissement automatique quand le contenu s'allonge (égalité, statut spécial, #1826)
  useAutoFitHeight(modalRef, editingMatch !== null);

  // Render Score Modal
  const renderScoreModal = () => {
    if (editingMatch === null) return null;

    const match = pool.matches[editingMatch];

    return (
      // Clic hors de la fenêtre : ne ferme pas (#1115)
      <div className="modal-overlay" ref={scoreTrapRef}>
        <div
          ref={modalRef}
          className="modal resizable"
          style={SCORE_MODAL}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-header is-0430c2">
            <h3 className="modal-title">{t('poolView.quick_score')}</h3>
          </div>
          <div className="modal-body is-a48125">
            {showPriorityDraw &&
              pool.matches[editingMatch]?.fencerA &&
              pool.matches[editingMatch]?.fencerB && (
                <TiebreakerAnimation
                  fencerA={pool.matches[editingMatch]!.fencerA!}
                  fencerB={pool.matches[editingMatch]!.fencerB!}
                  onComplete={winner => {
                    setPriorityPick(winner);
                    setShowPriorityDraw(false);
                  }}
                />
              )}
            {/* Ligne unique avec les deux tireurs côte à côte */}
            <div style={SCORE_ROW}>
              {/* Tireur gauche (ligne dans la grille) */}
              {(() => {
                const f = isMatchInverted ? match.fencerB : match.fencerA;
                return (
                  <div style={nameCol('flex-end')}>
                    <div style={nameLast('right')}>{f?.lastName}</div>
                    <div style={nameFirst('right')}>
                      {f?.firstName} {f?.club && `(${f.club})`}
                    </div>
                  </div>
                );
              })()}

              {/* Bouton Victoire (égalité) A */}
              {tieByVictory && (
                <button
                  type="button"
                  onClick={() => {
                    setVictoryA(!victoryA);
                    setVictoryB(false);
                  }}
                  style={victoryBtn(victoryA)}
                >
                  V
                </button>
              )}

              {/* Input Score A */}
              <input
                type="number"
                className="form-input"
                style={scoreInput(
                  (parseInt(editScoreA, 10) || 0) > (maxScore || match?.maxScore || 999)
                )}
                value={editScoreA}
                onChange={e => setEditScoreA(e.target.value)}
                min="0"
                max={maxScore || match?.maxScore || undefined}
                autoFocus
                data-autofocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScoreSubmitRef.current();
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
              <span style={SCORE_SEP}>:</span>

              {/* Input Score B */}
              <input
                type="number"
                className="form-input"
                style={scoreInput(
                  (parseInt(editScoreB, 10) || 0) > (maxScore || match?.maxScore || 999)
                )}
                value={editScoreB}
                onChange={e => setEditScoreB(e.target.value)}
                min="0"
                max={maxScore || match?.maxScore || undefined}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScoreSubmitRef.current();
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

              {/* Bouton Victoire (égalité) B */}
              {tieByVictory && (
                <button
                  type="button"
                  onClick={() => {
                    setVictoryB(!victoryB);
                    setVictoryA(false);
                  }}
                  style={victoryBtn(victoryB)}
                >
                  V
                </button>
              )}

              {/* Tireur droite (colonne dans la grille) */}
              {(() => {
                const f = isMatchInverted ? match.fencerA : match.fencerB;
                return (
                  <div style={nameCol('flex-start')}>
                    <div style={nameLast('left')}>{f?.lastName}</div>
                    <div style={nameFirst('left')}>
                      {f?.firstName} {f?.club && `(${f.club})`}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Info égalité sabre laser */}
            {isLaserSabre && (
              <p className="text-sm text-muted is-b92227">{t('poolView.tie_hint')}</p>
            )}

            {/* Égalité olympique / rapières : tirage du prioritaire (#1442), sous les scores comme au tableau (#1826) */}
            {tieByVictory && !isLaserSabre && (
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {editScoreA !== '' &&
                  editScoreB !== '' &&
                  (parseInt(editScoreA, 10) || 0) === (parseInt(editScoreB, 10) || 0) &&
                  !!pool.matches[editingMatch]?.fencerA &&
                  !!pool.matches[editingMatch]?.fencerB && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        justifyContent: 'center', // bouton centré dans la carte (#1826)
                        flexWrap: 'wrap',
                      }}
                    >
                      <Button
                        type="button"
                        variant="warning"
                        onClick={() => setShowPriorityDraw(true)}
                      >
                        <Icon icon={Coins} /> {t('poolView.priority_draw')}
                      </Button>
                      {priorityPick && (
                        <span className="text-muted">
                          {t('poolView.priority_holder', {
                            name: (() => {
                              const f =
                                priorityPick === 'A'
                                  ? pool.matches[editingMatch]?.fencerA
                                  : pool.matches[editingMatch]?.fencerB;
                              return f ? `${f.lastName} ${f.firstName}`.trim() : '';
                            })(),
                          })}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            )}
            {/* Choix du tireur concerné : même affichage que le tableau, sans pop-up (#1418) */}
            {pendingSpecialStatus !== null && (
              <SpecialStatusPanel
                status={pendingSpecialStatus}
                fencers={specialStatusFencers(
                  pool.matches[editingMatch][isMatchInverted ? 'fencerB' : 'fencerA'],
                  pool.matches[editingMatch][isMatchInverted ? 'fencerA' : 'fencerB']
                )}
                onConfirm={(id, blackCard) => {
                  const m = pool.matches[editingMatch];
                  const leftId = (isMatchInverted ? m.fencerB : m.fencerA)?.id;
                  applySpecialStatus(id === leftId ? 'left' : 'right', blackCard);
                }}
                onCancel={() => setPendingSpecialStatus(null)}
              />
            )}
            {/* Boutons spéciaux sur une ligne */}
            {pendingSpecialStatus === null && (
              <div style={SPECIAL_ROW}>
                <Button
                  variant="warning"
                  onClick={() => handleSpecialStatus('abandon')}
                  style={SPECIAL_BTN}
                >
                  <MedicalCrossIcon /> {t('poolView.btn_abandon')}
                </Button>
                <Button
                  variant="warning"
                  onClick={() => handleSpecialStatus('forfait')}
                  style={SPECIAL_BTN}
                >
                  {t('poolView.btn_forfeit')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleSpecialStatus('exclusion')}
                  style={SPECIAL_BTN}
                >
                  {t('poolView.btn_exclusion')}
                </Button>
                {onMatchCancel && (
                  <Button
                    onClick={() => {
                      if (editingMatch === null) return;
                      onMatchCancel(editingMatch);
                      closeAndResetScoreModal();
                    }}
                    style={SPECIAL_BTN}
                  >
                    {t('poolView.btn_cancel_match')}
                  </Button>
                )}
              </div>
            )}
          </div>
          {showTieChooser ? (
            <div className="modal-footer" style={FOOTER_RIGHT}>
              <span className="text-muted">{t('poolView.tie_choose_winner')}</span>
              {(['left', 'right'] as const).map(side => {
                // Gauche affichée = fencerB si la saisie est inversée
                const f =
                  (side === 'left') !== isMatchInverted
                    ? pool.matches[editingMatch]?.fencerA
                    : pool.matches[editingMatch]?.fencerB;
                return (
                  <Button key={side} variant="primary" onClick={() => chooseTieWinner(side)}>
                    V · {f ? `${f.lastName} ${f.firstName}`.trim() : ''}
                  </Button>
                );
              })}
              <Button variant="warning" onClick={() => chooseTieWinner('none')}>
                {t('poolView.tie_none')}
              </Button>
              <Button onClick={() => setShowTieChooser(false)}>{t('actions.cancel')}</Button>
            </div>
          ) : (
            <div className="modal-footer" style={FOOTER_RIGHT}>
              <Button
                onClick={() => {
                  setEditingMatch(null);
                  setIsMatchInverted(false);
                }}
              >
                {t('actions.cancel')}
              </Button>
              <Button variant="primary" onClick={handleScoreSubmit}>
                {t('actions.validate')}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return {
    renderScoreModal,
  };
}
