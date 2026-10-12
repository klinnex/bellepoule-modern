/**
 * Tests unitaires pour le système de Mort Subite FFE Sabre Laser
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  checkChallengerSuddenDeath,
  checkTimeoutSuddenDeath,
  isValidSuddenDeathTouch,
  shouldEndMatch,
  drawWinner,
  getSuddenDeathOvertimeDuration,
  getMatchDuration,
  formatSuddenDeathTime,
  getSuddenDeathRules,
  isSupplementaryTime,
} from './suddenDeath';
import { MatchMode, TargetZone } from '../types';

// ============================================================================
// Tests pour checkChallengerSuddenDeath
// Règle FFE: Mort subite quand les 2 tireurs atteignent 10 pts
// ============================================================================

describe('checkChallengerSuddenDeath', () => {
  describe('Déclenchement', () => {
    it('se déclenche quand les 2 tireurs ont exactement 10 pts', () => {
      const result = checkChallengerSuddenDeath(10, 10);

      expect(result.shouldTrigger).toBe(true);
      expect(result.mode).toBe(MatchMode.SUDDEN_DEATH_CHALLENGER);
      expect(result.reason).toContain('10');
    });

    it('se déclenche si les 2 tireurs dépassent 10 pts', () => {
      expect(checkChallengerSuddenDeath(12, 11).shouldTrigger).toBe(true);
      expect(checkChallengerSuddenDeath(15, 14).shouldTrigger).toBe(true);
      expect(checkChallengerSuddenDeath(10, 13).shouldTrigger).toBe(true);
    });
  });

  describe('Non-déclenchement', () => {
    it('ne se déclenche PAS si un seul tireur a 10+', () => {
      expect(checkChallengerSuddenDeath(10, 5).shouldTrigger).toBe(false);
      expect(checkChallengerSuddenDeath(3, 12).shouldTrigger).toBe(false);
    });

    it("ne se déclenche PAS si personne n'a 10", () => {
      expect(checkChallengerSuddenDeath(8, 9).shouldTrigger).toBe(false);
      expect(checkChallengerSuddenDeath(0, 0).shouldTrigger).toBe(false);
    });

    it('retourne mode null quand pas de déclenchement', () => {
      const result = checkChallengerSuddenDeath(5, 3);

      expect(result.mode).toBeNull();
      expect(result.reason).toBeNull();
    });
  });
});

// ============================================================================
// Tests pour checkTimeoutSuddenDeath
// Règle FFE: Mort subite si fin du temps avec égalité
// ============================================================================

describe('checkTimeoutSuddenDeath', () => {
  describe('Déclenchement', () => {
    it('retourne SUPPLEMENTARY_TIME si scores < 10 à égalité', () => {
      const result = checkTimeoutSuddenDeath(0, 7, 7);

      expect(result.shouldTrigger).toBe(true);
      expect(result.mode).toBe(MatchMode.SUPPLEMENTARY_TIME);
    });

    it('retourne SUPPLEMENTARY_TIME si scores = 9 à égalité (sous le seuil)', () => {
      expect(checkTimeoutSuddenDeath(0, 9, 9).mode).toBe(MatchMode.SUPPLEMENTARY_TIME);
    });

    it('se déclenche même avec égalité à 0-0', () => {
      const result = checkTimeoutSuddenDeath(0, 0, 0);

      expect(result.shouldTrigger).toBe(true);
      expect(result.mode).toBe(MatchMode.SUPPLEMENTARY_TIME);
    });

    it('retourne SUDDEN_DEATH_TIMEOUT si scores = 10 à égalité', () => {
      const result = checkTimeoutSuddenDeath(0, 10, 10);

      expect(result.shouldTrigger).toBe(true);
      expect(result.mode).toBe(MatchMode.SUDDEN_DEATH_TIMEOUT);
    });

    it('retourne SUDDEN_DEATH_TIMEOUT si scores > 10 à égalité', () => {
      expect(checkTimeoutSuddenDeath(0, 11, 11).mode).toBe(MatchMode.SUDDEN_DEATH_TIMEOUT);
      expect(checkTimeoutSuddenDeath(0, 13, 13).mode).toBe(MatchMode.SUDDEN_DEATH_TIMEOUT);
    });
  });

  describe('Non-déclenchement', () => {
    it('ne se déclenche PAS si du temps reste', () => {
      expect(checkTimeoutSuddenDeath(30, 7, 7).shouldTrigger).toBe(false);
      expect(checkTimeoutSuddenDeath(1, 5, 5).shouldTrigger).toBe(false);
      expect(checkTimeoutSuddenDeath(180, 0, 0).shouldTrigger).toBe(false);
    });

    it("ne se déclenche PAS si pas d'égalité (même temps = 0)", () => {
      expect(checkTimeoutSuddenDeath(0, 8, 7).shouldTrigger).toBe(false);
      expect(checkTimeoutSuddenDeath(0, 5, 10).shouldTrigger).toBe(false);
    });
  });
});

// ============================================================================
// Tests pour isValidSuddenDeathTouch
// Règle FFE: Seule zone C compte en mort subite
// ============================================================================

describe('isValidSuddenDeathTouch', () => {
  describe('En mode Mort Subite', () => {
    it('Zone C est VALIDE', () => {
      const resultChallenger = isValidSuddenDeathTouch(
        TargetZone.ZONE_C,
        MatchMode.SUDDEN_DEATH_CHALLENGER
      );
      const resultTimeout = isValidSuddenDeathTouch(
        TargetZone.ZONE_C,
        MatchMode.SUDDEN_DEATH_TIMEOUT
      );

      expect(resultChallenger.isValid).toBe(true);
      expect(resultTimeout.isValid).toBe(true);
    });

    it('Zone A est INVALIDE (priorité seulement)', () => {
      const result = isValidSuddenDeathTouch(TargetZone.ZONE_A, MatchMode.SUDDEN_DEATH_CHALLENGER);

      expect(result.isValid).toBe(false);
      expect(result.message).toContain('priorité');
    });

    it('Zone B est INVALIDE (priorité seulement)', () => {
      const result = isValidSuddenDeathTouch(TargetZone.ZONE_B, MatchMode.SUDDEN_DEATH_TIMEOUT);

      expect(result.isValid).toBe(false);
    });
  });

  describe('En mode Temps Supplémentaire', () => {
    it('Toutes les zones sont VALIDES (A, B, C)', () => {
      const resultA = isValidSuddenDeathTouch(TargetZone.ZONE_A, MatchMode.SUPPLEMENTARY_TIME);
      const resultB = isValidSuddenDeathTouch(TargetZone.ZONE_B, MatchMode.SUPPLEMENTARY_TIME);
      const resultC = isValidSuddenDeathTouch(TargetZone.ZONE_C, MatchMode.SUPPLEMENTARY_TIME);

      expect(resultA.isValid).toBe(true);
      expect(resultB.isValid).toBe(true);
      expect(resultC.isValid).toBe(true);
    });
  });

  describe('En mode Normal', () => {
    it('Toutes les zones sont VALIDES', () => {
      const resultA = isValidSuddenDeathTouch(TargetZone.ZONE_A, MatchMode.NORMAL);
      const resultB = isValidSuddenDeathTouch(TargetZone.ZONE_B, MatchMode.NORMAL);
      const resultC = isValidSuddenDeathTouch(TargetZone.ZONE_C, MatchMode.NORMAL);

      expect(resultA.isValid).toBe(true);
      expect(resultB.isValid).toBe(true);
      expect(resultC.isValid).toBe(true);
    });
  });
});

// ============================================================================
// Tests pour shouldEndMatch
// ============================================================================

describe('shouldEndMatch', () => {
  describe('Mode Normal', () => {
    it('termine si score atteint 15', () => {
      expect(shouldEndMatch(MatchMode.NORMAL, 15, 10)).toBe(true);
      expect(shouldEndMatch(MatchMode.NORMAL, 8, 15)).toBe(true);
    });

    it('ne termine PAS si score < 15', () => {
      expect(shouldEndMatch(MatchMode.NORMAL, 14, 10)).toBe(false);
      expect(shouldEndMatch(MatchMode.NORMAL, 10, 10)).toBe(false);
    });

    it('respecte un maxScore personnalisé', () => {
      expect(shouldEndMatch(MatchMode.NORMAL, 10, 5, undefined, 10)).toBe(true);
      expect(shouldEndMatch(MatchMode.NORMAL, 9, 5, undefined, 10)).toBe(false);
    });
  });

  describe('Mode Temps Supplémentaire', () => {
    it("termine dès qu'il y a un écart de score", () => {
      expect(shouldEndMatch(MatchMode.SUPPLEMENTARY_TIME, 11, 10)).toBe(true);
      expect(shouldEndMatch(MatchMode.SUPPLEMENTARY_TIME, 10, 12)).toBe(true);
    });

    it("ne termine PAS s'il y a égalité", () => {
      expect(shouldEndMatch(MatchMode.SUPPLEMENTARY_TIME, 10, 10)).toBe(false);
      expect(shouldEndMatch(MatchMode.SUPPLEMENTARY_TIME, 0, 0)).toBe(false);
    });
  });

  describe('Mode Mort Subite', () => {
    it('termine si Zone C et écart de score', () => {
      expect(shouldEndMatch(MatchMode.SUDDEN_DEATH_CHALLENGER, 15, 10, TargetZone.ZONE_C)).toBe(
        true
      );
    });

    it('ne termine PAS si Zone C mais égalité', () => {
      expect(shouldEndMatch(MatchMode.SUDDEN_DEATH_CHALLENGER, 10, 10, TargetZone.ZONE_C)).toBe(
        false
      );
    });

    it('ne termine PAS si Zone A/B', () => {
      expect(shouldEndMatch(MatchMode.SUDDEN_DEATH_TIMEOUT, 11, 10, TargetZone.ZONE_A)).toBe(false);
      expect(shouldEndMatch(MatchMode.SUDDEN_DEATH_TIMEOUT, 13, 10, TargetZone.ZONE_B)).toBe(false);
    });
  });
});

// ============================================================================
// Tests pour drawWinner (tirage au sort)
// ============================================================================

describe('drawWinner', () => {
  it('retourne soit A soit B', () => {
    const result = drawWinner();

    expect(['A', 'B']).toContain(result);
  });

  it('distribution aléatoire (sur 100 tirages)', () => {
    const results = { A: 0, B: 0 };

    for (let i = 0; i < 100; i++) {
      results[drawWinner()]++;
    }

    // On s'attend à une distribution ~50/50 avec marge
    expect(results.A).toBeGreaterThan(20);
    expect(results.B).toBeGreaterThan(20);
  });
});

// ============================================================================
// Tests pour les constantes et formatage
// ============================================================================

describe('Constantes et formatage', () => {
  it('durée mort subite = 30 secondes', () => {
    expect(getSuddenDeathOvertimeDuration()).toBe(30);
  });

  it('durée match = 180 secondes (3 min)', () => {
    expect(getMatchDuration()).toBe(180);
  });

  it('formatSuddenDeathTime formate correctement', () => {
    expect(formatSuddenDeathTime(30)).toBe('00:30');
    expect(formatSuddenDeathTime(5)).toBe('00:05');
    expect(formatSuddenDeathTime(0)).toBe('00:00');
  });

  it('getSuddenDeathRules retourne les règles', () => {
    const rules = getSuddenDeathRules();

    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.includes('ZONE C'))).toBe(true);
  });
});

// ============================================================================
// Tests pour isSupplementaryTime
// ============================================================================

describe('isSupplementaryTime', () => {
  it('retourne true pour SUPPLEMENTARY_TIME', () => {
    expect(isSupplementaryTime(MatchMode.SUPPLEMENTARY_TIME)).toBe(true);
  });

  it('retourne false pour les autres modes', () => {
    expect(isSupplementaryTime(MatchMode.NORMAL)).toBe(false);
    expect(isSupplementaryTime(MatchMode.SUDDEN_DEATH_CHALLENGER)).toBe(false);
    expect(isSupplementaryTime(MatchMode.SUDDEN_DEATH_TIMEOUT)).toBe(false);
  });
});
