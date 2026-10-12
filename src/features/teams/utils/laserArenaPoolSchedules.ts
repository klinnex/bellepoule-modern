/**
 * BellePoule Modern - Laser Sabre "arena" team format
 * Calendriers de poule figés du règlement (section "Déroulement de la
 * compétition") pour 8 et 12 équipes : 3 poules A/B/C de 4 (12 équipes,
 * 4 arènes) ou 2 poules A/B de 4 (8 équipes, 3 arènes), avec désignation
 * d'équipe(s) assesseur(s) (arbitrage) par round. Aucune génération
 * automatique n'est proposée pour un autre nombre d'équipes.
 * Licensed under GPL-3.0
 */

import { TeamRow } from '../types/team.types';

export interface LaserArenaScheduleSlot {
  pool: string; // 'A' | 'B' | 'C'
  slot: number; // position 1..4 dans la poule
}

export interface LaserArenaScheduleMatch {
  pool: string;
  slotA: number;
  slotB: number;
}

export interface LaserArenaScheduleRound {
  round: number;
  matches: LaserArenaScheduleMatch[];
  assessors: LaserArenaScheduleSlot[];
}

const m = (pool: string, slotA: number, slotB: number): LaserArenaScheduleMatch => ({
  pool,
  slotA,
  slotB,
});
const a = (pool: string, slot: number): LaserArenaScheduleSlot => ({ pool, slot });

/** 3 poules A/B/C de 4 équipes, 4 arènes (règlement, "Pour 12 équipes"). */
export const LASER_ARENA_SCHEDULE_12: LaserArenaScheduleRound[] = [
  {
    round: 1,
    matches: [m('A', 1, 2), m('A', 3, 4), m('B', 1, 2), m('B', 3, 4)],
    assessors: [a('C', 1), a('C', 2), a('C', 3), a('C', 4)],
  },
  {
    round: 2,
    matches: [m('C', 1, 2), m('C', 3, 4), m('A', 1, 3), m('A', 2, 4)],
    assessors: [a('B', 1), a('B', 2), a('B', 3), a('B', 4)],
  },
  {
    round: 3,
    matches: [m('B', 1, 3), m('B', 2, 4), m('C', 1, 3), m('C', 2, 4)],
    assessors: [a('A', 1), a('A', 2), a('A', 3), a('A', 4)],
  },
  {
    round: 4,
    matches: [m('A', 1, 4), m('A', 2, 3), m('B', 1, 4), m('B', 2, 3)],
    assessors: [a('C', 1), a('C', 2), a('C', 3), a('C', 4)],
  },
  {
    round: 5,
    matches: [m('C', 1, 4), m('C', 2, 3)],
    assessors: [a('B', 1), a('B', 2)],
  },
];

/** 2 poules A/B de 4 équipes, 3 arènes (règlement, "Pour 8 équipes"). */
export const LASER_ARENA_SCHEDULE_8: LaserArenaScheduleRound[] = [
  {
    round: 1,
    matches: [m('A', 1, 2), m('A', 3, 4), m('B', 1, 2)],
    assessors: [a('B', 3), a('B', 4)],
  },
  {
    round: 2,
    matches: [m('B', 3, 4), m('A', 2, 4), m('A', 1, 3)],
    assessors: [a('B', 1), a('B', 2)],
  },
  {
    round: 3,
    matches: [m('A', 1, 4), m('B', 1, 3), m('B', 2, 4)],
    assessors: [a('A', 2), a('A', 3)],
  },
  {
    round: 4,
    matches: [m('A', 2, 3), m('B', 1, 4), m('B', 2, 3)],
    assessors: [a('A', 1), a('A', 4)],
  },
];

/** Calendrier figé pour `teamCount` équipes, ou `null` si non couvert par le règlement. */
export function getLaserArenaPoolSchedule(teamCount: number): LaserArenaScheduleRound[] | null {
  if (teamCount === 12) return LASER_ARENA_SCHEDULE_12;
  if (teamCount === 8) return LASER_ARENA_SCHEDULE_8;
  return null;
}

/**
 * Affecte les équipes aux poules dans l'ordre de la liste fournie, par blocs
 * de 4 (A, puis B, puis C) : `teams[0..3]` = poule A, `teams[4..7]` = poule
 * B, `teams[8..11]` = poule C. Il n'existe pas d'affectation de poule
 * explicite ailleurs dans l'app ; l'ordre de création des équipes fait foi.
 */
export function assignTeamsToPoolSlots(teams: TeamRow[]): Map<string, TeamRow> {
  const poolLetters = ['A', 'B', 'C'];
  const slots = new Map<string, TeamRow>();
  teams.forEach((team, i) => {
    const letter = poolLetters[Math.floor(i / 4)];
    if (!letter) return;
    slots.set(`${letter}${(i % 4) + 1}`, team);
  });
  return slots;
}

export interface ResolvedLaserArenaMatch {
  round: number;
  pool: string;
  teamA: TeamRow;
  teamB: TeamRow;
  assessorTeamIds: string[];
}

/** Résout le calendrier figé (poule/slot) en équipes réelles pour un effectif donné. */
export function resolveLaserArenaSchedule(
  teams: TeamRow[],
  schedule: LaserArenaScheduleRound[]
): ResolvedLaserArenaMatch[] {
  const slots = assignTeamsToPoolSlots(teams);
  const resolved: ResolvedLaserArenaMatch[] = [];
  for (const round of schedule) {
    const assessorTeamIds = round.assessors
      .map(s => slots.get(`${s.pool}${s.slot}`)?.id)
      .filter((id): id is string => !!id);
    for (const match of round.matches) {
      const teamA = slots.get(`${match.pool}${match.slotA}`);
      const teamB = slots.get(`${match.pool}${match.slotB}`);
      if (teamA && teamB) {
        resolved.push({ round: round.round, pool: match.pool, teamA, teamB, assessorTeamIds });
      }
    }
  }
  return resolved;
}
