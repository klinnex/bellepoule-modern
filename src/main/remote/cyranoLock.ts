/**
 * BellePoule Modern - Verrou de saisie quand l'appareil de piste fait foi (#1829)
 * Appareil Cyrano en mode maître et en ligne : points et cartons viennent de l'appareil ; la
 * tablette ne fait que corriger par retrait. Les entrées de l'appareil (pseudo-socket
 * `cyrano:<piste>`) passent toujours.
 * Licensed under GPL-3.0
 */
import type { ArenaCyranoLink } from '../../shared/types/remote';

/** Appareil de piste relié à l'arène, en mode maître et en ligne */
export function isCyranoMasterOnline(
  arena: { cyrano?: ArenaCyranoLink | null } | null | undefined
): boolean {
  return arena?.cyrano?.mode === 'master' && arena.cyrano.online === true;
}

/** Socket de l'appareil de piste (PisteHub) */
export function isDeviceSocket(socketId: string | undefined): boolean {
  return typeof socketId === 'string' && socketId.startsWith('cyrano:');
}

/**
 * Vrai si `next` ajoute au moins un carton à `current` (comptage par type : un retrait, un
 * réordonnancement ou une liste absente n'ajoutent rien).
 */
export function addsCard(current: readonly string[] | undefined, next: unknown): boolean {
  if (!Array.isArray(next)) return false;
  const counts = new Map<string, number>();
  for (const c of current ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const c of next) {
    const key = String(c);
    const left = counts.get(key) ?? 0;
    if (left === 0) return true;
    counts.set(key, left - 1);
  }
  return false;
}
