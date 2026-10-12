/**
 * Tests unitaires - laserArenaPoolSchedules
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  LASER_ARENA_SCHEDULE_8,
  LASER_ARENA_SCHEDULE_12,
  getLaserArenaPoolSchedule,
  assignTeamsToPoolSlots,
  resolveLaserArenaSchedule,
} from './laserArenaPoolSchedules';
import { TeamRow } from '../types/team.types';

const makeTeams = (count: number): TeamRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Équipe ${i + 1}`,
    club: 'C',
    fencers: [],
  }));

describe('getLaserArenaPoolSchedule', () => {
  it('renvoie le calendrier figé pour 8 et 12 équipes uniquement', () => {
    expect(getLaserArenaPoolSchedule(8)).toBe(LASER_ARENA_SCHEDULE_8);
    expect(getLaserArenaPoolSchedule(12)).toBe(LASER_ARENA_SCHEDULE_12);
    expect(getLaserArenaPoolSchedule(6)).toBeNull();
    expect(getLaserArenaPoolSchedule(10)).toBeNull();
    expect(getLaserArenaPoolSchedule(16)).toBeNull();
  });
});

describe('assignTeamsToPoolSlots', () => {
  it('affecte les équipes par blocs de 4 (A puis B puis C)', () => {
    const slots = assignTeamsToPoolSlots(makeTeams(12));
    expect(slots.get('A1')?.id).toBe('t1');
    expect(slots.get('A4')?.id).toBe('t4');
    expect(slots.get('B1')?.id).toBe('t5');
    expect(slots.get('C4')?.id).toBe('t12');
  });
});

describe('resolveLaserArenaSchedule — 12 équipes', () => {
  it('génère exactement 6 rencontres par poule (round-robin complet à 4 équipes)', () => {
    const resolved = resolveLaserArenaSchedule(makeTeams(12), LASER_ARENA_SCHEDULE_12);
    const perPool: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const m of resolved) perPool[m.pool]++;
    expect(perPool).toEqual({ A: 6, B: 6, C: 6 });
    expect(resolved).toHaveLength(18);
  });

  it('chaque équipe rencontre toutes les autres de sa poule exactement une fois', () => {
    const resolved = resolveLaserArenaSchedule(makeTeams(12), LASER_ARENA_SCHEDULE_12);
    const poolAMatches = resolved.filter(m => m.pool === 'A');
    const pairs = new Set(poolAMatches.map(m => [m.teamA.id, m.teamB.id].sort().join('-')));
    expect(pairs.size).toBe(6); // C(4,2) = 6 paires distinctes, aucune répétée
  });
});

describe('resolveLaserArenaSchedule — 8 équipes', () => {
  it('génère exactement 6 rencontres par poule pour 2 poules de 4', () => {
    const resolved = resolveLaserArenaSchedule(makeTeams(8), LASER_ARENA_SCHEDULE_8);
    const perPool: Record<string, number> = { A: 0, B: 0 };
    for (const m of resolved) perPool[m.pool]++;
    expect(perPool).toEqual({ A: 6, B: 6 });
  });
});
