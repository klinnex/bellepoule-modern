/**
 * BellePoule Modern - Noms et nations pour les appareils Cyrano (#1720)
 * Cyrano n'affiche que l'alphabet latin : translittération puis convention
 * olympique (NOM + initiale du prénom) sur 10, 12 ou 15 caractères.
 * Licensed under GPL-3.0
 */

export type CyranoNameLength = 10 | 12 | 15 | 20;

/** Lettres sans décomposition Unicode (NFD) : table minimale. */
const SPECIAL: Record<string, string> = {
  ß: 'SS',
  Æ: 'AE',
  æ: 'ae',
  Œ: 'OE',
  œ: 'oe',
  Ø: 'O',
  ø: 'o',
  Đ: 'D',
  đ: 'd',
  Ł: 'L',
  ł: 'l',
  Þ: 'TH',
  þ: 'th',
  ı: 'i',
};

/**
 * Translittère en ASCII imprimable : accents retirés (NFD), lettres spéciales
 * remplacées, tout autre caractère non latin supprimé.
 */
export function transliterate(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue; // diacritiques combinants
    if (SPECIAL[ch] !== undefined) out += SPECIAL[ch];
    else if (code >= 0x20 && code < 0x7f && ch !== '|' && ch !== '%') out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Nom d'affichage : `NOM P` (convention olympique), NOM tronqué pour garder
 * l'initiale du prénom tant que la longueur le permet.
 */
export function formatCyranoName(
  lastName: string,
  firstName: string,
  maxLength: CyranoNameLength = 10
): string {
  const last = transliterate(lastName).toUpperCase();
  const first = transliterate(firstName);
  const initial = first ? first[0].toUpperCase() : '';
  if (!last) return first.slice(0, maxLength);
  if (!initial) return last.slice(0, maxLength);
  const full = `${last} ${initial}`;
  if (full.length <= maxLength) return full;
  return `${last.slice(0, Math.max(1, maxLength - 2)).trimEnd()} ${initial}`.slice(0, maxLength);
}

/** Champ « nation » sur 3 caractères (code pays, sigle de club ou de ligue). */
export function formatCyranoNat(value: string | undefined | null): string {
  if (!value) return '';
  return transliterate(value).replace(/\s/g, '').toUpperCase().slice(0, 3);
}
