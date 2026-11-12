/**
 * BellePoule Modern - Placement gaucher/droitier (#1439)
 * Armes olympiques : un gaucher face à un droitier se place à gauche (rouge).
 * Par défaut le premier appelé (A) est à droite (vert), le second (B) à gauche (rouge).
 * Deux gauchers : placement de l'appel conservé.
 * Licensed under GPL-3.0
 */

const OLYMPIC_WEAPONS = ['E', 'F', 'S'];

type Handed = { handedness?: 'R' | 'L' | string } | null | undefined;

/** true si A (gaucher) doit passer à gauche face à B (droitier) */
export function needsLeftHandedSwap(
  weapon: string | null | undefined,
  fencerA: Handed,
  fencerB: Handed
): boolean {
  if (!weapon || !OLYMPIC_WEAPONS.includes(weapon)) return false;
  return fencerA?.handedness === 'L' && fencerB?.handedness !== 'L';
}
