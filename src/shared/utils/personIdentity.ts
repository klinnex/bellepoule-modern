/**
 * BellePoule Modern - Identité d'une personne pour le dédoublonnage (#1880, RGPD #1882)
 * Source unique : imports de l'écran (arbitres), outils MCP (tireurs, arbitres), RGPD.
 * Licensed under GPL-3.0
 */

/** Minuscules sans accents ni espaces superflus */
export function normalizeIdentity(text: unknown): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé de regroupement : licence si connue, sinon nom + prénom + date de naissance */
export function identityKey(p: {
  license?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  birthDate?: string | null;
}): string {
  const license = normalizeIdentity(p.license).replace(/\s/g, '');
  if (license) return `lic:${license}`;
  return `name:${normalizeIdentity(p.lastName)}|${normalizeIdentity(p.firstName)}|${String(
    p.birthDate ?? ''
  ).slice(0, 10)}`;
}

/**
 * Clés de dédoublonnage à l'import (tireurs, arbitres) : nom + prénom, et licence si connue.
 * Deux personnes sont le même import dès qu'une clé coïncide.
 */
export function importIdentityKeys(p: {
  lastName?: string | null;
  firstName?: string | null;
  license?: string | null;
}): string[] {
  const keys = [identityKey({ lastName: p.lastName, firstName: p.firstName })];
  if (p.license) keys.push(identityKey({ license: p.license }));
  return keys;
}
