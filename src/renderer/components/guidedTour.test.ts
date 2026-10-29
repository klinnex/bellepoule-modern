// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TOUR_STORAGE_KEY,
  TourState,
  currentTourStep,
  readTourFlag,
  tourStepDone,
  writeTourFlag,
} from './guidedTour';

const empty: TourState = {
  fencersCount: 0,
  checkedInCount: 0,
  poolsCount: 0,
  finishedPoolMatches: 0,
  tableauMatchesCount: 0,
};

describe('guidedTour', () => {
  beforeEach(() => localStorage.clear());

  it('commence par l’ajout des tireurs sur une compétition vide', () => {
    expect(currentTourStep(empty)).toBe('fencers');
  });

  it('valide les étapes selon l’état de la compétition', () => {
    expect(tourStepDone('fencers', { ...empty, fencersCount: 3 })).toBe(true);
    expect(tourStepDone('checkin', { ...empty, fencersCount: 3 })).toBe(false);
    expect(currentTourStep({ ...empty, fencersCount: 8, checkedInCount: 8 })).toBe('pools');
    expect(currentTourStep({ ...empty, fencersCount: 8, checkedInCount: 8, poolsCount: 2 })).toBe(
      'scores'
    );
  });

  it('retourne null quand toutes les étapes sont faites', () => {
    expect(
      currentTourStep({
        fencersCount: 8,
        checkedInCount: 8,
        poolsCount: 2,
        finishedPoolMatches: 5,
        tableauMatchesCount: 7,
      })
    ).toBeNull();
  });

  it('mémorise le drapeau et ignore les valeurs invalides', () => {
    expect(readTourFlag()).toBeNull();
    writeTourFlag('done');
    expect(readTourFlag()).toBe('done');
    localStorage.setItem(TOUR_STORAGE_KEY, 'n’importe quoi');
    expect(readTourFlag()).toBeNull();
    writeTourFlag(null);
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
  });
});
