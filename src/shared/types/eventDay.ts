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
