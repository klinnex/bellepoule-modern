/**
 * BellePoule Modern - Journée multi-épreuves (#1714) : épreuves d'une même salle
 * regroupées, pistes de la salle et groupe d'arbitres partagé.
 * Licensed under GPL-3.0
 */
import type { Weapon } from './index';

/** Journée : regroupe plusieurs épreuves qui partagent salle, pistes et arbitres */
export interface EventDay {
  id: string;
  name: string;
  /** Date ISO (AAAA-MM-JJ) */
  date: string;
  /** Nombre de pistes de la salle */
  stripCount: number;
  /** Épreuves rattachées */
  competitionIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Arbitre du groupe de la journée, avec ses armes d'arbitrage */
export interface DayReferee {
  id: string;
  eventDayId: string;
  firstName: string;
  lastName: string;
  club?: string;
  license?: string;
  category?: string;
  /** Armes d'arbitrage ; vide = toutes armes */
  weapons: Weapon[];
  createdAt: string;
  updatedAt: string;
}

export type DayRefereeInput = Partial<
  Pick<DayReferee, 'firstName' | 'lastName' | 'club' | 'license' | 'category' | 'weapons'>
>;

/** Occupation d'un arbitre de la journée (poule non terminée ou match de tableau en cours) */
export interface DayRefereeAssignment {
  dayRefereeId: string;
  competitionId: string;
  competitionTitle: string;
  /** Arbitre de l'épreuve (table referees) */
  refereeId: string;
  kind: 'pool' | 'match';
  /** Numéro de poule ou de match */
  number: number;
  strip: number | null;
}

export interface DayRefereeStatus {
  dayRefereeId: string;
  state: 'free' | 'busy';
  assignments: DayRefereeAssignment[];
}

export type DayConflictKind = 'multi_competition' | 'multi_strip' | 'weapon';

export interface DayRefereeConflict {
  dayRefereeId: string;
  kind: DayConflictKind;
  assignments: DayRefereeAssignment[];
}

export interface DaySyncResult {
  added: number;
  updated: number;
}

/** Occupation d'une piste de la salle sur toute la journée */
export interface DayStripStatus {
  strip: number;
  /** Libre si aucune épreuve n'est en cours sur cette piste */
  free: boolean;
  competitionId: string | null;
  competitionTitle: string | null;
  /** 'pool' pour une poule en cours, 'match' pour un match de tableau en cours */
  kind: 'pool' | 'match' | null;
  number: number | null;
}

/**
 * Réservation d'une piste de la salle (#1878) : épreuves et phases autorisées.
 * Par défaut tout est autorisé (`competitions` null, poules et tableau, sans limite).
 */
export interface StripRule {
  /** Épreuves autorisées ; null = toutes */
  competitions: string[] | null;
  pools: boolean;
  tableau: boolean;
  /** Tableau : seulement les tableaux de N et moins (8 = « tableau de 8 et finales ») ; null = tous */
  tableauMax: number | null;
}

/** Travail d'une épreuve qui attend une piste, proposé pour une piste libérée (#1878) */
export interface StripCandidate {
  /** Clé stable : `pool:<id>` ou `match:<id>` (préfixée par l'épreuve) */
  key: string;
  competitionId: string;
  competitionTitle: string;
  kind: 'pool' | 'match';
  /** Poule : numéro ; match : n° du match dans le tableau */
  number: number | null;
  /** Taille du tableau (match de tableau) */
  tableauSize: number | null;
  /** Tireurs (match de tableau) */
  fencers: string | null;
  /** Piste où le travail attend en file ; null = sans piste */
  fromStrip: number | null;
}

/** Piste de la salle en temps réel (serveurs distants des épreuves), avec réservation et propositions */
export interface DayStripLive {
  strip: number;
  /** Épreuve dont la piste porte une affectation en cours ; null = libre */
  competitionId: string | null;
  competitionTitle: string | null;
  rule: StripRule;
  /** Travail autorisé sur cette piste, si elle est libre */
  candidates: StripCandidate[];
}

export interface DayStripBoard {
  /** false : aucune épreuve de la journée n'a de saisie distante ouverte */
  live: boolean;
  autoAssign: boolean;
  strips: DayStripLive[];
}

/** API IPC des pistes en temps réel : occupation, réservation, propositions (#1878) */
export interface DayStripAPI {
  getStripBoard: (dayId: string) => Promise<DayStripBoard | null>;
  assignStrip: (dayId: string, strip: number, key: string) => Promise<boolean>;
  setStripRule: (dayId: string, strip: number, rule: StripRule | null) => Promise<boolean>;
  setAutoAssign: (dayId: string, on: boolean) => Promise<boolean>;
}
