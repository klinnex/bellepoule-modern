/**
 * BellePoule Modern - Plusieurs protocoles d'appareils de piste en même temps (#1960)
 * Présente au PisteHub un seul `PisteDriver` regroupant plusieurs pilotes (Cyrano, OPP2…) :
 * chaque piste appartient au premier pilote qui la déclare ; les commandes lui sont routées.
 * Les entrées gardent leur source (pilote d'origine) : la barrière d'arène suit chaque pilote.
 * Licensed under GPL-3.0
 */

import { EventEmitter } from 'events';
import type {
  PisteCommand,
  PisteDriver,
  PisteDriverCapabilities,
  PisteDriverEvents,
  PisteLink,
  PisteNameLength,
} from './types';

export const MULTI_DRIVER_ID = 'piste';

export class MultiPisteDriver extends EventEmitter<PisteDriverEvents> implements PisteDriver {
  readonly id = MULTI_DRIVER_ID;
  readonly capabilities: PisteDriverCapabilities;

  constructor(readonly drivers: readonly PisteDriver[]) {
    super();
    // Ce que tous les pilotes savent faire
    const all = (k: keyof PisteDriverCapabilities) => drivers.every(d => d.capabilities[k]);
    this.capabilities = {
      names: all('names'),
      remote: all('remote'),
      ack: all('ack'),
      chrono: all('chrono'),
      pCards: all('pCards'),
      teams: all('teams'),
    };
    for (const d of drivers) {
      d.on('input', (input, link) => {
        if (this.ownerOf(link.piste) === d) this.emit('input', input, link);
      });
      d.on('status', link => {
        if (this.ownerOf(link.piste) === d) this.emit('status', link);
      });
    }
  }

  /** Pilote qui gère la piste (le premier qui la déclare). */
  ownerOf(piste: string): PisteDriver | undefined {
    return this.drivers.find(d => d.findPiste(piste));
  }

  getStatuses(): PisteLink[] {
    const seen = new Set<string>();
    const out: PisteLink[] = [];
    for (const d of this.drivers)
      for (const s of d.getStatuses()) {
        if (seen.has(s.piste)) continue;
        seen.add(s.piste);
        out.push(s);
      }
    return out;
  }

  findPiste(piste: string): PisteLink | undefined {
    return this.ownerOf(piste)?.findPiste(piste);
  }

  findAllByArena(arena: number): PisteLink[] {
    return this.getStatuses().filter(s => s.arena === arena);
  }

  send(piste: string, command: PisteCommand): boolean {
    return this.ownerOf(piste)?.send(piste, command) ?? false;
  }

  fencerId(id: string, piste?: string): string {
    const d = piste !== undefined ? this.ownerOf(piste) : this.drivers[0];
    return (d ?? this.drivers[0])?.fencerId(id, piste) ?? id;
  }

  setNameLength(length: PisteNameLength): void {
    for (const d of this.drivers) d.setNameLength?.(length);
  }
}
