/**
 * BellePoule Modern - Mode Club (#1872) : contenu des QR codes des cartes de membre
 * et des pistes, lus plus tard par webcam pour lancer un combat (piste puis 2 tireurs).
 * Format texte versionné, sans URL : `BPC1:M:<code>` (membre), `BPC1:A:<n>` (piste).
 * Licensed under GPL-3.0
 */

export const CLUB_QR_PREFIX = 'BPC1';

/** Code carte : 10 caractères hexadécimaux majuscules (40 bits aléatoires) */
export const CARD_CODE_RE = /^[0-9A-F]{10}$/;

export type ClubQrData = { kind: 'member'; code: string } | { kind: 'arena'; number: number };

export function normalizeCardCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  return CARD_CODE_RE.test(c) ? c : null;
}

export function memberQrPayload(cardCode: string): string {
  const c = normalizeCardCode(cardCode);
  if (!c) throw new Error(`Code carte invalide : ${cardCode}`);
  return `${CLUB_QR_PREFIX}:M:${c}`;
}

export function arenaQrPayload(arenaNumber: number): string {
  if (!Number.isInteger(arenaNumber) || arenaNumber < 1 || arenaNumber > 99) {
    throw new Error(`Numéro de piste invalide : ${arenaNumber}`);
  }
  return `${CLUB_QR_PREFIX}:A:${arenaNumber}`;
}

/** Décode un QR lu ; null si ce n'est pas un QR du Mode Club */
export function parseClubQr(text: unknown): ClubQrData | null {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split(':');
  if (parts.length !== 3 || parts[0] !== CLUB_QR_PREFIX) return null;
  if (parts[1] === 'M') {
    const code = normalizeCardCode(parts[2]);
    return code ? { kind: 'member', code } : null;
  }
  if (parts[1] === 'A' && /^\d{1,2}$/.test(parts[2])) {
    const n = Number(parts[2]);
    return n >= 1 ? { kind: 'arena', number: n } : null;
  }
  return null;
}
