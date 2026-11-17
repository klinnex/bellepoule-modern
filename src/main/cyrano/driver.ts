/**
 * BellePoule Modern - Pilote Cyrano du modèle commun des appareils de piste (#1829)
 * Adaptateur `CyranoServer` ↔ `PisteDriver` :
 * - INFO / NEXT / PREV → `PisteInput` (état normalisé, n° de séquence croissant par piste) ;
 * - `PisteCommand` → DISP / ACK / NAK.
 * Le protocole Cyrano ne numérote pas ses trames : la séquence est attribuée à la réception,
 * toujours croissante ; l'ArenaInputGate ne rejette donc aucune entrée Cyrano.
 * Licensed under GPL-3.0
 */

import { EventEmitter } from 'events';
import type { CyranoFencer, CyranoMessage } from './codec';
import type { CyranoPisteStatus, CyranoServer } from './server';
import { buildDisp, EMPTY_DISP, type CyranoDisp, type CyranoDispFencer } from './disp';
import {
  cyranoFencerId,
  cyranoPCardCounts,
  cyranoPCardField,
  parseCyranoStopwatch,
} from './deviceState';
import type { CyranoNameLength } from './names';
import type {
  PisteCommand,
  PisteDisplay,
  PisteDisplaySide,
  PisteDriver,
  PisteDriverCapabilities,
  PisteDriverEvents,
  PisteFencerStatus,
  PisteFencingState,
  PisteInput,
  PisteLink,
  PisteSideState,
  PisteState,
} from '../piste/types';

export const CYRANO_DRIVER_ID = 'cyrano';

/** Entrée sans source ni séquence (ajoutées par le pilote). */
type PisteInputBody = PisteInput extends infer T
  ? T extends unknown
    ? Omit<T, 'source' | 'seq'>
    : never
  : never;

const STATES: Record<string, PisteFencingState> = {
  F: 'fencing',
  H: 'halt',
  P: 'pause',
  W: 'waiting',
  E: 'ending',
};
const STATUSES: Record<string, PisteFencerStatus> = {
  U: 'normal',
  V: 'victory',
  D: 'defeat',
  A: 'abandon',
  E: 'exclusion',
};

function toSide(f: CyranoFencer | undefined): PisteSideState | undefined {
  if (!f) return undefined;
  const side: PisteSideState = {
    id: f.id,
    name: f.name,
    nat: f.nat,
    score: f.score,
    status: f.status ? STATUSES[f.status] : undefined,
    yellowCards: f.yellowCards,
    redCards: f.redCards,
    ...cyranoPCardCounts(f.pCard),
    light: f.light,
    whiteLight: f.whiteLight,
    medical: f.medical,
    reserve: f.reserve,
  };
  for (const k of Object.keys(side) as (keyof PisteSideState)[])
    if (side[k] === undefined) delete side[k];
  return side;
}

/** Trame INFO → état normalisé. */
export function cyranoToPisteState(msg: CyranoMessage): PisteState {
  const stopwatch = parseCyranoStopwatch(msg.stopwatch);
  const round = msg.round !== undefined && /^\d+$/.test(msg.round) ? Number(msg.round) : undefined;
  const state: PisteState = {
    state: msg.state ? STATES[msg.state] : undefined,
    stopwatch: stopwatch ?? undefined,
    priority: msg.priority === 'R' ? 'right' : msg.priority === 'L' ? 'left' : 'none',
    type: msg.type === 'T' ? 'team' : msg.type === 'I' ? 'individual' : undefined,
    round,
    right: toSide(msg.right),
    left: toSide(msg.left),
  };
  if (!msg.priority) delete state.priority;
  for (const k of Object.keys(state) as (keyof PisteState)[])
    if (state[k] === undefined) delete state[k];
  return state;
}

/**
 * Chrono en secondes → `m:ss` (format Cyrano). Sous 10 s, les centièmes sont obligatoires en
 * EFP1.1 (`0:09.53`, `0:09.00`, spéc. § 3 champ 10) ; le codec les retire en EFP1, qui ne les
 * connaît pas. Le champ fait 8 caractères.
 */
export function formatCyranoStopwatch(seconds: number): string {
  const total = Math.max(0, seconds);
  let whole = Math.floor(total);
  let cs = Math.round((total - whole) * 100);
  if (cs === 100) {
    whole += 1;
    cs = 0;
  }
  const m = Math.floor(whole / 60);
  const ss = String(whole % 60).padStart(2, '0');
  return whole < 10 ? `${m}:${ss}.${String(cs).padStart(2, '0')}` : `${m}:${ss}`;
}

function dispFencer(s: PisteDisplaySide): CyranoDispFencer {
  return {
    id: s.id,
    lastName: s.lastName,
    firstName: s.firstName,
    nat: s.nat,
    score: s.score,
    yellowCards: s.yellowCards,
    redCards: s.redCards,
    pCard: cyranoPCardField(s),
  };
}

/** Match à afficher → champs d'un DISP. */
export function pisteDisplayToDisp(
  d: PisteDisplay,
  opts: { nameLength?: CyranoNameLength } = {}
): CyranoDisp {
  return buildDisp(
    {
      phase: d.phase,
      poulTab: d.poulTab,
      match: d.match,
      round: d.round,
      time: d.time,
      stopwatch: d.stopwatch !== undefined ? formatCyranoStopwatch(d.stopwatch) : undefined,
      weapon: d.weapon,
      team: d.type === 'team',
      right: dispFencer(d.right),
      left: dispFencer(d.left),
      referee: d.referee,
    },
    { nameLength: opts.nameLength }
  );
}

export const CYRANO_CAPABILITIES: PisteDriverCapabilities = {
  names: true,
  remote: true,
  ack: true,
  chrono: true,
  pCards: true,
  teams: true,
};

/** Pilote Cyrano : écoute le `CyranoServer` dès sa construction. */
export class CyranoPisteDriver extends EventEmitter<PisteDriverEvents> implements PisteDriver {
  readonly id = CYRANO_DRIVER_ID;
  readonly capabilities = CYRANO_CAPABILITIES;
  /** Dernier n° de séquence attribué, par piste */
  private readonly seq = new Map<string, number>();
  private nameLength: CyranoNameLength = 10;

  constructor(readonly server: CyranoServer) {
    super();
    server.on('info', this.onInfo);
    server.on('next', this.onNext);
    server.on('prev', this.onPrev);
    server.on('status', this.onStatus);
  }

  /** Débranche le pilote du serveur. */
  dispose(): void {
    this.server.off('info', this.onInfo);
    this.server.off('next', this.onNext);
    this.server.off('prev', this.onPrev);
    this.server.off('status', this.onStatus);
  }

  /** Longueur des noms affichés (10, 12, 15 ou 20 caractères). */
  setNameLength(length: CyranoNameLength): void {
    this.nameLength = length;
  }

  private nextSeq(piste: string): number {
    const n = (this.seq.get(piste) ?? 0) + 1;
    this.seq.set(piste, n);
    return n;
  }

  private emitInput(link: CyranoPisteStatus, input: PisteInputBody): void {
    this.emit(
      'input',
      {
        ...input,
        source: { driver: this.id, piste: link.piste },
        seq: this.nextSeq(link.piste),
      } as PisteInput,
      link
    );
  }

  private onInfo = (link: CyranoPisteStatus, msg: CyranoMessage): void =>
    this.emitInput(link, { kind: 'state', state: cyranoToPisteState(msg) });

  private onNext = (link: CyranoPisteStatus): void => this.emitInput(link, { kind: 'next' });

  private onPrev = (link: CyranoPisteStatus): void => this.emitInput(link, { kind: 'prev' });

  private onStatus = (link: CyranoPisteStatus): void => {
    this.emit('status', link);
  };

  getStatuses(): PisteLink[] {
    return this.server.getStatuses();
  }

  findPiste(piste: string): PisteLink | undefined {
    return this.server.findPiste(piste);
  }

  findAllByArena(arena: number): PisteLink[] {
    return this.server.findAllByArena(arena);
  }

  fencerId(id: string): string {
    return cyranoFencerId(id);
  }

  send(piste: string, command: PisteCommand): boolean {
    switch (command.kind) {
      case 'display':
        return this.server.sendDisp(
          piste,
          pisteDisplayToDisp(command.display, { nameLength: this.nameLength }),
          command.competition
        );
      case 'clear':
        return this.server.sendDisp(piste, EMPTY_DISP);
      case 'ack':
        return this.server.sendAck(piste);
      case 'nak':
        return this.server.sendNak(piste);
      default:
        return false;
    }
  }
}
