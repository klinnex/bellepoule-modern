/**
 * BellePoule Modern - Position des tireurs dans la saisie de score du tableau (#1826)
 * Reflète la position réelle sur la piste : le premier appelé (A) est à droite,
 * le second (B) à gauche ; un gaucher face à un droitier reste à gauche.
 * Licensed under GPL-3.0
 */

import type { TableauMatch } from './tableauTypes';

export type TableauSide = 'A' | 'B';

/** Tireur affiché à gauche dans la fenêtre de saisie */
export function tableauLeftSide(match: Pick<TableauMatch, 'fencerA' | 'fencerB'>): TableauSide {
  const leftA = match.fencerA?.handedness === 'L';
  const leftB = match.fencerB?.handedness === 'L';
  if (leftA !== leftB) return leftA ? 'A' : 'B';
  return 'B';
}
