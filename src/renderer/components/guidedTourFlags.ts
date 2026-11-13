/**
 * BellePoule Modern - Parcours guidé (logique pure)
 * Licensed under GPL-3.0
 */

export type TourStepId = 'fencers' | 'checkin' | 'pools' | 'remote' | 'scores' | 'tableau' | 'edit';

/** Phase de navigation à mettre en évidence pour chaque étape */
export const TOUR_STEP_PHASE: Record<TourStepId, string | null> = {
  fencers: 'checkin',
  checkin: 'checkin',
  // Étape 4 : le bouton « Générer les poules » pulse déjà, l'onglet Appel n'a plus à pulser (#1305)
  pools: null,
  remote: 'remote',
  scores: 'pools',
  tableau: 'tableau',
  edit: 'tableau',
};

/** La saisie distante (optionnelle) vient en premier */
export const TOUR_STEPS: TourStepId[] = [
  'remote',
  'fencers',
  'checkin',
  'pools',
  'scores',
  'tableau',
  'edit',
];

export const TOUR_STORAGE_KEY = 'bellepoule-guided-tour';
export const TOUR_RESTART_EVENT = 'bellepoule:restart-tour';

export type TourFlag = 'active' | 'done';

export interface TourState {
  fencersCount: number;
  checkedInCount: number;
  poolsCount: number;
  /** Poules lancées (clic sur « Lancer les poules » dans la préparation) */
  poolsLaunched: boolean;
  finishedPoolMatches: number;
  tableauMatchesCount: number;
  /** Matchs de tableau (hors exempts) dont le score est saisi */
  tableauFinishedMatches: number;
  /** Saisie distante démarrée (serveur tablettes actif) */
  remoteActive: boolean;
}

/** Une étape est validée dès que l'état de la compétition le montre */
export function tourStepDone(step: TourStepId, s: TourState): boolean {
  switch (step) {
    case 'fencers':
      return s.fencersCount > 0;
    case 'checkin':
      return s.checkedInCount > 0;
    case 'pools':
      // Validée au clic sur « Lancer les poules » (ou si la suite est déjà engagée)
      return s.poolsLaunched || s.finishedPoolMatches > 0 || s.tableauMatchesCount > 0;
    case 'remote':
      // Optionnelle : validée aussi dès que des tireurs existent (étape passée) ou des scores saisis
      return s.remoteActive || s.fencersCount > 0 || s.finishedPoolMatches > 0;
    case 'scores':
      return s.finishedPoolMatches > 0;
    case 'tableau':
      return s.tableauMatchesCount > 0;
    case 'edit':
      return s.tableauFinishedMatches > 0;
  }
}

/** Boutons à entourer d'un halo pulsé pour chaque étape (attributs data-tour) */
export interface TourHalo {
  selector: string;
  /** true = seul le premier élément trouvé est entouré */
  first?: boolean;
  /** halo vert (action de validation) au lieu de bleu */
  green?: boolean;
}

/** Clé de halos : une étape, ou l'onglet Préparation ouvert pendant l'étape des poules */
export type TourHaloKey = TourStepId | 'launch';

export function tourHaloKey(step: TourStepId | null, prepOpen: boolean): TourHaloKey | null {
  return step === 'pools' && prepOpen ? 'launch' : step;
}

export const TOUR_STEP_HALOS: Record<TourHaloKey, TourHalo[]> = {
  launch: [{ selector: '[data-tour="launch-pools"]', green: true }],
  fencers: [{ selector: '[data-tour="add-fencer"]' }, { selector: '[data-tour="import"]' }],
  checkin: [
    { selector: '[data-tour="check-in-all"]' },
    { selector: '[data-tour="check-in"]', first: true },
  ],
  pools: [{ selector: '[data-tour="generate-pools"]', green: true }],
  // Bouton de démarrage de la saisie distante pulsé (#1305)
  // Bouton « Saisie distante / Piste » de la barre de compétition + « Démarrer » (#1305)
  remote: [{ selector: '[data-tour="open-remote"]' }, { selector: '[data-tour="start-remote"]' }],
  scores: [{ selector: '[data-tour="pool-cell"]', first: true }],
  tableau: [{ selector: '[data-tour="view-ranking"]' }, { selector: '[data-tour="go-tableau"]' }],
  edit: [
    { selector: '[data-tour="match-arena"]', first: true },
    { selector: '[data-tour="match-referee"]', first: true },
  ],
};

/** Première étape non validée (étapes validées dans l'ordre), ou null si tout est fait */
export function currentTourStep(s: TourState): TourStepId | null {
  for (const step of TOUR_STEPS) {
    if (!tourStepDone(step, s)) return step;
  }
  return null;
}

export function readTourFlag(): TourFlag | null {
  try {
    const v = localStorage.getItem(TOUR_STORAGE_KEY);
    return v === 'active' || v === 'done' ? v : null;
  } catch {
    return null;
  }
}

export function writeTourFlag(flag: TourFlag | null): void {
  try {
    if (flag) localStorage.setItem(TOUR_STORAGE_KEY, flag);
    else localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // stockage indisponible : le parcours reste simplement non mémorisé
  }
}

/** Relance le parcours (paramètres) : efface le drapeau et prévient les vues ouvertes */
export function restartGuidedTour(): void {
  writeTourFlag('active');
  window.dispatchEvent(new Event(TOUR_RESTART_EVENT));
}
