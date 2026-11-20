/**
 * BellePoule Modern - Penalty Utils
 * Feature 23: Utility functions
 * Licensed under GPL-3.0
 */

import { CardType, PenaltyReason, Penalty } from '../../../shared/domain/penalties/penalty.types';

export function getPenaltyDescription(reason: PenaltyReason): string {
  const descriptions: Record<PenaltyReason, string> = {
    [PenaltyReason.DELAY]: 'Retard au match',
    [PenaltyReason.UNCORRECT_BEHAVIOR]: 'Comportement incorrect',
    [PenaltyReason.REFUSAL_OBEY]: "Refus d'obéir à l'arbitre",
    [PenaltyReason.VIOLENCE]: 'Violence',
    [PenaltyReason.FRAUD]: 'Fraude',
    [PenaltyReason.DOPING]: 'Dopage',
    [PenaltyReason.DISTURBANCE]: "Trouble à l'ordre public",
    [PenaltyReason.EQUIPMENT]: 'Equipement non conforme',
  };
  return descriptions[reason] || reason;
}

export function getPenaltyColor(cardType: CardType): string {
  const colors: Record<CardType, string> = {
    [CardType.WHITE]: '#ffffff', // white
    [CardType.YELLOW]: '#fbbf24', // amber-400
    [CardType.RED]: '#ef4444', // red-500
    [CardType.BLACK]: '#000000', // black
  };
  return colors[cardType];
}

export function validatePenalty(penalty: Partial<Penalty>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!penalty.fencerId) {
    errors.push('Fencer ID is required');
  }

  if (!penalty.matchId) {
    errors.push('Match ID is required');
  }

  if (!penalty.cardType) {
    errors.push('Card type is required');
  }

  if (!penalty.reason) {
    errors.push('Reason is required');
  }

  if (penalty.reason === PenaltyReason.OTHER && !penalty.customReason) {
    errors.push('Custom reason is required when reason is OTHER');
  }

  return { valid: errors.length === 0, errors };
}

export function getCardTypeLabel(cardType: CardType): string {
  const labels: Record<CardType, string> = {
    [CardType.WHITE]: 'Carton Blanc',
    [CardType.YELLOW]: 'Carton Jaune',
    [CardType.RED]: 'Carton Rouge',
    [CardType.BLACK]: 'Carton Noir',
  };
  return labels[cardType];
}

export function getImpactDescription(cardType: CardType, touches: number): string {
  switch (cardType) {
    case CardType.WHITE:
      return 'Avertissement (carton blanc)';
    case CardType.YELLOW:
      return 'Avertissement';
    case CardType.RED:
      return `-${touches} touche${touches > 1 ? 's' : ''}`;
    case CardType.BLACK:
      return 'Exclusion du match';
    default:
      return '';
  }
}
