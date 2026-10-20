/**
 * BellePoule Modern - Sous-pistes du tournoi des rapières (#1118) : pendant les vagues,
 * plusieurs tablettes arbitrent en même temps des matchs différents d'une même piste.
 * Chaque tablette réclame une sous-piste (`arena3`, `arena3s2`, `arena3s3`…), arène à part
 * entière (score, chrono, cartons) qui partage le mot de passe et la poule de la piste.
 * Licensed under GPL-3.0
 */
import type { Arena } from '../../shared/types/remote';

/** Sous-pistes au plus par piste (piste comprise) : 5 duels simultanés en poule de 10. */
export const MAX_SLOTS_PER_ARENA = 10;

const SLOT_RE = /^(arena\d+)s(\d+)$/;

/** Piste d'une sous-piste (`arena3s2` → `arena3`), identité sinon. */
export function baseArenaId(arenaId: string): string {
  const m = SLOT_RE.exec(arenaId);
  return m ? m[1] : arenaId;
}

export function isSlotArenaId(arenaId: string): boolean {
  return SLOT_RE.test(arenaId);
}

/** Arènes de la même piste (piste et sous-pistes), sauf `arenaId` lui-même. */
export function siblingArenas(arenas: Map<string, Arena>, arenaId: string): Arena[] {
  const base = baseArenaId(arenaId);
  return [...arenas.values()].filter(a => a.id !== arenaId && baseArenaId(a.id) === base);
}

/** Matchs chargés (non terminés) sur les autres sous-pistes : à ne pas proposer ici. */
export function matchesTakenBySiblings(arenas: Map<string, Arena>, arenaId: string): Set<string> {
  const taken = new Set<string>();
  for (const a of siblingArenas(arenas, arenaId)) {
    if (a.currentMatch && a.status !== 'finished') taken.add(a.currentMatch.id);
  }
  return taken;
}

/** Copie vierge de la piste pour une sous-piste (même numéro, mot de passe, réglages). */
export function createSlotArena(parent: Arena, slot: number): Arena {
  return {
    id: `${parent.id}s${slot}`,
    name: `${parent.name} · ${slot}`,
    number: parent.number,
    currentMatch: null,
    activePoolId: parent.activePoolId,
    status: 'idle',
    startTime: null,
    settings: { ...parent.settings },
    password: parent.password,
  };
}

/** Attribution des sous-pistes aux tablettes (clé persistante de l'appareil). */
export class ArenaSlotRegistry {
  /** arène (piste ou sous-piste) → clé de la tablette qui l'occupe */
  private owners = new Map<string, string>();

  /**
   * Sous-piste de la tablette `deviceKey` sur la piste `baseId` : la sienne si elle en a
   * déjà une (rechargement), sinon la première libre (sans tablette, aucun match en cours),
   * créée au besoin via `create`, en préférant `preferred` (sous-piste actuelle de la
   * tablette, pour éviter un changement à chaque vague). `null` si piste inconnue ou pleine.
   */
  claim(
    arenas: Map<string, Arena>,
    baseId: string,
    deviceKey: string,
    create: (parent: Arena, slot: number) => Arena,
    preferred?: string
  ): string | null {
    const parent = arenas.get(baseId);
    if (!parent) return null;
    for (const [id, key] of this.owners) {
      if (key === deviceKey && baseArenaId(id) === baseId && arenas.has(id)) return id;
    }
    const free = (id: string) => !this.owners.has(id) && arenas.get(id)?.status !== 'in_progress';
    if (preferred && preferred !== baseId && baseArenaId(preferred) === baseId) {
      if (arenas.has(preferred) && free(preferred)) {
        this.owners.set(preferred, deviceKey);
        return preferred;
      }
    }
    for (let slot = 1; slot <= MAX_SLOTS_PER_ARENA; slot++) {
      const id = slot === 1 ? baseId : `${baseId}s${slot}`;
      if (!free(id)) continue;
      if (!arenas.has(id)) create(parent, slot);
      this.owners.set(id, deviceKey);
      return id;
    }
    return null;
  }

  /**
   * Nouvelle vague / fin des vagues : libère les sous-pistes sans match en cours, les
   * tablettes concernées sont réattribuées à leur prochaine demande.
   */
  release(arenas: Map<string, Arena>): void {
    for (const id of [...this.owners.keys()]) {
      const a = arenas.get(id);
      if (!a?.currentMatch || a.status === 'finished') this.owners.delete(id);
    }
  }
}
