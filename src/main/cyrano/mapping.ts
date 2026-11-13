/**
 * BellePoule Modern - Correspondance trames Cyrano ↔ domaine arène (#1720)
 * Le protocole limite l'Id d'un tireur à 8 caractères : la correspondance se fait donc
 * par préfixe, jamais par égalité stricte avec l'Id BellePoule (UUID de 36 caractères).
 * Licensed under GPL-3.0
 */

import type { ArenaMatch } from '../../shared/types/remote';
import { sanitizeField, type CyranoFencer, type CyranoMessage } from './codec';

/** Longueur maximale de l'Id tireur dans une trame (zone tireur, champ 1). */
export const CYRANO_FENCER_ID_LENGTH = 8;

/** Id tireur tel qu'il circule dans les trames : nettoyé et tronqué à 8 caractères. */
export function cyranoFencerId(id: string | undefined): string {
  return sanitizeField(id, CYRANO_FENCER_ID_LENGTH);
}

/** Les deux tireurs de la trame, rangés par côté A / B du match (indépendant de l'inversion). */
export interface SideFencers {
  A: CyranoFencer;
  B: CyranoFencer;
}

/**
 * Associe les tireurs droit / gauche de la trame aux côtés A / B du match.
 * Retourne `null` si les Id ne correspondent pas aux deux tireurs du match (BAD MATCH).
 */
export function fencersOfMatch(
  msg: CyranoMessage,
  match: Pick<ArenaMatch, 'fencerA' | 'fencerB'>
): SideFencers | null {
  const right = msg.right;
  const left = msg.left;
  if (!right?.id || !left?.id || !match.fencerA || !match.fencerB) return null;
  const a = cyranoFencerId(match.fencerA.id);
  const b = cyranoFencerId(match.fencerB.id);
  if (!a || !b || a === b) return null;
  if (right.id === a && left.id === b) return { A: right, B: left };
  if (right.id === b && left.id === a) return { A: left, B: right };
  return null;
}

/** Temps de la trame « m:ss » ou « m:ss.cc » → secondes entières ; `undefined` si illisible. */
export function parseCyranoTime(value: string | undefined): number | undefined {
  const match = /^(\d{1,3}):([0-5]\d)(?:\.\d{1,2})?$/.exec(value ?? '');
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Compteurs de cartons annoncés par l'appareil pour un tireur. */
export interface DeviceCardCounts {
  yellow?: number;
  red?: number;
}

const clampCount = (n: number): number => Math.min(9, Math.max(0, Math.trunc(n)));

/**
 * Reconstruit la liste de cartons d'un tireur à partir des compteurs de l'appareil.
 * Seuls les cartons jaunes et rouges sont remplacés ; blancs et noirs saisis sur la
 * tablette sont conservés. Un compteur absent garde sa valeur actuelle.
 */
export function mergeDeviceCards(current: readonly string[], counts: DeviceCardCounts): string[] {
  const currentYellow = current.filter(c => c === 'yellow').length;
  const currentRed = current.filter(c => c === 'red').length;
  const yellow = clampCount(counts.yellow ?? currentYellow);
  const red = clampCount(counts.red ?? currentRed);
  if (yellow === currentYellow && red === currentRed) return [...current];
  const others = current.filter(c => c !== 'yellow' && c !== 'red');
  return [
    ...Array.from({ length: yellow }, () => 'yellow'),
    ...Array.from({ length: red }, () => 'red'),
    ...others,
  ];
}
