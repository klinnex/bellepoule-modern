/**
 * BellePoule Modern - Événements simulés pour le remplissage automatique (outil de test)
 * Durée, touches par zone (Sabre Laser) et cartons : alimentent l'analytique comme un vrai match.
 * Licensed under GPL-3.0
 */

import { CardReason, Weapon } from '../types';
import type { MatchCardData, MatchTouchData, SimulatedMatchEvents } from '../types/preload';

export type { SimulatedMatchEvents };

export interface SimulateMatchParams {
  /** Id DB du match (composite pour un match de tableau) */
  matchId: string;
  fencerAId: string;
  fencerBId: string;
  scoreA: number;
  scoreB: number;
  weapon?: Weapon | string;
  /** Fin du match (défaut : maintenant) */
  end?: Date;
  rng?: () => number;
}

const ZONES: Array<{ zone: 'A' | 'B' | 'C'; points: number }> = [
  { zone: 'A', points: 1 },
  { zone: 'B', points: 3 },
  { zone: 'C', points: 5 },
];

const MINOR_REASONS: CardReason[] = [
  CardReason.EARLY_START,
  CardReason.LATE_STOP,
  CardReason.BODY_CONTACT,
  CardReason.COUNTER_ATTACK,
  CardReason.TARGET_SUBSTITUTION,
  CardReason.TIME_WASTING,
];
const MAJOR_REASONS: CardReason[] = [
  CardReason.ESTOC,
  CardReason.UNARMED_HAND,
  CardReason.VOLUNTARY_EXIT,
  CardReason.HEAVY_HIT,
];

/** Décompose un score Sabre Laser en zones A (1), B (3), C (5) tirées au hasard. */
export function decomposeLaserScore(
  score: number,
  rng: () => number = Math.random
): Array<'A' | 'B' | 'C'> {
  const zones: Array<'A' | 'B' | 'C'> = [];
  let remaining = Math.max(0, Math.floor(score));
  while (remaining > 0) {
    const options = ZONES.filter(z => z.points <= remaining);
    const pick = options[Math.floor(rng() * options.length)];
    zones.push(pick.zone);
    remaining -= pick.points;
  }
  return zones;
}

/** Génère durée, touches (zones Sabre Laser) et cartons plausibles pour un match rempli au hasard. */
export function simulateMatchEvents(p: SimulateMatchParams): SimulatedMatchEvents {
  const rng = p.rng ?? Math.random;
  const isLaser = p.weapon === Weapon.LASER;
  const end = p.end ?? new Date();
  // 1 min 30 à 5 min
  const duration = 90 + Math.floor(rng() * 211);
  const start = new Date(end.getTime() - duration * 1000);
  const at = () => new Date(start.getTime() + Math.floor(rng() * duration * 1000)).toISOString();
  let seq = 0;
  const uid = (kind: string, fencerId: string) => `${p.matchId}-${fencerId}-sim-${kind}-${seq++}`;

  const touches: MatchTouchData[] = [];
  if (isLaser) {
    for (const [fencerId, score] of [
      [p.fencerAId, p.scoreA],
      [p.fencerBId, p.scoreB],
    ] as const) {
      for (const zone of decomposeLaserScore(score, rng)) {
        touches.push({
          id: uid('touch', fencerId),
          matchId: p.matchId,
          fencerId,
          zone,
          points: ZONES.find(z => z.zone === zone)!.points,
          timestamp: at(),
          isValidInSuddenDeath: false,
          isReversed: false,
        });
      }
    }
    touches.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  const cards: MatchCardData[] = [];
  const pickReason = (list: CardReason[]) => list[Math.floor(rng() * list.length)];
  const addCard = (fencerId: string, cardType: string, reason: CardReason, cardGroup: number) =>
    cards.push({
      id: uid(`card-${cardType}`, fencerId),
      matchId: p.matchId,
      fencerId,
      cardType,
      reason,
      cardGroup,
      timestamp: at(),
      pointsAwarded: cardType === 'white' ? 0 : 1,
      resultingExclusion: false,
    });
  for (const fencerId of [p.fencerAId, p.fencerBId]) {
    if (isLaser && rng() < 0.2) addCard(fencerId, 'white', pickReason(MINOR_REASONS), 1);
    if (rng() < 0.15) addCard(fencerId, 'yellow', pickReason(MINOR_REASONS), 1);
    if (rng() < 0.05) addCard(fencerId, 'red', pickReason(MAJOR_REASONS), 2);
  }

  return {
    timing: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration,
    },
    touches,
    cards,
  };
}
