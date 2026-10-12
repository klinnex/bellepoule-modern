import { describe, it, expect } from 'vitest';
import {
  determineCardType,
  createCard,
  getCardsForFencer,
  isFencerExcluded,
} from '../../shared/utils/cardSystem';
import { Card, CardGroup, CardReason } from '../../shared/types';
import { CardType } from './types/penalty.types';
import {
  getPenaltyDescription,
  getPenaltyColor,
  validatePenalty,
  getCardTypeLabel,
} from './utils/penaltyUtils';
import { PenaltyReason } from './types/penalty.types';

// ============================================================================
// Helpers
// ============================================================================

const card = (group: CardGroup, type: CardType, fencerId = 'f1'): Card => ({
  id: `c-${Math.random()}`,
  matchId: 'm1',
  fencerId,
  type,
  reason: CardReason.EARLY_START,
  group,
  timestamp: new Date(),
  pointsAwarded: type === CardType.RED ? 1 : type === CardType.YELLOW ? 1 : 0,
  resultingExclusion: type === CardType.BLACK,
});

// ============================================================================
// Progression CardGroup - règles de Sabre Laser
// ============================================================================

describe('CardGroup progression – Sabre Laser', () => {
  describe("GROUP_1: Blanc → Jaune → Jaune (pas d'exclusion)", () => {
    it('premier carton GROUP_1 → WHITE', () => {
      const result = determineCardType(CardReason.EARLY_START, []);
      expect(result.type).toBe(CardType.WHITE);
      expect(result.shouldExclude).toBe(false);
      expect(result.points).toBe(0);
    });

    it('deuxième carton GROUP_1 → YELLOW', () => {
      const prev = [card(CardGroup.GROUP_1, CardType.WHITE)];
      const result = determineCardType(CardReason.TIME_WASTING, prev);
      expect(result.type).toBe(CardType.YELLOW);
      expect(result.shouldExclude).toBe(false);
      expect(result.points).toBe(1);
    });

    it('troisième carton GROUP_1 → toujours YELLOW (pas de BLACK)', () => {
      const prev = [
        card(CardGroup.GROUP_1, CardType.WHITE),
        card(CardGroup.GROUP_1, CardType.YELLOW),
      ];
      const result = determineCardType(CardReason.BODY_CONTACT, prev);
      expect(result.type).toBe(CardType.YELLOW);
      expect(result.shouldExclude).toBe(false);
    });
  });

  describe('GROUP_2: Jaune → Rouge', () => {
    it('premier carton GROUP_2 → YELLOW (+1 point)', () => {
      const result = determineCardType(CardReason.ESTOC, []);
      expect(result.type).toBe(CardType.YELLOW);
      expect(result.points).toBe(1);
    });

    it('deuxième carton GROUP_2 → RED (+1 point)', () => {
      const prev = [card(CardGroup.GROUP_2, CardType.YELLOW)];
      const result = determineCardType(CardReason.HEAVY_HIT, prev);
      expect(result.type).toBe(CardType.RED);
      expect(result.shouldExclude).toBe(false);
      expect(result.points).toBe(1);
    });
  });

  describe('GROUP_3: Rouge → Exclusion (BLACK)', () => {
    it('premier carton GROUP_3 → RED', () => {
      const result = determineCardType(CardReason.BRUTALITY, []);
      expect(result.type).toBe(CardType.RED);
      expect(result.shouldExclude).toBe(false);
    });

    it('deuxième carton GROUP_3 → BLACK (exclusion)', () => {
      const prev = [card(CardGroup.GROUP_3, CardType.RED)];
      const result = determineCardType(CardReason.DANGEROUS, prev);
      expect(result.type).toBe(CardType.BLACK);
      expect(result.shouldExclude).toBe(true);
    });
  });

  describe('GROUP_4: Exclusion immédiate', () => {
    it('premier carton REFUSAL → BLACK direct', () => {
      const result = determineCardType(CardReason.REFUSAL, []);
      expect(result.type).toBe(CardType.BLACK);
      expect(result.shouldExclude).toBe(true);
    });

    it('premier carton CHEATING → BLACK direct', () => {
      const result = determineCardType(CardReason.CHEATING, []);
      expect(result.type).toBe(CardType.BLACK);
      expect(result.shouldExclude).toBe(true);
    });

    it('BLACK GROUP_4 même avec historique GROUP_4', () => {
      const prev = [card(CardGroup.GROUP_4, CardType.BLACK)];
      const result = determineCardType(CardReason.UNSPORTSMANLIKE, prev);
      expect(result.type).toBe(CardType.BLACK);
      expect(result.shouldExclude).toBe(true);
    });
  });

  describe('Groupes indépendants par match', () => {
    it('cartons GROUP_1 ne font pas monter GROUP_2', () => {
      const prev = [
        card(CardGroup.GROUP_1, CardType.WHITE),
        card(CardGroup.GROUP_1, CardType.YELLOW),
      ];
      const result = determineCardType(CardReason.ESTOC, prev); // GROUP_2 first infraction
      expect(result.type).toBe(CardType.YELLOW);
    });

    it('cartons GROUP_3 ne font pas monter GROUP_4', () => {
      const prev = [card(CardGroup.GROUP_3, CardType.RED)];
      const result = determineCardType(CardReason.REFUSAL, prev); // GROUP_4 first infraction
      expect(result.type).toBe(CardType.BLACK);
      expect(result.shouldExclude).toBe(true);
    });

    it("cartons d'autres groupes ignorés pour GROUP_2", () => {
      const prev = [
        card(CardGroup.GROUP_1, CardType.WHITE),
        card(CardGroup.GROUP_1, CardType.YELLOW),
        card(CardGroup.GROUP_3, CardType.RED),
      ];
      const result = determineCardType(CardReason.VOLUNTARY_EXIT, prev); // GROUP_2, count=0
      expect(result.type).toBe(CardType.YELLOW);
    });
  });
});

// ============================================================================
// isFencerExcluded
// ============================================================================

describe('isFencerExcluded', () => {
  it('retourne true si un carton BLACK avec exclusion', () => {
    const cards: Card[] = [card(CardGroup.GROUP_4, CardType.BLACK, 'f1')];
    expect(isFencerExcluded('f1', cards)).toBe(true);
  });

  it('retourne false sans carton noir', () => {
    const cards: Card[] = [
      card(CardGroup.GROUP_1, CardType.WHITE, 'f1'),
      card(CardGroup.GROUP_2, CardType.YELLOW, 'f1'),
    ];
    expect(isFencerExcluded('f1', cards)).toBe(false);
  });
});

// ============================================================================
// penaltyUtils
// ============================================================================

describe('penaltyUtils', () => {
  it('getPenaltyDescription retourne une chaîne non vide pour chaque raison', () => {
    Object.values(PenaltyReason).forEach(reason => {
      const desc = getPenaltyDescription(reason);
      expect(desc.length).toBeGreaterThan(0);
    });
  });

  it('getPenaltyColor retourne des codes hex valides', () => {
    [CardType.WHITE, CardType.YELLOW, CardType.RED, CardType.BLACK].forEach(type => {
      const color = getPenaltyColor(type);
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it('validatePenalty valide une pénalité complète', () => {
    const penalty = {
      fencerId: 'f1',
      matchId: 'm1',
      cardType: CardType.YELLOW,
      reason: PenaltyReason.DELAY,
    };
    const { valid, errors } = validatePenalty(penalty);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('validatePenalty invalide si fencerId manquant', () => {
    const penalty = {
      matchId: 'm1',
      cardType: CardType.YELLOW,
      reason: PenaltyReason.DELAY,
    };
    const { valid, errors } = validatePenalty(penalty);
    expect(valid).toBe(false);
    expect(errors.some(e => e.toLowerCase().includes('fencer'))).toBe(true);
  });

  it('getCardTypeLabel retourne le bon label français', () => {
    expect(getCardTypeLabel(CardType.YELLOW)).toBe('Carton Jaune');
    expect(getCardTypeLabel(CardType.RED)).toBe('Carton Rouge');
    expect(getCardTypeLabel(CardType.BLACK)).toBe('Carton Noir');
    expect(getCardTypeLabel(CardType.WHITE)).toBe('Carton Blanc');
  });
});
