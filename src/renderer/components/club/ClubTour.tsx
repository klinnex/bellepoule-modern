/**
 * BellePoule Modern - Parcours de première connexion du Mode Club (#1872).
 * Même présentation que le parcours de la première compétition (classes .guided-tour*).
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Tooltip } from '../Tooltip';
import { useTourHalos } from '../useTourHalos';
import {
  CLUB_TOUR_HALOS,
  CLUB_TOUR_RESTART_EVENT,
  CLUB_TOUR_STEPS,
  type ClubTourFlag,
  type ClubTourState,
  type ClubTourStepId,
  clubTourStepDone,
  currentClubTourStep,
  readClubTourFlag,
  shouldAutoStartClubTour,
  writeClubTourFlag,
} from './clubTourFlags';

interface ClubTourProps extends ClubTourState {
  /** Données du club chargées : évite de démarrer sur un état vide transitoire */
  ready: boolean;
}

export const ClubTour: React.FC<ClubTourProps> = ({ ready, ...state }) => {
  const { t } = useTranslation();
  const [flag, setFlag] = useState<ClubTourFlag | null>(readClubTourFlag);

  // Démarrage automatique (club vide, jamais guidé) : état ajusté au rendu, mémorisé ensuite
  if (ready && shouldAutoStartClubTour(flag, state)) setFlag('active');
  useEffect(() => {
    if (flag === 'active') writeClubTourFlag('active');
  }, [flag]);

  useEffect(() => {
    const restart = () => setFlag('active');
    window.addEventListener(CLUB_TOUR_RESTART_EVENT, restart);
    return () => window.removeEventListener(CLUB_TOUR_RESTART_EVENT, restart);
  }, []);

  const reached = currentClubTourStep(state);
  // Retour / Suivant : navigation manuelle tant que l'état du club ne change pas
  const signature = JSON.stringify(state);
  const [manual, setManual] = useState<{ sig: string; step: ClubTourStepId | null } | null>(null);
  const current = manual && manual.sig === signature ? manual.step : reached;
  const index = current ? CLUB_TOUR_STEPS.indexOf(current) : CLUB_TOUR_STEPS.length;
  const active = flag === 'active';

  useTourHalos(active && current ? CLUB_TOUR_HALOS[current] : null);

  const close = useCallback(() => {
    writeClubTourFlag('done');
    setFlag('done');
  }, []);

  if (!active) return null;

  const finished = current === null;
  const lastStep = finished || index === CLUB_TOUR_STEPS.length - 1;
  const doneCount = CLUB_TOUR_STEPS.filter(s => clubTourStepDone(s, state)).length;
  const goBack = () => {
    if (index > 0) setManual({ sig: signature, step: CLUB_TOUR_STEPS[index - 1] });
  };
  const goNext = () => {
    if (lastStep) close();
    else setManual({ sig: signature, step: CLUB_TOUR_STEPS[index + 1] });
  };

  return (
    <aside
      className="guided-tour"
      role="status"
      aria-live="polite"
      aria-label={t('clubTour.title')}
    >
      <div className="guided-tour-header">
        <Sparkles size={16} aria-hidden="true" />
        <strong>{finished ? t('clubTour.finished_title') : t('clubTour.title')}</strong>
        <Tooltip content={finished ? t('clubTour.close') : t('clubTour.skip')}>
          <Button
            variant="ghost"
            size="sm"
            className="guided-tour-skip"
            icon={<X size={14} aria-hidden="true" />}
            aria-label={finished ? t('clubTour.close') : t('clubTour.skip')}
            onClick={close}
          />
        </Tooltip>
      </div>
      {index === 0 && !finished && <p className="guided-tour-hint">{t('clubTour.welcome')}</p>}
      <ol className="guided-tour-steps">
        {CLUB_TOUR_STEPS.map((step, i) => {
          const done = clubTourStepDone(step, state);
          const isCurrent = step === current;
          return (
            <li
              key={step}
              className={`guided-tour-step${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="guided-tour-bullet" aria-hidden="true">
                {done ? <Check size={12} /> : i + 1}
              </span>
              <span>{t(`clubTour.step_${step}`)}</span>
            </li>
          );
        })}
      </ol>
      <p className="guided-tour-hint">
        {finished ? t('clubTour.finished_hint') : t(`clubTour.hint_${current}`)}
      </p>
      <progress
        className="guided-tour-progress"
        value={doneCount}
        max={CLUB_TOUR_STEPS.length}
        aria-hidden="true"
      />
      <div className="guided-tour-actions">
        <Button
          className="guided-tour-action guided-tour-back"
          onClick={goBack}
          disabled={index === 0}
        >
          {t('clubTour.back')}
        </Button>
        <Button className="guided-tour-action" onClick={goNext}>
          {lastStep ? t('clubTour.close') : t('clubTour.next')}
        </Button>
      </div>
    </aside>
  );
};
