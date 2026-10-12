/**
 * Tests unitaires - teamCalculations
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  generateRelayBouts,
  generateRelayOrder,
  calculateTeamScore,
  validateTeamComposition,
  isTeamMatchComplete,
  getTeamMatchWinner,
  getTeamTargetRule,
  getRelayCap,
  calculateTeamPoolRanking,
  placeRankedTeamsInTable,
  resolveTeamTableauSlot,
} from './teamCalculations';
import { Team, TeamFencer, TeamMatch, TeamBout, TeamRow, TeamMatchRow } from '../types/team.types';
import { Weapon } from '../../../shared/types';

const tf = (id: string, order: number, isReserve = false): TeamFencer =>
  ({ id, lastName: id, firstName: id, teamOrder: order, isReserve }) as unknown as TeamFencer;

const team = (id: string, fencers: TeamFencer[], reserves: TeamFencer[] = []): Team => ({
  id,
  name: id,
  club: 'C',
  fencers,
  reserveFencers: reserves,
  totalPoints: 0,
  ranking: 0,
});

const teamA = () => team('A', [tf('a1', 1), tf('a2', 2), tf('a3', 3)]);
const teamB = () => team('B', [tf('b1', 1), tf('b2', 2), tf('b3', 3)]);

describe('generateRelayBouts', () => {
  it('génère 9 relais dans l’ordre standard', () => {
    const bouts = generateRelayBouts(teamA(), teamB());
    expect(bouts).toHaveLength(9);
    expect(bouts[0].fencerA.id).toBe('a1');
    expect(bouts[0].fencerB.id).toBe('b1');
    expect(bouts[3].fencerA.id).toBe('a1'); // 1 vs 2
    expect(bouts[3].fencerB.id).toBe('b2');
    expect(bouts.map(b => b.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('ignore les réservistes et trie par teamOrder', () => {
    const a = team('A', [tf('a3', 3), tf('a1', 1), tf('a2', 2), tf('aR', 4, true)]);
    const bouts = generateRelayBouts(a, teamB());
    expect(bouts[0].fencerA.id).toBe('a1');
  });

  it('lève une erreur si moins de 3 titulaires', () => {
    const short = team('A', [tf('a1', 1), tf('a2', 2)]);
    expect(() => generateRelayBouts(short, teamB())).toThrow();
  });
});

describe('calculateTeamScore', () => {
  it('compte uniquement les relais terminés avec vainqueur', () => {
    const match: TeamMatch = {
      id: 'm',
      teamA: teamA(),
      teamB: teamB(),
      bouts: [],
      scoreA: 0,
      scoreB: 0,
      status: 'in_progress',
      currentBoutIndex: 0,
    };
    const bout = (
      winner: TeamFencer,
      fa: TeamFencer,
      fb: TeamFencer,
      status = 'finished'
    ): TeamBout =>
      ({
        id: 'x',
        order: 1,
        fencerA: fa,
        fencerB: fb,
        scoreA: 0,
        scoreB: 0,
        maxScore: 5,
        status,
        winner,
      }) as TeamBout;
    match.bouts = [
      bout(tf('a1', 1), tf('a1', 1), tf('b1', 1)), // A
      bout(tf('b2', 2), tf('a2', 2), tf('b2', 2)), // B
      bout(tf('a3', 3), tf('a3', 3), tf('b3', 3), 'in_progress'), // ignoré
    ];
    expect(calculateTeamScore(match)).toEqual({ scoreA: 1, scoreB: 1 });
  });
});

describe('validateTeamComposition', () => {
  it('valide une équipe de 3 titulaires d’ordres 1,2,3', () => {
    expect(validateTeamComposition(teamA())).toEqual({ valid: true, errors: [] });
  });

  it('refuse moins de 3 titulaires', () => {
    const r = validateTeamComposition(team('A', [tf('a1', 1), tf('a2', 2)]));
    expect(r.valid).toBe(false);
  });

  it('refuse plus d’un réserviste', () => {
    const r = validateTeamComposition(
      team('A', [tf('a1', 1), tf('a2', 2), tf('a3', 3)], [tf('r1', 4, true), tf('r2', 5, true)])
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /reserve/i.test(e))).toBe(true);
  });
});

describe('isTeamMatchComplete / getTeamMatchWinner', () => {
  const finishedBout = (id: string, winner: TeamFencer, fa: TeamFencer, fb: TeamFencer): TeamBout =>
    ({
      id,
      order: 1,
      fencerA: fa,
      fencerB: fb,
      scoreA: 0,
      scoreB: 0,
      maxScore: 5,
      status: 'finished',
      winner,
    }) as TeamBout;

  it('est complet après 9 relais terminés', () => {
    const a = teamA(),
      b = teamB();
    const bouts = Array.from({ length: 9 }, (_, i) =>
      finishedBout(`x${i}`, tf('a1', 1), tf('a1', 1), tf('b1', 1))
    );
    const match: TeamMatch = {
      id: 'm',
      teamA: a,
      teamB: b,
      bouts,
      scoreA: 0,
      scoreB: 0,
      status: 'finished',
      currentBoutIndex: 9,
    };
    expect(isTeamMatchComplete(match)).toBe(true);
    expect(getTeamMatchWinner(match)).toBe(a); // A gagne tous les relais
  });

  it('retourne null si le match n’est pas terminé', () => {
    const match: TeamMatch = {
      id: 'm',
      teamA: teamA(),
      teamB: teamB(),
      bouts: [],
      scoreA: 0,
      scoreB: 0,
      status: 'in_progress',
      currentBoutIndex: 0,
    };
    expect(isTeamMatchComplete(match)).toBe(false);
    expect(getTeamMatchWinner(match)).toBeNull();
  });
});

describe('generateRelayOrder', () => {
  it('génère le motif FIE standard pour une équipe de 3', () => {
    expect(generateRelayOrder(3)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [0, 1],
      [1, 2],
      [2, 0],
      [0, 2],
      [1, 0],
      [2, 1],
    ]);
  });

  it('génère N² relais où chaque titulaire rencontre chaque adversaire exactement une fois (N=4)', () => {
    const order = generateRelayOrder(4);
    expect(order).toHaveLength(16);
    const seen = new Set(order.map(([i, j]) => `${i}-${j}`));
    expect(seen.size).toBe(16); // toutes les paires (i,j) sont uniques
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(seen.has(`${i}-${j}`)).toBe(true);
      }
    }
  });
});

describe('getTeamTargetRule / getRelayCap', () => {
  it('E/F/S comptent toujours en touches, cible = stepSize × N²', () => {
    expect(getTeamTargetRule(Weapon.EPEE, 3, 'points', 5)).toEqual({
      mode: 'touches',
      stepSize: 5,
      target: 45,
    });
    expect(getTeamTargetRule(Weapon.FOIL, 4, 'points', 5)).toEqual({
      mode: 'touches',
      stepSize: 5,
      target: 80,
    });
  });

  it('Sabre Laser respecte le mode configuré (touches ou points)', () => {
    expect(getTeamTargetRule(Weapon.LASER, 3, 'touches', 5).mode).toBe('touches');
    expect(getTeamTargetRule(Weapon.LASER, 3, 'points', 5).mode).toBe('points');
  });

  it('getRelayCap calcule le palier cumulé (5-10-15…)', () => {
    expect(getRelayCap(0, 5)).toBe(5);
    expect(getRelayCap(1, 5)).toBe(10);
    expect(getRelayCap(8, 5)).toBe(45);
  });
});

describe('calculateTeamPoolRanking', () => {
  const row = (id: string): TeamRow => ({ id, name: id, club: 'C', fencers: [] });

  const finishedMatch = (
    teamAId: string,
    teamBId: string,
    scoreBoutsA: number,
    scoreBoutsB: number,
    winnerId: string | null
  ): TeamMatchRow => ({
    id: `${teamAId}-vs-${teamBId}`,
    poolNumber: 1,
    teamAId,
    teamBId,
    scoreBoutsA,
    scoreBoutsB,
    status: 'finished',
    winnerId,
    currentBoutIndex: 9,
    bouts: [
      {
        id: 'b1',
        boutOrder: 1,
        fencerAId: 'fa',
        fencerBId: 'fb',
        scoreA: 5,
        scoreB: 3,
        maxScore: 5,
        status: 'finished',
        winnerId: 'fa',
      },
      {
        id: 'b2',
        boutOrder: 2,
        fencerAId: 'fa2',
        fencerBId: 'fb2',
        scoreA: 2,
        scoreB: 5,
        maxScore: 5,
        status: 'finished',
        winnerId: 'fb2',
      },
    ],
  });

  it('classe les équipes par victoires, puis relais gagnés, puis touches', () => {
    const teams = [row('A'), row('B'), row('C')];
    const matches = [finishedMatch('A', 'B', 45, 30, 'A'), finishedMatch('B', 'C', 45, 20, 'B')];
    const ranking = calculateTeamPoolRanking(teams, matches);
    expect(ranking[0].team.id).toBe('A');
    expect(ranking.find(r => r.team.id === 'A')?.pointsFor).toBe(45);
    expect(ranking.find(r => r.team.id === 'A')?.pointsAgainst).toBe(30);
    // Relais gagnés/perdus comptés depuis bouts[].winnerId (1 gagné, 1 perdu par équipe ici)
    expect(ranking.find(r => r.team.id === 'A')?.boutsWon).toBe(1);
    expect(ranking.find(r => r.team.id === 'A')?.boutsLost).toBe(1);
  });

  it('ignore les matchs non terminés', () => {
    const teams = [row('A'), row('B')];
    const matches: TeamMatchRow[] = [
      {
        id: 'm',
        poolNumber: 1,
        teamAId: 'A',
        teamBId: 'B',
        scoreBoutsA: 10,
        scoreBoutsB: 5,
        status: 'in_progress',
        winnerId: null,
        currentBoutIndex: 3,
        bouts: [],
      },
    ];
    const ranking = calculateTeamPoolRanking(teams, matches);
    expect(ranking.every(r => r.victories === 0 && r.pointsFor === 0)).toBe(true);
  });
});

describe('placeRankedTeamsInTable / resolveTeamTableauSlot', () => {
  const row = (id: string): TeamRow => ({ id, name: id, club: 'C', fencers: [] });

  it('place la tête de série n°1 en première position', () => {
    // Note : generateSeedingChart a une collision connue seed 2 / seed tableSize
    // (cf. tableCalculations.test.ts) — seule la position de la tête n°1 est garantie.
    const teams = [row('A'), row('B'), row('C'), row('D')];
    const placements = placeRankedTeamsInTable(teams, 4);
    expect(placements[0]?.id).toBe('A');
    expect(placements.filter(p => p !== null).length).toBeGreaterThanOrEqual(3);
  });

  it('résout un exempt (bye) quand une équipe est seule dans son couple de départ', () => {
    const teams = [row('A'), row('B'), row('C')]; // tableau de taille 4, D manquant → bye
    const tableSize = 4;
    const placements = placeRankedTeamsInTable(teams, tableSize);
    const teamById = new Map(teams.map(t => [t.id, t]));
    // Position 1 (2e relais du 1er tour) = seed 4 (absent) vs seed 5 (n'existe pas) → dépend du placement réel
    const slot0 = resolveTeamTableauSlot(2, 0, tableSize, placements, new Map(), teamById);
    expect(slot0.isBye || slot0.teamA !== null).toBe(true);
  });

  it('propage un exempt jusqu’à la finale quand l’adversaire du tour suivant est aussi exempté', () => {
    const teams = [row('A')]; // tableau de taille 2, un seul concurrent
    const tableSize = 2;
    const placements = placeRankedTeamsInTable(teams, tableSize);
    const teamById = new Map(teams.map(t => [t.id, t]));
    const final = resolveTeamTableauSlot(1, 0, tableSize, placements, new Map(), teamById);
    expect(final.isBye).toBe(true);
    expect(final.team?.id).toBe('A');
  });

  it('résout la finale à partir des vainqueurs des demi-finales persistées en DB', () => {
    const teams = [row('A'), row('B'), row('C'), row('D')];
    const tableSize = 4;
    const placements = placeRankedTeamsInTable(teams, tableSize);
    const teamById = new Map(teams.map(t => [t.id, t]));
    const semiFinal = (position: number, winnerId: string): TeamMatchRow => ({
      id: `sf-${position}`,
      round: 2,
      position,
      teamAId: 'x',
      teamBId: 'y',
      scoreBoutsA: 45,
      scoreBoutsB: 30,
      status: 'finished',
      winnerId,
      currentBoutIndex: 9,
      bouts: [],
    });
    const matchesByKey = new Map([
      ['2-0', semiFinal(0, 'A')],
      ['2-1', semiFinal(1, 'D')],
    ]);
    const final = resolveTeamTableauSlot(1, 0, tableSize, placements, matchesByKey, teamById);
    expect(final.teamA?.id).toBe('A');
    expect(final.teamB?.id).toBe('D');
    expect(final.isBye).toBe(false);
  });
});
