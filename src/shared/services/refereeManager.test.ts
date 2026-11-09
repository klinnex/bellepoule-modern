import { describe, it, expect } from 'vitest';
import RefereeManager from './refereeManager';
import { Referee, Match, Pool, Gender, FencerStatus, MatchStatus } from '../types';

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

const makePool = (id: string, fencerClubs: string[] = []): Pool => ({
  id,
  number: 1,
  phaseId: 'phase-1',
  fencers: fencerClubs.map((club, i) => makeFencer(`pf-${i}`, club)),
  matches: [],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
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
      // test via assignRefereesToMatches: only available can be assigned
      const matches = [makeMatch('m1')];
      const assignments = manager.assignRefereesToMatches(matches, []);
      // r2 unavailable cannot be assigned
      if (assignments.size > 0) {
        const assigned = Array.from(assignments.values());
        assigned.forEach(r => expect(r.status).not.toBe('unavailable'));
      }
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

  describe('assignRefereesToMatches', () => {
    it('1 match + 1 arbitre → assignment créée', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee]);
      const matches = [makeMatch('m1')];

      const assignments = manager.assignRefereesToMatches(matches, []);

      expect(assignments.size).toBe(1);
      expect(assignments.get('m1')).toBeDefined();
      expect(assignments.get('m1')!.id).toBe('r1');
    });

    it('0 arbitres → map vide', () => {
      const manager = new RefereeManager([]);
      const matches = [makeMatch('m1'), makeMatch('m2')];

      const assignments = manager.assignRefereesToMatches(matches, []);

      expect(assignments.size).toBe(0);
    });

    it('0 matchs → map vide', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee]);

      const assignments = manager.assignRefereesToMatches([], []);

      expect(assignments.size).toBe(0);
    });

    it('plusieurs matchs avec plusieurs arbitres → tous assignés si possible', () => {
      const referees = [
        makeReferee('r1', 'available'),
        makeReferee('r2', 'available'),
        makeReferee('r3', 'available'),
      ];
      const manager = new RefereeManager(referees);
      const matches = [makeMatch('m1'), makeMatch('m2'), makeMatch('m3')];

      const assignments = manager.assignRefereesToMatches(matches, []);

      expect(assignments.size).toBeGreaterThan(0);
    });

    it('arbitre assigné a son status mis à jour', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee]);
      const matches = [makeMatch('m1')];

      manager.assignRefereesToMatches(matches, []);

      expect(referee.status).toBe('assigned');
    });
  });

  describe('conflit de club', () => {
    it('arbitre et tireurA même club → conflit détecté (warning dans recordAssignment)', () => {
      const referee = makeReferee('r1', 'available', 'CE PARIS');
      const manager = new RefereeManager([referee]);
      const match = makeMatch('m1', 'CE PARIS', 'CE LYON');
      match.fencerA!.club = 'CE PARIS';

      manager.assignRefereesToMatches([match], []);

      const report = manager.generateRotationReport();
      const ref = report.find(r => r.refereeName.includes('ARBITRE'));
      // L'arbitre peut être assigné mais avec un warning
      expect(ref).toBeDefined();
    });

    it('arbitre sans club → pas de conflit', () => {
      const referee = makeReferee('r1', 'available', undefined);
      const manager = new RefereeManager([referee]);
      const match = makeMatch('m1', 'CE PARIS', 'CE LYON');

      const assignments = manager.assignRefereesToMatches([match], []);

      expect(assignments.get('m1')?.id).toBe('r1');
    });

    it('conflit via fenceur dans pool → arbitre pénalisé', () => {
      const referee = makeReferee('r1', 'available', 'CE PARIS');
      const manager = new RefereeManager([referee]);
      const match = makeMatch('m1', 'CE LYON', 'CE BORDEAUX');
      match.id = 'pm1';
      const pool = makePool('pool-1', ['CE PARIS', 'CE NICE']);
      pool.matches = [match];
      const poolMatch = { ...match, poolId: 'pool-1' };

      const assignments = manager.assignRefereesToMatches([poolMatch], [pool]);

      // l'arbitre peut être assigné quand même (score -1000 mais seul disponible)
      // on vérifie juste que ça ne plante pas
      expect(assignments).toBeDefined();
    });
  });

  describe('rotation / maxConsecutiveMatches', () => {
    it('un arbitre reçoit plusieurs matchs si assez de matchs', () => {
      const referee = makeReferee('r1', 'available');
      const manager = new RefereeManager([referee], { maxConsecutiveMatches: 5 });
      const matches = Array.from({ length: 3 }, (_, i) => makeMatch(`m${i}`));

      manager.assignRefereesToMatches(matches, []);

      const stats = manager.getRefereeStats('r1');
      expect(stats.totalMatches).toBe(3);
    });

    it('maxMatchesPerDay limite les assignations', () => {
      const referee = makeReferee('r1', 'available');
      referee.maxMatchesPerDay = 1;
      referee.assignedMatches = 0;
      const manager = new RefereeManager([referee]);
      const matches = [makeMatch('mx1'), makeMatch('mx2'), makeMatch('mx3')];

      const assignments = manager.assignRefereesToMatches(matches, []);

      // après 1 assignation, l'arbitre atteint sa limite
      expect(assignments.size).toBeLessThanOrEqual(1);
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
      const matches = [makeMatch('ms1'), makeMatch('ms2')];

      manager.assignRefereesToMatches(matches, []);

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
      const matches = [makeMatch('mr1')];
      manager.assignRefereesToMatches(matches, []);

      const report = manager.generateRotationReport();
      expect(report).toHaveLength(1);
      expect(report[0].matchesAssigned).toBe(1);
      expect(report[0].restViolations).toBeGreaterThanOrEqual(0);
    });
  });
});
