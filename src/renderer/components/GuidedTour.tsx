/**
 * BellePoule Modern - Parcours guidé de la première compétition (#1305)
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { MatchStatus } from '../../shared/types';
import {
  TOUR_RESTART_EVENT,
  TourHaloKey,
  tourHaloKey,
  TOUR_STEP_HALOS,
  TOUR_STEP_PHASE,
  TOUR_STEPS,
  TourState,
  TourFlag,
  TourStepId,
  currentTourStep,
  readTourFlag,
  tourStepDone,
  writeTourFlag,
} from './guidedTourFlags';

interface GuidedTourProps extends Omit<
  TourState,
  'poolsCount' | 'finishedPoolMatches' | 'tableauFinishedMatches'
> {
  tableauFinishedMatches?: number;
  pools: Array<{ matches: Array<{ status: MatchStatus }> }>;
  t: (key: string, params?: { [key: string]: string | number }) => string;
  /** Phase à mettre en évidence dans la navigation (null = aucune) */
  onHighlightPhase: (phase: string | null) => void;
  /** Onglet Préparation des poules ouvert (étape « Préparer et lancer les poules ») */
  prepOpen?: boolean;
}

/** Maquette animée : un tireur glissé-déposé d'une poule à l'autre (décorative) */
const DragMockup: React.FC<{ t: GuidedTourProps['t'] }> = ({ t }) => (
  <div className="tour-drag" aria-hidden="true">
    <div className="tour-drag-pool">
      <span className="tour-drag-title">{t('tour.drag_mock_pool')} A</span>
      <span className="tour-drag-fencer" />
      <span className="tour-drag-fencer" />
      <span className="tour-drag-fencer tour-drag-moving" />
    </div>
    <div className="tour-drag-pool">
      <span className="tour-drag-title">{t('tour.drag_mock_pool')} B</span>
      <span className="tour-drag-fencer" />
      <span className="tour-drag-fencer" />
      <span className="tour-drag-slot" />
    </div>
  </div>
);

/** Maquette animée de la tablette arbitre (décorative) */
const RemoteMockup: React.FC<{ t: GuidedTourProps['t'] }> = ({ t }) => (
  <div className="tour-mock" aria-hidden="true">
    <div className="tour-mock-tablet">
      <div className="tour-mock-bar">{t('tour.remote_mock_arena')}</div>
      <div className="tour-mock-scores">
        <span className="tour-mock-score tour-mock-score-a" />
        <span className="tour-mock-vs">VS</span>
        <span className="tour-mock-score tour-mock-score-b" />
      </div>
      <div className="tour-mock-btn">{t('tour.remote_mock_validate')}</div>
      <span className="tour-mock-finger" />
    </div>
  </div>
);

const HALO_CLASS = 'tour-halo';
const HALO_GREEN_CLASS = 'tour-halo-green';

/** Entoure d'un halo pulsé les boutons utiles à l'étape (suit les changements du DOM) */
function useTourHalos(step: TourHaloKey | null): void {
  useEffect(() => {
    if (!step) return;
    const halos = TOUR_STEP_HALOS[step];
    if (halos.length === 0) return;
    const marked = new Set<Element>();
    const apply = () => {
      const wanted = new Set<Element>();
      for (const h of halos) {
        const found = h.first
          ? [document.querySelector(h.selector)].filter((e): e is Element => e !== null)
          : Array.from(document.querySelectorAll(h.selector));
        for (const el of found) {
          wanted.add(el);
          if (!marked.has(el)) {
            el.classList.add(HALO_CLASS);
            if (h.green) el.classList.add(HALO_GREEN_CLASS);
            marked.add(el);
          }
        }
      }
      marked.forEach(el => {
        if (!wanted.has(el)) {
          el.classList.remove(HALO_CLASS, HALO_GREEN_CLASS);
          marked.delete(el);
        }
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      marked.forEach(el => el.classList.remove(HALO_CLASS, HALO_GREEN_CLASS));
    };
  }, [step]);
}

const GuidedTour: React.FC<GuidedTourProps> = ({
  t,
  onHighlightPhase,
  fencersCount,
  checkedInCount,
  pools,
  tableauMatchesCount,
  tableauFinishedMatches = 0,
  remoteActive,
  prepOpen = false,
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
    tableauFinishedMatches,
    remoteActive,
  };

  // Proposé une seule fois, sur une compétition vide (voir l'initialisation du drapeau)
  useEffect(() => {
    const restart = () => setFlag('active');
    window.addEventListener(TOUR_RESTART_EVENT, restart);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, restart);
  }, []);

  const reached = currentTourStep(state);
  const active = flag === 'active';

  // Navigation manuelle (Retour / Suivant) : valable tant que l'état de la compétition ne change
  // pas ; refaire l'action de l'étape (état modifié) ramène donc à la progression réelle.
  const signature = `${JSON.stringify(state)}|${prepOpen}`;
  const [manual, setManual] = useState<{ sig: string; step: TourStepId } | null>(null);
  const current = manual && manual.sig === signature ? manual.step : reached;
  const currentIndex = current ? TOUR_STEPS.indexOf(current) : TOUR_STEPS.length;
  const goBack = () => {
    if (currentIndex > 0) setManual({ sig: signature, step: TOUR_STEPS[currentIndex - 1] });
  };

  useEffect(() => {
    onHighlightPhase(active && current ? TOUR_STEP_PHASE[current] : null);
    return () => onHighlightPhase(null);
  }, [active, current, onHighlightPhase]);

  useTourHalos(active ? tourHaloKey(current, prepOpen) : null);

  const close = useCallback(() => {
    writeTourFlag('done');
    setFlag('done');
  }, []);
  const lastStep = current === null || currentIndex === TOUR_STEPS.length - 1;
  const goNext = () => {
    if (lastStep) close();
    else setManual({ sig: signature, step: TOUR_STEPS[currentIndex + 1] });
  };

  if (!active) return null;

  const doneCount = TOUR_STEPS.filter(s => tourStepDone(s, state)).length;
  const finished = reached === null && current === null;

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
        {finished
          ? t('tour.finished_hint')
          : t(current === 'pools' && prepOpen ? 'tour.hint_launch' : `tour.hint_${current}`)}
      </p>
      {current === 'pools' && prepOpen && (
        <>
          <DragMockup t={t} />
          <p className="guided-tour-hint">{t('tour.prep_explain')}</p>
        </>
      )}
      {current === 'remote' && (
        <>
          <RemoteMockup t={t} />
          <p className="guided-tour-hint">{t('tour.remote_explain')}</p>
        </>
      )}
      <progress
        className="guided-tour-progress"
        value={doneCount}
        max={TOUR_STEPS.length}
        aria-hidden="true"
      />
      <div className="guided-tour-actions">
        <button
          type="button"
          className="btn btn-secondary guided-tour-action guided-tour-back"
          onClick={goBack}
          disabled={currentIndex === 0}
        >
          {t('tour.back')}
        </button>
        <button type="button" className="btn btn-secondary guided-tour-action" onClick={goNext}>
          {lastStep ? t('tour.close') : t('tour.next')}
        </button>
      </div>
    </aside>
  );
};

export default React.memo(GuidedTour);
