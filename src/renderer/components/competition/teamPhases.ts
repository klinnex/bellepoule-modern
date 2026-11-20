/**
 * BellePoule Modern - Phases d'une compétition par équipes ↔ onglets de TeamManagerView (#1085)
 * Licensed under GPL-3.0
 */

export const TEAM_PHASE_VIEWS = {
  teams: 'teams',
  teampool: 'pool',
  teamtableau: 'tableau',
  teamranking: 'ranking',
} as const;

export type TeamPhase = keyof typeof TEAM_PHASE_VIEWS;

export const isTeamPhase = (p: string): p is TeamPhase => p in TEAM_PHASE_VIEWS;
