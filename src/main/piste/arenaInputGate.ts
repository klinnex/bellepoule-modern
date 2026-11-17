/**
 * BellePoule Modern - Barrière d'entrée des arènes (#1829, manque n°1)
 * Une arène peut recevoir des entrées de plusieurs sources : tablette arbitre, appareil de
 * piste (un ou plusieurs pilotes). Pour les appareils, chaque entrée porte un numéro de
 * séquence croissant par piste : une entrée dont le numéro n'est pas supérieur au dernier
 * accepté pour la même source, sur la même arène, est rejetée (trame en double ou arrivée
 * dans le désordre) et tracée. Les entrées de la tablette passent sans contrôle : elles
 * suivent leur propre chemin (`arena_control`, anti-rebond, verrou appareil maître).
 * Licensed under GPL-3.0
 */

import { logger, LogCategory } from '../../shared/services/logger';
import type { PisteInput, PisteSource } from './types';

/** Entrée soumise à la barrière : tablette (sans séquence) ou appareil. */
export type GateEntry =
  | { origin: 'tablet' }
  | { origin: 'device'; source: PisteSource; seq: number; kind: PisteInput['kind'] };

export interface GateRejection {
  ts: number;
  arenaId: string;
  source: PisteSource;
  seq: number;
  /** Dernier numéro accepté pour cette source sur cette arène */
  last: number;
  kind: PisteInput['kind'];
}

const sourceKey = (s: PisteSource): string => `${s.driver}:${s.piste}`;

export class ArenaInputGate {
  /** arène → source → dernier numéro accepté */
  private readonly last = new Map<string, Map<string, number>>();
  private readonly rejections: GateRejection[] = [];

  constructor(private readonly options: { logSize?: number; now?: () => number } = {}) {}

  /** Entrée d'appareil sous forme d'entrée de barrière. */
  static fromInput(input: PisteInput): GateEntry {
    return { origin: 'device', source: input.source, seq: input.seq, kind: input.kind };
  }

  /** true si l'entrée est admise sur l'arène (et la mémorise), false si elle est rejetée. */
  admit(arenaId: string, entry: GateEntry): boolean {
    if (entry.origin === 'tablet') return true;
    const key = sourceKey(entry.source);
    let perArena = this.last.get(arenaId);
    if (!perArena) {
      perArena = new Map();
      this.last.set(arenaId, perArena);
    }
    const last = perArena.get(key);
    if (!Number.isFinite(entry.seq) || (last !== undefined && entry.seq <= last)) {
      this.reject(arenaId, entry, last ?? Number.NaN);
      return false;
    }
    perArena.set(key, entry.seq);
    return true;
  }

  /**
   * Oublie une source (liaison perdue : un appareil redémarré peut reprendre sa numérotation)
   * sur toutes les arènes.
   */
  forget(source: PisteSource): void {
    const key = sourceKey(source);
    for (const perArena of this.last.values()) perArena.delete(key);
  }

  /** Rejets récents (journal borné), du plus ancien au plus récent. */
  getRejections(): GateRejection[] {
    return [...this.rejections];
  }

  private reject(
    arenaId: string,
    entry: Extract<GateEntry, { origin: 'device' }>,
    last: number
  ): void {
    const rejection: GateRejection = {
      ts: (this.options.now ?? Date.now)(),
      arenaId,
      source: { ...entry.source },
      seq: entry.seq,
      last,
      kind: entry.kind,
    };
    this.rejections.push(rejection);
    const max = this.options.logSize ?? 200;
    if (this.rejections.length > max) this.rejections.splice(0, this.rejections.length - max);
    logger.warn(
      LogCategory.NETWORK,
      `Piste ${entry.source.driver}:${entry.source.piste} — entrée ${entry.kind} n° ${entry.seq} ` +
        `rejetée sur ${arenaId} (dernière acceptée : ${Number.isNaN(last) ? '—' : last})`
    );
  }
}
