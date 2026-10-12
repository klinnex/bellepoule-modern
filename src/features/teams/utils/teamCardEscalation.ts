/**
 * BellePoule Modern - Laser Sabre "arena" team format
 * Cartons d'équipe "E" : sanctionnent le retard d'une équipe à désigner son
 * combattant (règlement épreuve par équipe Sabre Laser, section "Cartons").
 * Un carton blanc E est adressé à la première désignation tardive (pause de
 * 2 minutes dépassée) de la rencontre ; toute désignation tardive suivante,
 * dans ce match ou un match ultérieur de la même rencontre, reçoit
 * directement un carton jaune E. Les jaunes E sont cumulables sur les 9
 * assauts. Le règlement ne précise ni impact en points, ni escalade au-delà
 * du jaune : rouge/noir E restent disponibles au choix manuel de l'arbitre
 * (traçabilité uniquement, pas d'automatisation inventée au-delà du texte).
 * Distinct du système de cartons individuels par tireur (`cardSystem.ts`),
 * qui reste inchangé.
 * Licensed under GPL-3.0
 */

import { TeamMatchCardRow } from '../types/team.types';

export const TEAM_CARD_DESIGNATION_DELAY_SEC = 120; // 2 minutes

export type TeamCardEscalationType = 'white' | 'yellow';

/**
 * Type de carton à attribuer pour une nouvelle désignation tardive dans
 * cette rencontre : blanc pour la première, jaune pour toutes les
 * suivantes (cumulable sur les 9 assauts).
 */
export function determineTeamCardEscalation(
  previousCardsInMatch: TeamMatchCardRow[]
): TeamCardEscalationType {
  const hasWhite = previousCardsInMatch.some(c => c.type === 'white');
  return hasWhite ? 'yellow' : 'white';
}

/** Nombre de cartons jaunes E cumulés par une équipe sur la rencontre en cours. */
export function countTeamYellowCards(cardsInMatch: TeamMatchCardRow[], teamId: string): number {
  return cardsInMatch.filter(c => c.teamId === teamId && c.type === 'yellow').length;
}
