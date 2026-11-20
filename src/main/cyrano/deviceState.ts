/**
 * BellePoule Modern - Champs Cyrano d'un appareil : Id, chrono, cartons P (#1720, #1829)
 * Conversions propres au protocole, utilisées par le pilote Cyrano (`driver.ts`) ; la lecture
 * d'un état rapportée au match de l'arène est hors protocole (`src/main/piste/pisteState.ts`).
 * - Id tireur : le protocole limite le champ à 8 caractères ; les identifiants BellePoule
 *   (UUID, 36 caractères) arrivent tronqués.
 * - Chrono `m:ss` / `m:ss.cc` → secondes.
 * - Carton P (EFP1.1, champ 12) ↔ compteurs jaune / rouge / noir P.
 * Licensed under GPL-3.0
 */

import { sanitizeField } from './codec';

/** Longueur maximale du champ Id d'un tireur (spécification, zone tireur R1 / L1). */
export const CYRANO_FENCER_ID_MAX = 8;

/** Identifiant tel qu'il circule dans les trames (préfixe nettoyé de 8 caractères). */
export function cyranoFencerId(id: string): string {
  return sanitizeField(id, CYRANO_FENCER_ID_MAX);
}

/** Chrono Cyrano (`m:ss` ou `m:ss.cc` sous 10 s) → secondes ; null si absent ou illisible. */
export function parseCyranoStopwatch(value: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?$/.exec(value?.trim() ?? '');
  if (!m) return null;
  const sec = Number(m[2]);
  if (sec > 59) return null;
  const cs = m[3] ? Number(m[3].padEnd(2, '0')) : 0;
  return Number(m[1]) * 60 + sec + cs / 100;
}

export interface PCardCounts {
  pYellow?: number;
  pRed?: number;
  pBlack?: number;
}

/**
 * Champ 12 reçu (0 à 5) → cartons P : 1 jaune P (sans effet sur le score), 2 rouge P, 3 deux
 * rouges P, 4 noir P, 5 deux noirs P. Compteurs nuls omis.
 */
export function cyranoPCardCounts(value: number | undefined): PCardCounts {
  switch (value) {
    case 1:
      return { pYellow: 1 };
    case 2:
      return { pRed: 1 };
    case 3:
      return { pRed: 2 };
    case 4:
      return { pBlack: 1 };
    case 5:
      return { pBlack: 2 };
    default:
      return {};
  }
}

/** Champ 12 du DISP : règle 2026-2027, 0, 2 ou 4 ; le noir P prime sur le rouge P. */
export function cyranoPCardField(counts: PCardCounts): number {
  if ((counts.pBlack ?? 0) > 0) return 4;
  if ((counts.pRed ?? 0) > 0) return 2;
  return 0;
}
