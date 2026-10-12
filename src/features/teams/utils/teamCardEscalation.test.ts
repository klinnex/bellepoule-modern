/**
 * Tests unitaires - teamCardEscalation
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { determineTeamCardEscalation, countTeamYellowCards } from './teamCardEscalation';
import { TeamMatchCardRow } from '../types/team.types';

const card = (overrides: Partial<TeamMatchCardRow> = {}): TeamMatchCardRow => ({
  id: overrides.id ?? 'c',
  matchId: overrides.matchId ?? 'm',
  teamId: overrides.teamId ?? 'A',
  type: overrides.type ?? 'white',
  reason: overrides.reason ?? 'late_designation',
  createdAt: overrides.createdAt ?? new Date().toISOString(),
});

describe('determineTeamCardEscalation', () => {
  it('attribue un carton blanc à la première désignation tardive de la rencontre', () => {
    expect(determineTeamCardEscalation([])).toBe('white');
  });

  it('attribue un carton jaune dès qu’un blanc a déjà été donné, même dans un autre assaut', () => {
    expect(determineTeamCardEscalation([card({ type: 'white' })])).toBe('yellow');
    expect(determineTeamCardEscalation([card({ type: 'white' }), card({ type: 'yellow' })])).toBe(
      'yellow'
    );
  });
});

describe('countTeamYellowCards', () => {
  it('compte uniquement les jaunes de l’équipe concernée', () => {
    const cards = [
      card({ teamId: 'A', type: 'white' }),
      card({ teamId: 'A', type: 'yellow' }),
      card({ teamId: 'A', type: 'yellow' }),
      card({ teamId: 'B', type: 'yellow' }),
    ];
    expect(countTeamYellowCards(cards, 'A')).toBe(2);
    expect(countTeamYellowCards(cards, 'B')).toBe(1);
  });
});
