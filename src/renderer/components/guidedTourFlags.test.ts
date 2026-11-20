// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TOUR_STORAGE_KEY,
  TOUR_STEPS,
  TourState,
  currentTourStep,
  readTourFlag,
  tourStepDone,
  writeTourFlag,
} from './guidedTourFlags';

const empty: TourState = {
  fencersCount: 0,
  checkedInCount: 0,
  poolsCount: 0,
  poolsLaunched: false,
  finishedPoolMatches: 0,
  tableauMatchesCount: 0,
  tableauFinishedMatches: 0,
  remoteActive: false,
};

describe('guidedTour', () => {
  beforeEach(() => localStorage.clear());

  it('commence par la saisie distante (optionnelle) sur une compétition vide', () => {
    expect(currentTourStep(empty)).toBe('remote');
    expect(TOUR_STEPS[0]).toBe('remote');
  });

  it('valide les étapes selon l’état de la compétition', () => {
    expect(tourStepDone('fencers', { ...empty, fencersCount: 3 })).toBe(true);
    expect(tourStepDone('checkin', { ...empty, fencersCount: 3 })).toBe(false);
    expect(currentTourStep({ ...empty, fencersCount: 3 })).toBe('checkin');
    expect(currentTourStep({ ...empty, fencersCount: 8, checkedInCount: 8 })).toBe('pools');
  });

  it('la saisie distante est validée par le serveur actif ou en passant à la suite', () => {
    expect(tourStepDone('remote', empty)).toBe(false);
    expect(tourStepDone('remote', { ...empty, remoteActive: true })).toBe(true);
    expect(currentTourStep({ ...empty, remoteActive: true })).toBe('fencers');
    expect(tourStepDone('remote', { ...empty, fencersCount: 2 })).toBe(true);
  });

  it('l’étape poules n’est validée qu’au clic sur Lancer les poules', () => {
    const prepared = { ...empty, fencersCount: 8, checkedInCount: 8, poolsCount: 2 };
    expect(tourStepDone('pools', prepared)).toBe(false);
    expect(currentTourStep(prepared)).toBe('pools');
    expect(tourStepDone('pools', { ...prepared, poolsLaunched: true })).toBe(true);
    expect(currentTourStep({ ...prepared, poolsLaunched: true })).toBe('scores');
    expect(currentTourStep({ ...prepared, finishedPoolMatches: 1 })).toBe('tableau');
  });

  it('retourne null quand toutes les étapes sont faites', () => {
    const full = {
      fencersCount: 8,
      checkedInCount: 8,
      poolsCount: 2,
      poolsLaunched: true,
      finishedPoolMatches: 5,
      tableauMatchesCount: 7,
      tableauFinishedMatches: 0,
      remoteActive: false,
    };
    expect(currentTourStep(full)).toBe('edit');
    expect(currentTourStep({ ...full, tableauFinishedMatches: 1 })).toBeNull();
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
