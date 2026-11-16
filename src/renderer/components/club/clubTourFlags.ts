/**
 * BellePoule Modern - Parcours de première connexion du Mode Club (#1872), logique pure.
 * Étapes validées par l'état réel du club : nom, logo (facultatif), membres, cartes.
 * Licensed under GPL-3.0
 */
import type { TourHalo } from '../guidedTourFlags';

export type ClubTourStepId = 'identity' | 'logo' | 'members' | 'cards';

export const CLUB_TOUR_STEPS: ClubTourStepId[] = ['identity', 'logo', 'members', 'cards'];

export const CLUB_TOUR_KEY = 'bellepoule-club-tour';
export const CLUB_CARDS_PRINTED_KEY = 'bellepoule-club-cards-printed';
export const CLUB_TOUR_RESTART_EVENT = 'bellepoule:restart-club-tour';

export type ClubTourFlag = 'active' | 'done';

export interface ClubTourState {
  hasName: boolean;
  hasLogo: boolean;
  membersCount: number;
  cardsPrinted: boolean;
}

export function clubTourStepDone(step: ClubTourStepId, s: ClubTourState): boolean {
  switch (step) {
    case 'identity':
      return s.hasName;
    case 'logo':
      // Facultatif : validé aussi dès que l'annuaire est commencé
      return s.hasLogo || s.membersCount > 0;
    case 'members':
      return s.membersCount > 0;
    case 'cards':
      return s.cardsPrinted;
  }
}

export function currentClubTourStep(s: ClubTourState): ClubTourStepId | null {
  return CLUB_TOUR_STEPS.find(step => !clubTourStepDone(step, s)) ?? null;
}

/** Démarrage automatique : première ouverture d'un club encore vide */
export function shouldAutoStartClubTour(flag: ClubTourFlag | null, s: ClubTourState): boolean {
  return flag === null && !s.hasName && s.membersCount === 0;
}

/** Éléments mis en évidence (attributs data-tour) ; constantes stables pour useTourHalos */
export const CLUB_TOUR_HALOS: Record<ClubTourStepId, TourHalo[]> = {
  identity: [{ selector: '[data-tour="club-name"]' }],
  logo: [{ selector: '[data-tour="club-logo"]' }],
  members: [{ selector: '[data-tour="club-add-member"]', green: true }],
  cards: [{ selector: '[data-tour="club-print-cards"]', green: true }],
};

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // stockage indisponible : parcours non mémorisé
  }
};

export function readClubTourFlag(): ClubTourFlag | null {
  const v = read(CLUB_TOUR_KEY);
  return v === 'active' || v === 'done' ? v : null;
}

export function writeClubTourFlag(flag: ClubTourFlag | null): void {
  write(CLUB_TOUR_KEY, flag);
}

export function readCardsPrinted(): boolean {
  return read(CLUB_CARDS_PRINTED_KEY) === '1';
}

export function markCardsPrinted(): void {
  write(CLUB_CARDS_PRINTED_KEY, '1');
}

/** Relance le parcours (bouton « Guide » du club) */
export function restartClubTour(): void {
  writeClubTourFlag('active');
  window.dispatchEvent(new Event(CLUB_TOUR_RESTART_EVENT));
}
