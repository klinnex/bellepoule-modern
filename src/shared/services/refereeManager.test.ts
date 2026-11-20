import { describe, it, expect } from 'vitest';
import RefereeManager from './refereeManager';
import { Referee, Match, Gender, FencerStatus, MatchStatus } from '../types';

// ============================================================================
// Helpers
// ============================================================================

let refCounter = 1;
let matchCounter = 1;

const makeReferee = (
  id: string,
  status: Referee['status'] = 'available',
  club?: string
): Referee => ({
  id,
  ref: refCounter++,
  lastName: 'ARBITRE',
  firstName: 'Test',
  gender: Gender.MALE,
  nationality: 'FRA',
  club,
  status,
  assignedMatches: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeFencer = (id: string, club?: string) => ({
  id,
  ref: 1,
  lastName: 'TIREUR',
  firstName: 'Test',
  gender: Gender.MALE,
  nationality: 'FRA',
  club,
  status: FencerStatus.NOT_CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeMatch = (id: string, clubA?: string, clubB?: string): Match => ({
  id,
  number: matchCounter++,
  fencerA: makeFencer(`fa-${id}`, clubA),
  fencerB: makeFencer(`fb-${id}`, clubB),
  scoreA: null,
  scoreB: null,
  maxScore: 5,
  status: MatchStatus.NOT_STARTED,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ============================================================================
// Tests
// ============================================================================

describe('RefereeManager', () => {
  describe('constructeur', () => {
    it('filtre les arbitres unavailable', () => {
      const referees = [
        makeReferee('r1', 'available'),
        makeReferee('r2', 'unavailable'),
        makeReferee('r3', 'available'),
      ];
      const manager = new RefereeManager(referees);
      const report = manager.generateRotationReport();
      // Tous les arbitres de test partagent le même nom : on vérifie le nombre, pas le nom
      expect(report).toHaveLength(2);
      const instance = manager as unknown as { referees: Referee[] };
      expect(instance.referees.map(r => r.id)).toEqual(['r1', 'r3']);
    });

    it('config par défaut appliquée', () => {
      const manager = new RefereeManager([]);
      expect(manager).toBeDefined();
    });

    it('config partielle fusionne avec defaults', () => {
      const manager = new RefereeManager([], { maxConsecutiveMatches: 5 });
      expect(manager).toBeDefined();
    });
  });

  // L'affectation se fait par le moteur unique (shared/domain/referees, docs/adr/0014) ;
  // la classe ne garde que le suivi de rotation (fatigue, statistiques, rapport).
  describe('recordExternalAssignment', () => {
    it('cumule les matchs d’un arbitre', () => {
      const manager = new RefereeManager([makeReferee('r1', 'available')]);
      for (let i = 0; i < 3; i++) manager.recordExternalAssignment('r1', makeMatch(`m${i}`));
      expect(manager.getRefereeStats('r1').totalMatches).toBe(3);
    });

    it('arbitre inconnu ou indisponible : ignoré', () => {
      const manager = new RefereeManager([makeReferee('r1', 'unavailable')]);
      manager.recordExternalAssignment('r1', makeMatch('m1'));
      manager.recordExternalAssignment('zz', makeMatch('m2'));
      expect(manager.getRefereeStats('r1').totalMatches).toBe(0);
    });
  });

  describe('getRefereeStats', () => {
    it('retourne 0 matchs pour un arbitre non assigné', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee]);

      const stats = manager.getRefereeStats('r1');

      expect(stats.totalMatches).toBe(0);
      expect(stats.averageMatchDuration).toBe(0);
    });

    it('compte les matchs après assignation', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee]);
      manager.recordExternalAssignment('r1', makeMatch('ms1'));
      manager.recordExternalAssignment('r1', makeMatch('ms2'));

      const stats = manager.getRefereeStats('r1');
      expect(stats.totalMatches).toBe(2);
    });
  });

  describe('generateRotationReport', () => {
    it('rapport vide si aucun arbitre', () => {
      const manager = new RefereeManager([]);
      const report = manager.generateRotationReport();
      expect(report).toHaveLength(0);
    });

    it('rapport contient toutes les infos', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee]);
      manager.recordExternalAssignment('r1', makeMatch('mr1'));

      const report = manager.generateRotationReport();
      expect(report).toHaveLength(1);
      expect(report[0].matchesAssigned).toBe(1);
      expect(report[0].restViolations).toBeGreaterThanOrEqual(0);
    });
  });
});
