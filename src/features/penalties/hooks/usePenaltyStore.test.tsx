// @vitest-environment jsdom
/**
 * Tests unitaires - usePenaltyStore (logique métier)
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePenaltyStore } from './usePenaltyStore';
import { CardType, PenaltyReason, DEFAULT_PENALTY_CONFIG } from '../types/penalty.types';

const reset = () =>
  usePenaltyStore.setState({ penalties: [], config: DEFAULT_PENALTY_CONFIG, error: null });

const add = (fencerId: string, cardType: CardType) =>
  usePenaltyStore.getState().addPenalty({
    fencerId,
    matchId: 'm1',
    cardType,
    reason: PenaltyReason.DELAY,
  } as any);

beforeEach(() => reset());

describe('addPenalty / removePenalty', () => {
  it('ajoute une pénalité avec scoreImpact issu de la config', () => {
    const p = add('f1', CardType.RED);
    expect(usePenaltyStore.getState().penalties).toHaveLength(1);
    expect(p.scoreImpact).toBe(DEFAULT_PENALTY_CONFIG.redCardTouches);
    expect(p.fencerId).toBe('f1');
  });

  it('supprime une pénalité par id', () => {
    const p = add('f1', CardType.YELLOW);
    usePenaltyStore.getState().removePenalty(p.id);
    expect(usePenaltyStore.getState().penalties).toHaveLength(0);
  });
});

describe('getFencerHistory', () => {
  it('compte les cartons par type et déduit l’exclusion', () => {
    add('f1', CardType.YELLOW);
    add('f1', CardType.YELLOW);
    const h = usePenaltyStore.getState().getFencerHistory('f1');
    expect(h.yellowCards).toBe(2);
    expect(h.isExcluded).toBe(true);
  });

  it('isole les pénalités par tireur', () => {
    add('f1', CardType.YELLOW);
    add('f2', CardType.RED);
    expect(usePenaltyStore.getState().getFencerHistory('f2').redCards).toBe(1);
    expect(usePenaltyStore.getState().getFencerHistory('f2').yellowCards).toBe(0);
  });
});

describe('shouldExcludeFencer', () => {
  it('exclut après 2 cartons jaunes', () => {
    add('f1', CardType.YELLOW);
    expect(usePenaltyStore.getState().shouldExcludeFencer('f1')).toBe(false);
    add('f1', CardType.YELLOW);
    expect(usePenaltyStore.getState().shouldExcludeFencer('f1')).toBe(true);
  });

  it('exclut immédiatement sur carton noir', () => {
    add('f9', CardType.BLACK);
    expect(usePenaltyStore.getState().shouldExcludeFencer('f9')).toBe(true);
  });
});

describe('getNextCardType', () => {
  it('jaune par défaut, rouge après le seuil de jaunes', () => {
    expect(usePenaltyStore.getState().getNextCardType('f1')).toBe(CardType.YELLOW);
    add('f1', CardType.YELLOW);
    add('f1', CardType.YELLOW);
    expect(usePenaltyStore.getState().getNextCardType('f1')).toBe(CardType.RED);
  });
});

describe('calculateScoreImpact / updateConfig', () => {
  it('reflète la config courante', () => {
    const store = usePenaltyStore.getState();
    expect(store.calculateScoreImpact({ cardType: CardType.RED } as any)).toBe(
      DEFAULT_PENALTY_CONFIG.redCardTouches
    );
    store.updateConfig({ redCardTouches: 5 });
    expect(usePenaltyStore.getState().calculateScoreImpact({ cardType: CardType.RED } as any)).toBe(
      5
    );
  });
});
