import { describe, it, expect } from 'vitest';
import { Weapon } from '../types';
import { decomposeLaserScore, simulateMatchEvents } from './simulatedMatchEvents';

const base = { matchId: 'm1', fencerAId: 'a', fencerBId: 'b', scoreA: 13, scoreB: 7 };

describe('decomposeLaserScore', () => {
  it('somme des zones = score', () => {
    const pts = { A: 1, B: 3, C: 5 };
    for (let s = 0; s <= 25; s++) {
      expect(decomposeLaserScore(s).reduce((t, z) => t + pts[z], 0)).toBe(s);
    }
  });
});

describe('simulateMatchEvents', () => {
  it('Sabre Laser : touches par zone cohérentes avec le score', () => {
    const ev = simulateMatchEvents({ ...base, weapon: Weapon.LASER });
    const sum = (id: string) =>
      ev.touches.filter(t => t.fencerId === id).reduce((t, x) => t + x.points, 0);
    expect(sum('a')).toBe(13);
    expect(sum('b')).toBe(7);
    expect(ev.touches.every(t => t.matchId === 'm1' && t.id.includes('-sim-'))).toBe(true);
  });

  it('arme classique : pas de zones, durée et horodatages dans le match', () => {
    const end = new Date('2026-01-01T10:00:00Z');
    const ev = simulateMatchEvents({ ...base, weapon: Weapon.EPEE, end });
    expect(ev.touches).toHaveLength(0);
    expect(ev.timing.duration).toBeGreaterThanOrEqual(90);
    expect(ev.timing.duration).toBeLessThanOrEqual(300);
    expect(ev.timing.endTime).toBe(end.toISOString());
    for (const c of ev.cards) {
      expect(c.timestamp >= ev.timing.startTime!).toBe(true);
      expect(c.timestamp <= ev.timing.endTime!).toBe(true);
    }
  });

  it('cartons générés avec motif (rng forcé)', () => {
    const ev = simulateMatchEvents({ ...base, weapon: Weapon.LASER, rng: () => 0 });
    const types = ev.cards.map(c => c.cardType).sort();
    expect(types).toEqual(['red', 'red', 'white', 'white', 'yellow', 'yellow']);
    expect(ev.cards.every(c => c.reason && c.id.includes('-sim-'))).toBe(true);
    expect(new Set(ev.cards.map(c => c.id)).size).toBe(ev.cards.length);
  });
});
