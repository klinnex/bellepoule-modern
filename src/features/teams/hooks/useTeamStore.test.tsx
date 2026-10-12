// @vitest-environment jsdom
/**
 * Tests unitaires - useTeamStore (logique métier)
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTeamStore } from './useTeamStore';
import type { Team, TeamMatch, TeamBout } from '../types/team.types';

const reset = () =>
  useTeamStore.setState({ teams: [], matches: [], pools: [], currentMatch: null, error: null });

const get = () => useTeamStore.getState();

beforeEach(() => reset());

describe('addTeam / updateTeam / removeTeam', () => {
  it('ajoute une équipe', () => {
    get().addTeam({ name: 'Les Bleus', club: 'CEP', fencerIds: [] } as any);
    expect(get().teams).toHaveLength(1);
    expect(get().teams[0].name).toBe('Les Bleus');
  });

  it('met à jour puis supprime une équipe', () => {
    get().addTeam({ name: 'A', club: 'C', fencerIds: [] } as any);
    const id = get().teams[0].id;
    get().updateTeam(id, { name: 'B' });
    expect(get().teams[0].name).toBe('B');
    get().removeTeam(id);
    expect(get().teams).toHaveLength(0);
  });
});

describe('createMatch', () => {
  it('crée un match entre deux équipes existantes', () => {
    useTeamStore.setState({
      teams: [{ id: 'tA' } as Team, { id: 'tB' } as Team],
    });
    const match = get().createMatch('tA', 'tB');
    expect(match.teamA.id).toBe('tA');
    expect(match.status).toBe('not_started');
    expect(get().matches).toHaveLength(1);
  });

  it('lève une erreur si une équipe est introuvable', () => {
    expect(() => get().createMatch('x', 'y')).toThrow('Teams not found');
  });
});

describe('updateBoutScore', () => {
  it('désigne le vainqueur et incrémente le score d’équipe', () => {
    const bout: TeamBout = {
      id: 'b1',
      order: 1,
      fencerA: { id: 'fa', teamOrder: 1 } as any,
      fencerB: { id: 'fb', teamOrder: 1 } as any,
      scoreA: 0,
      scoreB: 0,
      maxScore: 5,
      status: 'in_progress',
    };
    const match: TeamMatch = {
      id: 'm1',
      teamA: { id: 'tA' } as Team,
      teamB: { id: 'tB' } as Team,
      bouts: [bout],
      scoreA: 0,
      scoreB: 0,
      status: 'in_progress',
      currentBoutIndex: 0,
    };
    useTeamStore.setState({ matches: [match] });

    get().updateBoutScore('m1', { boutId: 'b1', scoreA: 5, scoreB: 3, status: 'finished' });
    const m = get().matches[0];
    expect(m.bouts[0].winner?.id).toBe('fa');
    expect(m.scoreA).toBe(1);
    expect(m.scoreB).toBe(0);
  });
});

describe('finishMatch', () => {
  it('marque le match terminé et le vainqueur', () => {
    const match: TeamMatch = {
      id: 'm1',
      teamA: { id: 'tA' } as Team,
      teamB: { id: 'tB' } as Team,
      bouts: [],
      scoreA: 0,
      scoreB: 0,
      status: 'in_progress',
      currentBoutIndex: 0,
    };
    useTeamStore.setState({ matches: [match] });
    get().finishMatch('m1', 'tB');
    expect(get().matches[0].status).toBe('finished');
    expect(get().matches[0].winner?.id).toBe('tB');
  });
});

describe('generatePools', () => {
  it('répartit les équipes en poules selon la taille', () => {
    useTeamStore.setState({
      teams: ['1', '2', '3', '4', '5'].map(id => ({ id }) as Team),
    });
    get().generatePools(['1', '2', '3', '4', '5'], 2);
    expect(get().pools).toHaveLength(3); // ceil(5/2)
    expect(get().pools[0].teams).toHaveLength(2);
    expect(get().pools[2].teams).toHaveLength(1);
  });
});
