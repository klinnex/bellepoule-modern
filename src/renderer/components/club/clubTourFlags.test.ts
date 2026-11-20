import { describe, it, expect } from 'vitest';
import {
  CLUB_TOUR_STEPS,
  clubTourStepDone,
  currentClubTourStep,
  shouldAutoStartClubTour,
  type ClubTourState,
} from './clubTourFlags';

const empty: ClubTourState = {
  hasName: false,
  hasLogo: false,
  membersCount: 0,
  cardsPrinted: false,
};

describe('parcours Mode Club (#1872)', () => {
  it('progression : nom → logo → membres → cartes', () => {
    expect(currentClubTourStep(empty)).toBe('identity');
    expect(currentClubTourStep({ ...empty, hasName: true })).toBe('logo');
    expect(currentClubTourStep({ ...empty, hasName: true, hasLogo: true })).toBe('members');
    expect(currentClubTourStep({ ...empty, hasName: true, membersCount: 3 })).toBe('cards');
    expect(
      currentClubTourStep({ hasName: true, hasLogo: false, membersCount: 3, cardsPrinted: true })
    ).toBeNull();
  });

  it('logo facultatif : validé par les membres', () => {
    expect(clubTourStepDone('logo', { ...empty, membersCount: 1 })).toBe(true);
    expect(clubTourStepDone('logo', empty)).toBe(false);
  });

  it('démarrage auto : club vide jamais guidé', () => {
    expect(shouldAutoStartClubTour(null, empty)).toBe(true);
    expect(shouldAutoStartClubTour('done', empty)).toBe(false);
    expect(shouldAutoStartClubTour(null, { ...empty, hasName: true })).toBe(false);
    expect(shouldAutoStartClubTour(null, { ...empty, membersCount: 2 })).toBe(false);
  });

  it('4 étapes', () => {
    expect(CLUB_TOUR_STEPS).toHaveLength(4);
  });
});
