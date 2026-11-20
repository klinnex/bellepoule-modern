/**
 * BellePoule Modern - Mise en page de l'arbre du tableau (vue)
 * Séparé des règles du tableau (src/shared/domain/tableau, #1979) : hauteurs et positions en pixels.
 * Licensed under GPL-3.0
 */

export const BASE_MATCH_HEIGHT = 120; // +20 px : bandeau des badges piste/arbitre/signatures (#1440)
export const SLOT_HEIGHT = BASE_MATCH_HEIGHT + 50; // hauteur d'un créneau dans la première colonne

// Position verticale d'un match dans la vue arborescente complète
export const calculateMatchVerticalPosition = (
  matchRound: number,
  matchPosition: number,
  baseRound: number
): number => {
  // k = nombre de créneaux de la première colonne couverts par ce match
  const k = baseRound / matchRound;
  // Centre ce match verticalement dans ses k créneaux
  return (matchPosition + 0.5) * k * SLOT_HEIGHT - BASE_MATCH_HEIGHT / 2;
};
