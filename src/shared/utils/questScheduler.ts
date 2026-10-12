/**
 * BellePoule Modern - Quest Phase Scheduler
 * Génération du planning de combats pour le Tour Quest (Sabre Laser)
 * Licensed under GPL-3.0
 */

import { Fencer } from '../types';

export interface QuestFight {
  fencerA: Fencer;
  fencerB: Fencer;
}

export type OpponentConstraint = 'none' | 'club' | 'region' | 'nation';

/**
 * Calcule le nombre de combats par tireur selon la formule officielle Quest.
 * Formule : (2 × temps × arènes) / (tireurs × 5 minutes)
 */
export function calculateFightsPerFencer(
  timeMinutes: number,
  arenas: number,
  fencerCount: number
): number {
  if (fencerCount <= 0 || timeMinutes <= 0 || arenas <= 0) return 0;
  return Math.floor((2 * timeMinutes * arenas) / (fencerCount * 5));
}

/**
 * Vérifie si deux tireurs peuvent s'affronter selon la contrainte.
 */
function canFight(a: Fencer, b: Fencer, constraint: OpponentConstraint): boolean {
  if (constraint === 'none') return true;
  if (constraint === 'club') return !a.club || !b.club || a.club !== b.club;
  if (constraint === 'region') return !a.region || !b.region || a.region !== b.region;
  if (constraint === 'nation') return a.nationality !== b.nationality;
  return true;
}

/**
 * Génère le planning des combats Quest.
 *
 * Algorithme round-based :
 * - K rounds, chaque tireur combat au plus une fois par round.
 * - Dans chaque round, on assigne les tireurs qui ont le moins de combats d'abord.
 * - Pour chaque tireur, on choisit le partenaire éligible avec le moins de combats.
 *
 * Garantit :
 * - Aucune paire dupliquée.
 * - Distribution K±1 quand les paires éligibles sont suffisantes.
 * - La contrainte d'opposition est respectée.
 */
export function generateQuestSchedule(
  fencers: Fencer[],
  fightsPerFencer: number,
  constraint: OpponentConstraint
): QuestFight[] {
  if (fencers.length < 2 || fightsPerFencer <= 0) return [];

  const pairKey = (a: Fencer, b: Fencer): string =>
    a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;

  const fightCount = new Map<string, number>(fencers.map(f => [f.id, 0]));
  const usedPairs = new Set<string>();
  const selected: QuestFight[] = [];

  for (let round = 0; round < fightsPerFencer; round++) {
    const matchedThisRound = new Set<string>();

    // Trier par nombre de combats croissant (avec brassage aléatoire en cas d'égalité)
    const order = [...fencers].sort((a, b) => {
      const diff = (fightCount.get(a.id) ?? 0) - (fightCount.get(b.id) ?? 0);
      return diff !== 0 ? diff : Math.random() < 0.5 ? -1 : 1;
    });

    for (const a of order) {
      if (matchedThisRound.has(a.id)) continue;
      if ((fightCount.get(a.id) ?? 0) >= fightsPerFencer) continue;

      // Trouver le partenaire éligible avec le moins de combats (min-degree first)
      let bestB: Fencer | null = null;
      let bestCount = Infinity;
      for (const b of order) {
        if (b.id === a.id) continue;
        if (matchedThisRound.has(b.id)) continue;
        if ((fightCount.get(b.id) ?? 0) >= fightsPerFencer) continue;
        if (!canFight(a, b, constraint)) continue;
        const key = pairKey(a, b);
        if (usedPairs.has(key)) continue;
        const cnt = fightCount.get(b.id) ?? 0;
        if (cnt < bestCount) {
          bestCount = cnt;
          bestB = b;
        }
      }

      if (!bestB) continue;

      const key = pairKey(a, bestB);
      selected.push({ fencerA: a, fencerB: bestB });
      usedPairs.add(key);
      fightCount.set(a.id, (fightCount.get(a.id) ?? 0) + 1);
      fightCount.set(bestB.id, (fightCount.get(bestB.id) ?? 0) + 1);
      matchedThisRound.add(a.id);
      matchedThisRound.add(bestB.id);
    }
  }

  // Mélange final de l'ordre des combats
  return selected.sort(() => Math.random() - 0.5);
}

export interface QuestScheduleValidation {
  isValid: boolean;
  errors: string[];
  fightsPerFencer: Map<string, number>;
}

/**
 * Valide un planning Quest : unicité des paires, distribution des combats.
 */
export function validateQuestSchedule(schedule: QuestFight[]): QuestScheduleValidation {
  const errors: string[] = [];
  const usedPairs = new Set<string>();
  const fightsPerFencer = new Map<string, number>();

  const pairKey = (a: Fencer, b: Fencer) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

  for (const fight of schedule) {
    const key = pairKey(fight.fencerA, fight.fencerB);
    if (usedPairs.has(key)) {
      errors.push(`Doublon : ${fight.fencerA.lastName} vs ${fight.fencerB.lastName}`);
    }
    usedPairs.add(key);

    fightsPerFencer.set(fight.fencerA.id, (fightsPerFencer.get(fight.fencerA.id) ?? 0) + 1);
    fightsPerFencer.set(fight.fencerB.id, (fightsPerFencer.get(fight.fencerB.id) ?? 0) + 1);
  }

  const counts = Array.from(fightsPerFencer.values());
  if (counts.length > 0) {
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (max - min > 1) {
      errors.push(`Distribution déséquilibrée : min ${min}, max ${max} combats par tireur`);
    }
  }

  return { isValid: errors.length === 0, errors, fightsPerFencer };
}
