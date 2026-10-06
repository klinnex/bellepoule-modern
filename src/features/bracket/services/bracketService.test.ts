// @vitest-environment jsdom
/**
 * Tests unitaires - BracketService
 * BellePoule Modern
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { BracketService } from './bracketService';
import { Fencer, Gender, FencerStatus } from '../../../shared/types';

const svc = new BracketService();

const fencer = (id: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: id,
  firstName: 'X',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.QUALIFIED,
  createdAt: new Date(),
  updatedAt: new Date(),
});

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('generateBracket - emptyTable', () => {
  it('retourne un tableau vide sans electronAPI, taille = puissance de 2 ≥ count', async () => {
    const t = await svc.generateBracket('c1', { fencerCount: 5 });
    expect(t.competitionId).toBe('c1');
    expect(t.size).toBe(8);
    expect(t.nodes).toEqual([]);
    expect(t.isComplete).toBe(false);
  });

  it('arrondit la taille (12 → 16, 64 → 64)', async () => {
    expect((await svc.generateBracket('c1', { fencerCount: 12 })).size).toBe(16);
    expect((await svc.generateBracket('c1', { fencerCount: 64 })).size).toBe(64);
  });

  it('vide aussi si la liste de tireurs est vide', async () => {
    (window as any).electronAPI = { db: { getFencersByCompetition: async () => [] } };
    const t = await svc.generateBracket('c1', { fencerCount: 4 });
    expect(t.nodes).toEqual([]);
  });
});

describe('generateBracket - avec tireurs', () => {
  it('construit un tableau et y injecte le competitionId', async () => {
    (window as any).electronAPI = { db: {} };
    const seeded = [fencer('1'), fencer('2'), fencer('3'), fencer('4')];
    const t = await svc.generateBracket('cX', {
      fencerCount: 4,
      seededFencers: seeded,
      maxScore: 10,
    });
    expect(t.competitionId).toBe('cX');
    expect(t.maxScore).toBe(10);
    expect(Array.isArray(t.nodes)).toBe(true);
  });
});

describe('updateMatchResult', () => {
  it('ne fait rien si le match est introuvable', async () => {
    const updateMatch = vi.fn();
    (window as any).electronAPI = { db: { getMatch: async () => null, updateMatch } };
    await svc.updateMatchResult('t', 'm', 'w');
    expect(updateMatch).not.toHaveBeenCalled();
  });

  it('marque la victoire du bon tireur (A) et termine le match', async () => {
    const updateMatch = vi.fn(async () => {});
    (window as any).electronAPI = {
      db: {
        getMatch: async () => ({
          id: 'm',
          fencerA: { id: 'a' },
          fencerB: { id: 'b' },
          scoreA: { value: 5 },
          scoreB: { value: 3 },
        }),
        updateMatch,
      },
    };
    await svc.updateMatchResult('t', 'm', 'a');
    const patch = updateMatch.mock.calls[0][1];
    expect(patch.scoreA.isVictory).toBe(true);
    expect(patch.scoreB.isVictory).toBe(false);
    expect(patch.status).toBe('finished');
  });

  it('gère les scores absents (value null)', async () => {
    const updateMatch = vi.fn(async () => {});
    (window as any).electronAPI = {
      db: {
        getMatch: async () => ({
          id: 'm',
          fencerA: { id: 'a' },
          fencerB: { id: 'b' },
          scoreA: null,
          scoreB: null,
        }),
        updateMatch,
      },
    };
    await svc.updateMatchResult('t', 'm', 'b');
    const patch = updateMatch.mock.calls[0][1];
    expect(patch.scoreB).toEqual({ value: null, isVictory: true });
    expect(patch.scoreA).toEqual({ value: null, isVictory: false });
  });
});

describe('getProgression', () => {
  it('valeurs par défaut sans electronAPI', async () => {
    expect(await svc.getProgression('t')).toEqual({
      currentRound: 1,
      totalRounds: 1,
      completedMatches: 0,
      totalMatches: 0,
    });
  });

  it('agrège complétés/total et déduit le tour courant', async () => {
    (window as any).electronAPI = {
      db: {
        getMatchesByPool: async () => [
          { status: 'finished', round: 1 },
          { status: 'finished', round: 1 },
          { status: 'not_started', round: 2 },
        ],
      },
    };
    const p = await svc.getProgression('t');
    expect(p.totalMatches).toBe(3);
    expect(p.completedMatches).toBe(2);
    expect(p.currentRound).toBe(2); // plus petit round non terminé
  });

  it('currentRound = totalRounds quand tout est terminé', async () => {
    (window as any).electronAPI = {
      db: { getMatchesByPool: async () => [{ status: 'finished', round: 1 }] },
    };
    const p = await svc.getProgression('t');
    expect(p.currentRound).toBe(p.totalRounds);
  });
});
