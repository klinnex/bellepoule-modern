/**
 * BellePoule Modern - Parcours guidé de la première compétition (#1305)
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { MatchStatus } from '../../shared/types';
import {
  TOUR_RESTART_EVENT,
  TOUR_STEP_PHASE,
  TOUR_STEPS,
  TourState,
  TourFlag,
  TourStepId,
  currentTourStep,
  readTourFlag,
  tourStepDone,
  writeTourFlag,
} from './guidedTour';

interface GuidedTourProps extends Omit<TourState, 'poolsCount' | 'finishedPoolMatches'> {
  pools: Array<{ matches: Array<{ status: MatchStatus }> }>;
  t: (key: string, params?: { [key: string]: string | number }) => string;
  /** Phase à mettre en évidence dans la navigation (null = aucune) */
  onHighlightPhase: (phase: string | null) => void;
}

const GuidedTour: React.FC<GuidedTourProps> = ({
  t,
  onHighlightPhase,
  fencersCount,
  checkedInCount,
  pools,
  tableauMatchesCount,
}) => {
  const [flag, setFlag] = useState<TourFlag | null>(() => {
    const stored = readTourFlag();
    if (stored === null && fencersCount === 0) {
      writeTourFlag('active');
      return 'active';
    }
    return stored;
  });
  const state: TourState = {
    fencersCount,
    checkedInCount,
    poolsCount: pools.length,
    finishedPoolMatches: pools.reduce(
      (n, p) => n + p.matches.filter(m => m.status === MatchStatus.FINISHED).length,
      0
    ),
    tableauMatchesCount,
  };

  // Proposé une seule fois, sur une compétition vide (voir l'initialisation du drapeau)
  useEffect(() => {
    const restart = () => setFlag('active');
    window.addEventListener(TOUR_RESTART_EVENT, restart);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, restart);
  }, []);

  const current = currentTourStep(state);
  const active = flag === 'active';

  useEffect(() => {
    onHighlightPhase(active && current ? TOUR_STEP_PHASE[current] : null);
    return () => onHighlightPhase(null);
  }, [active, current, onHighlightPhase]);

  const close = useCallback(() => {
    writeTourFlag('done');
    setFlag('done');
  }, []);

  if (!active) return null;

  const doneCount = TOUR_STEPS.filter(s => tourStepDone(s, state)).length;
  const finished = current === null;

  return (
    <aside className="guided-tour" role="status" aria-live="polite" aria-label={t('tour.title')}>
      <div className="guided-tour-header">
        <Sparkles size={16} aria-hidden="true" />
        <strong>{finished ? t('tour.finished_title') : t('tour.title')}</strong>
        <button
          type="button"
          className="guided-tour-skip"
          onClick={close}
          aria-label={finished ? t('tour.close') : t('tour.skip')}
          title={finished ? t('tour.close') : t('tour.skip')}
        >
          <X size={14} />
        </button>
      </div>
      <ol className="guided-tour-steps">
        {TOUR_STEPS.map((step: TourStepId) => {
          const done = tourStepDone(step, state);
          const isCurrent = step === current;
          return (
            <li
              key={step}
              className={`guided-tour-step${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="guided-tour-bullet" aria-hidden="true">
                {done ? <Check size={12} /> : TOUR_STEPS.indexOf(step) + 1}
              </span>
              <span>{t(`tour.step_${step}`)}</span>
            </li>
          );
        })}
      </ol>
      <p className="guided-tour-hint">
        {finished ? t('tour.finished_hint') : t(`tour.hint_${current}`)}
      </p>
      <progress
        className="guided-tour-progress"
        value={doneCount}
        max={TOUR_STEPS.length}
        aria-hidden="true"
      />
      <button type="button" className="btn btn-secondary guided-tour-action" onClick={close}>
        {finished ? t('tour.close') : t('tour.skip')}
      </button>
    </aside>
  );
};

export default React.memo(GuidedTour);
