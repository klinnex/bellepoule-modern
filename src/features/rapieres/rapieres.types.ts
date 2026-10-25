/**
 * BellePoule Modern - Tournoi des rapières (mode spécial, arme « À la carte ») (#1118)
 * Binômes de deux tireurs gérés comme les tireurs d'une compétition classique :
 * chaque équipe est un tireur (nom = nom d'équipe, club = niveau), la composition est
 * enregistrée dans l'état de session (clé `rapieres`). Poules jouées en vagues.
 * Licensed under GPL-3.0
 */

export type RapieresLevel = 'beginner' | 'intermediate' | 'expert';

export type RapieresAgeCategory = 'M20' | 'SENIOR' | 'V1' | 'V2' | 'V3' | 'V4' | 'HANDI';

export const RAPIERES_LEVELS: RapieresLevel[] = ['beginner', 'intermediate', 'expert'];

export const RAPIERES_AGE_CATEGORIES: RapieresAgeCategory[] = [
  'M20',
  'SENIOR',
  'V1',
  'V2',
  'V3',
  'V4',
  'HANDI',
];

/** Sexe d'un tireur (absent = non renseigné) */
export type RapieresGender = 'M' | 'F';

export const RAPIERES_GENDERS: RapieresGender[] = ['M', 'F'];

export interface RapieresFencer {
  firstName: string;
  lastName: string;
  category: RapieresAgeCategory;
  gender?: RapieresGender;
}

/** Composition d'une équipe (tireur de la compétition portant le nom d'équipe) */
export interface RapieresTeamInfo {
  level: RapieresLevel;
  fencers: [RapieresFencer, RapieresFencer];
}

export interface RapieresSession {
  version: 2;
  /** Composition par id de tireur (équipe) */
  teams: Record<string, RapieresTeamInfo>;
  /** Dernière vague lancée par le DT (0 = aucune) */
  launchedWave: number;
  /** Vagues arrêtées avant leur terme par le DT : passage au classement */
  wavesEnded: boolean;
}

/** État de la première version (vue dédiée), migré à l'ouverture */
export interface RapieresLegacyState {
  version: 1;
  teams: {
    id: string;
    name: string;
    level: RapieresLevel;
    fencers: [RapieresFencer, RapieresFencer];
    status?: 'not_checked_in' | 'checked_in' | 'abandoned' | 'forfait' | 'excluded';
  }[];
}

/** Composition vide (équipe sans composition enregistrée) */
export const emptyRapieresTeamInfo = (): RapieresTeamInfo => ({
  level: 'beginner',
  fencers: [
    { lastName: '', firstName: '', category: 'SENIOR' },
    { lastName: '', firstName: '', category: 'SENIOR' },
  ],
});

export const createRapieresSession = (): RapieresSession => ({
  version: 2,
  teams: {},
  launchedWave: 0,
  wavesEnded: false,
});
