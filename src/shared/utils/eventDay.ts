/**
 * BellePoule Modern - Journée multi-épreuves (#1714) : règles pures
 * (armes d'arbitrage, statut commun, conflits sur toute la journée).
 * Licensed under GPL-3.0
 */
import { Weapon } from '../types';
import type {
  DayReferee,
  DayRefereeAssignment,
  DayRefereeConflict,
  DayRefereeStatus,
} from '../types/eventDay';

const WEAPON_VALUES = new Set<string>(Object.values(Weapon));

/** "F,E" → [FOIL, EPEE] ; valeurs inconnues et doublons ignorés */
export function parseWeapons(raw: string | null | undefined): Weapon[] {
  if (!raw) return [];
  const out: Weapon[] = [];
  for (const part of raw.split(',')) {
    const w = part.trim().toUpperCase();
    if (WEAPON_VALUES.has(w) && !out.includes(w as Weapon)) out.push(w as Weapon);
  }
  return out;
}

export function serializeWeapons(weapons: readonly Weapon[] | undefined): string {
  return parseWeapons((weapons ?? []).join(',')).join(',');
}

/** Arbitre autorisé sur une arme : liste vide = toutes armes */
export function canOfficiate(ref: Pick<DayReferee, 'weapons'>, weapon: Weapon): boolean {
  return ref.weapons.length === 0 || ref.weapons.includes(weapon);
}

/** Nom complet au format de la table referees ("Prénom Nom") */
export function dayRefereeFullName(ref: Pick<DayReferee, 'firstName' | 'lastName'>): string {
  return `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim();
}

function groupByReferee(
  assignments: readonly DayRefereeAssignment[]
): Map<string, DayRefereeAssignment[]> {
  const map = new Map<string, DayRefereeAssignment[]>();
  for (const a of assignments) {
    const list = map.get(a.dayRefereeId);
    if (list) list.push(a);
    else map.set(a.dayRefereeId, [a]);
  }
  return map;
}

/** Statut commun : libre, ou occupé (piste X de l'épreuve Y) */
export function computeDayStatuses(
  refs: readonly Pick<DayReferee, 'id'>[],
  assignments: readonly DayRefereeAssignment[]
): DayRefereeStatus[] {
  const byRef = groupByReferee(assignments);
  return refs.map(r => {
    const list = byRef.get(r.id) ?? [];
    return { dayRefereeId: r.id, state: list.length > 0 ? 'busy' : 'free', assignments: list };
  });
}

/**
 * Conflits sur la journée :
 * - multi_competition : occupé dans plusieurs épreuves à la fois ;
 * - multi_strip : occupé sur plusieurs pistes distinctes ;
 * - weapon : affecté à une épreuve d'une arme qu'il n'arbitre pas.
 */
export function detectDayConflicts(
  refs: readonly Pick<DayReferee, 'id' | 'weapons'>[],
  assignments: readonly DayRefereeAssignment[],
  competitionWeapons: Readonly<Record<string, Weapon>>
): DayRefereeConflict[] {
  const byRef = groupByReferee(assignments);
  const conflicts: DayRefereeConflict[] = [];
  for (const ref of refs) {
    const list = byRef.get(ref.id);
    if (!list) continue;
    const competitions = new Set(list.map(a => a.competitionId));
    if (competitions.size > 1) {
      conflicts.push({ dayRefereeId: ref.id, kind: 'multi_competition', assignments: list });
    } else {
      const strips = new Set(list.filter(a => a.strip != null).map(a => a.strip));
      if (strips.size > 1) {
        conflicts.push({ dayRefereeId: ref.id, kind: 'multi_strip', assignments: list });
      }
    }
    const wrong = list.filter(a => {
      const w = competitionWeapons[a.competitionId];
      return w !== undefined && !canOfficiate(ref, w);
    });
    if (wrong.length > 0) {
      conflicts.push({ dayRefereeId: ref.id, kind: 'weapon', assignments: wrong });
    }
  }
  return conflicts;
}

/** Occupations d'un arbitre de l'épreuve dans les AUTRES épreuves de la journée */
export function busyElsewhere(
  assignments: readonly DayRefereeAssignment[],
  competitionId: string,
  links: Readonly<Record<string, string>>
): Record<string, DayRefereeAssignment[]> {
  const byDayRef = groupByReferee(assignments.filter(a => a.competitionId !== competitionId));
  const out: Record<string, DayRefereeAssignment[]> = {};
  for (const [refereeId, dayRefId] of Object.entries(links)) {
    const list = byDayRef.get(dayRefId);
    if (list) out[refereeId] = list;
  }
  return out;
}
