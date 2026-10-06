/**
 * BellePoule Modern - Card System (FFE Sabre Laser)
 * Gestion des cartons selon le règlement 2025-2026
 * Licensed under GPL-3.0
 */

import { v4 as uuidv4 } from 'uuid';
import { Card, CardGroup, CardReason, Weapon, WeaponCardConfig } from '../types';
import { CardType } from '../../features/penalties/types/penalty.types';

const REASON_TO_GROUP: Record<CardReason, CardGroup> = {
  [CardReason.EARLY_START]: CardGroup.GROUP_1,
  [CardReason.LATE_STOP]: CardGroup.GROUP_1,
  [CardReason.BODY_CONTACT]: CardGroup.GROUP_1,
  [CardReason.COUNTER_ATTACK]: CardGroup.GROUP_1,
  [CardReason.TARGET_SUBSTITUTION]: CardGroup.GROUP_1,
  [CardReason.VOLUNTARY_DROP]: CardGroup.GROUP_1,
  [CardReason.TIME_WASTING]: CardGroup.GROUP_1,
  [CardReason.NON_COMPLIANT_GEAR]: CardGroup.GROUP_1,
  [CardReason.ESTOC]: CardGroup.GROUP_2,
  [CardReason.UNARMED_HAND]: CardGroup.GROUP_2,
  [CardReason.VOLUNTARY_EXIT]: CardGroup.GROUP_2,
  [CardReason.HEAVY_HIT]: CardGroup.GROUP_2,
  [CardReason.BRUTALITY]: CardGroup.GROUP_3,
  [CardReason.DANGEROUS]: CardGroup.GROUP_3,
  [CardReason.REFUSAL]: CardGroup.GROUP_4,
  [CardReason.UNSPORTSMANLIKE]: CardGroup.GROUP_4,
  [CardReason.CHEATING]: CardGroup.GROUP_4,
};

const ALL_REASONS = Object.values(CardReason);

const CLASSICAL_SCORE_IMPACT = { white: 0, yellow: 1, red: 1, black: 0 };

export const WEAPON_CARD_CONFIGS: Record<Weapon, WeaponCardConfig> = {
  [Weapon.EPEE]: {
    availableReasons: ALL_REASONS,
    reasonToGroup: REASON_TO_GROUP,
    scoreImpact: CLASSICAL_SCORE_IMPACT,
  },
  [Weapon.FOIL]: {
    availableReasons: ALL_REASONS,
    reasonToGroup: REASON_TO_GROUP,
    scoreImpact: CLASSICAL_SCORE_IMPACT,
  },
  [Weapon.SABRE]: {
    availableReasons: ALL_REASONS,
    reasonToGroup: REASON_TO_GROUP,
    scoreImpact: CLASSICAL_SCORE_IMPACT,
  },
  [Weapon.LASER]: {
    availableReasons: ALL_REASONS,
    reasonToGroup: REASON_TO_GROUP,
    scoreImpact: { white: 0, yellow: 1, red: 1, black: 0 },
  },
  [Weapon.CUSTOM]: {
    availableReasons: ALL_REASONS,
    reasonToGroup: REASON_TO_GROUP,
    scoreImpact: CLASSICAL_SCORE_IMPACT,
  },
};

export function getWeaponCardConfig(weapon: Weapon): WeaponCardConfig {
  return WEAPON_CARD_CONFIGS[weapon];
}

export function getAvailableReasons(weapon: Weapon): CardReason[] {
  return WEAPON_CARD_CONFIGS[weapon].availableReasons;
}

export function getReasonsByGroupForWeapon(weapon: Weapon): Record<CardGroup, CardReason[]> {
  const config = WEAPON_CARD_CONFIGS[weapon];
  const grouped: Record<CardGroup, CardReason[]> = {
    [CardGroup.GROUP_1]: [],
    [CardGroup.GROUP_2]: [],
    [CardGroup.GROUP_3]: [],
    [CardGroup.GROUP_4]: [],
  };
  for (const reason of config.availableReasons) {
    const group = config.reasonToGroup[reason];
    if (group !== undefined) grouped[group].push(reason);
  }
  return grouped;
}

export const CARD_REASON_LABELS: Record<CardReason, string> = {
  [CardReason.EARLY_START]: 'Départ anticipé',
  [CardReason.LATE_STOP]: 'Continue après "Cessez!"',
  [CardReason.BODY_CONTACT]: 'Corps à corps volontaire',
  [CardReason.COUNTER_ATTACK]: 'Contre-attaque',
  [CardReason.TARGET_SUBSTITUTION]: 'Substitution de cible',
  [CardReason.VOLUNTARY_DROP]: 'Lâcher de sabre volontaire',
  [CardReason.TIME_WASTING]: 'Perte de temps',
  [CardReason.NON_COMPLIANT_GEAR]: 'Matériel non conforme',
  [CardReason.ESTOC]: 'Coup de pointe (estoc)',
  [CardReason.UNARMED_HAND]: 'Usage main non armée',
  [CardReason.VOLUNTARY_EXIT]: 'Sortie volontaire',
  [CardReason.HEAVY_HIT]: 'Frappe lourde',
  [CardReason.BRUTALITY]: 'Brutalité',
  [CardReason.DANGEROUS]: 'Comportement dangereux',
  [CardReason.REFUSAL]: 'Refus de combattre',
  [CardReason.UNSPORTSMANLIKE]: 'Anti-sportif',
  [CardReason.CHEATING]: 'Tricherie',
};

export const CARD_GROUP_LABELS: Record<CardGroup, string> = {
  [CardGroup.GROUP_1]: 'Groupe 1 (Blanc → Jaune → Jaune)',
  [CardGroup.GROUP_2]: 'Groupe 2 (Jaune → Rouge → Rouge)',
  [CardGroup.GROUP_3]: 'Groupe 3 (Rouge → Exclusion)',
  [CardGroup.GROUP_4]: 'Groupe 4 (Exclusion immédiate)',
};

export interface CardResult {
  type: CardType;
  shouldExclude: boolean;
  points: number;
}

export function determineCardType(
  reason: CardReason,
  previousCards: Card[],
  weapon?: Weapon
): CardResult {
  const config = weapon !== undefined ? WEAPON_CARD_CONFIGS[weapon] : null;
  const reasonToGroup = config?.reasonToGroup ?? REASON_TO_GROUP;
  const si = config?.scoreImpact ?? { white: 0, yellow: 1, red: 1, black: 0 };

  const group = reasonToGroup[reason];
  if (group === undefined) {
    return { type: CardType.WHITE, shouldExclude: false, points: 0 };
  }

  const sameGroupCards = previousCards.filter(c => c.group === group);
  const count = sameGroupCards.length;

  switch (group) {
    case CardGroup.GROUP_1:
      if (count === 0) return { type: CardType.WHITE, shouldExclude: false, points: si.white };
      return { type: CardType.YELLOW, shouldExclude: false, points: si.yellow };

    case CardGroup.GROUP_2:
      if (count === 0) return { type: CardType.YELLOW, shouldExclude: false, points: si.yellow };
      return { type: CardType.RED, shouldExclude: false, points: si.red };

    case CardGroup.GROUP_3:
      if (count === 0) return { type: CardType.RED, shouldExclude: false, points: si.red };
      return { type: CardType.BLACK, shouldExclude: true, points: si.black };

    case CardGroup.GROUP_4:
      return { type: CardType.BLACK, shouldExclude: true, points: si.black };

    default:
      return { type: CardType.WHITE, shouldExclude: false, points: si.white };
  }
}

export function createCard(
  matchId: string,
  fencerId: string,
  reason: CardReason,
  previousCards: Card[],
  weapon?: Weapon
): Card {
  const config = weapon !== undefined ? WEAPON_CARD_CONFIGS[weapon] : null;
  const reasonToGroup = config?.reasonToGroup ?? REASON_TO_GROUP;
  const { type, shouldExclude, points } = determineCardType(reason, previousCards, weapon);

  return {
    id: uuidv4(),
    matchId,
    fencerId,
    type,
    reason,
    group: reasonToGroup[reason] ?? REASON_TO_GROUP[reason],
    timestamp: new Date(),
    pointsAwarded: points,
    resultingExclusion: shouldExclude,
  };
}

export function getReasonsByGroup(): Record<CardGroup, CardReason[]> {
  const grouped: Record<CardGroup, CardReason[]> = {
    [CardGroup.GROUP_1]: [],
    [CardGroup.GROUP_2]: [],
    [CardGroup.GROUP_3]: [],
    [CardGroup.GROUP_4]: [],
  };

  for (const [reason, group] of Object.entries(REASON_TO_GROUP)) {
    grouped[group as CardGroup].push(reason as CardReason);
  }

  return grouped;
}

export function getCardsForFencer(fencerId: string, matchCards: Card[]): Card[] {
  return matchCards.filter(card => card.fencerId === fencerId);
}

export function isFencerExcluded(fencerId: string, matchCards: Card[]): boolean {
  const fencerCards = getCardsForFencer(fencerId, matchCards);
  return fencerCards.some(card => card.resultingExclusion);
}
