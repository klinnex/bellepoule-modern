/**
 * Tests unitaires - penaltyUtils
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  getPenaltyDescription,
  getPenaltyColor,
  validatePenalty,
  getCardTypeLabel,
  getImpactDescription,
} from './penaltyUtils';
import { CardType, PenaltyReason } from '../../../shared/domain/penalties/penalty.types';

describe('getPenaltyDescription', () => {
  it('traduit chaque motif connu', () => {
    expect(getPenaltyDescription(PenaltyReason.VIOLENCE)).toBe('Violence');
    expect(getPenaltyDescription(PenaltyReason.DELAY)).toBe('Retard au match');
  });
});

describe('getPenaltyColor', () => {
  it('retourne une couleur par type de carton', () => {
    expect(getPenaltyColor(CardType.YELLOW)).toBe('#fbbf24');
    expect(getPenaltyColor(CardType.RED)).toBe('#ef4444');
    expect(getPenaltyColor(CardType.BLACK)).toBe('#000000');
    expect(getPenaltyColor(CardType.WHITE)).toBe('#ffffff');
  });
});

describe('getCardTypeLabel', () => {
  it('libellé français par type', () => {
    expect(getCardTypeLabel(CardType.YELLOW)).toBe('Carton Jaune');
    expect(getCardTypeLabel(CardType.BLACK)).toBe('Carton Noir');
  });
});

describe('validatePenalty', () => {
  const valid = {
    fencerId: 'f1',
    matchId: 'm1',
    cardType: CardType.YELLOW,
    reason: PenaltyReason.DELAY,
  };

  it('valide une pénalité complète', () => {
    expect(validatePenalty(valid)).toEqual({ valid: true, errors: [] });
  });

  it('liste les champs requis manquants', () => {
    const r = validatePenalty({});
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'Fencer ID is required',
        'Match ID is required',
        'Card type is required',
        'Reason is required',
      ])
    );
  });

  it('exige fencerId', () => {
    expect(validatePenalty({ ...valid, fencerId: undefined }).valid).toBe(false);
  });
});

describe('getImpactDescription', () => {
  it('jaune = avertissement, noir = exclusion', () => {
    expect(getImpactDescription(CardType.YELLOW, 0)).toBe('Avertissement');
    expect(getImpactDescription(CardType.BLACK, 0)).toBe('Exclusion du match');
  });

  it('rouge = retrait de touches avec accord pluriel', () => {
    expect(getImpactDescription(CardType.RED, 1)).toBe('-1 touche');
    expect(getImpactDescription(CardType.RED, 3)).toBe('-3 touches');
  });
});
