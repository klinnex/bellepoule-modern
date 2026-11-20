/**
 * BellePoule Modern - Pilote OPP2 du modèle commun des appareils de piste (#1960)
 * OpenPiste Protocol niveau 2 (JSON sur MQTT). Comme le pilote Cyrano (#1829) :
 * - messages de l'appareil (`apparatus/*`, `remote/control`) → `PisteInput` ;
 * - `PisteCommand` → `software/fencers`, `software/match`, `software/score`,
 *   `software/clock`, `software/control` ACK / NAK.
 * L'appareil publie son état par morceaux (état, score, chrono, lampes, cartons P, médical,
 * tireurs) : le pilote tient l'état complet de chaque piste et l'émet à chaque changement.
 * Doublons QoS 1 écartés par le champ `seq` par émetteur (spéc. § 27) ; le PisteHub reçoit
 * une séquence propre au pilote, toujours croissante.
 * Liaison : `apparatus/connection` (dernière volonté MQTT publiée par le broker).
 * Licensed under GPL-3.0
 */

import { EventEmitter } from 'events';
import type { Opp2Bus } from './bus';
import {
  asInt,
  asObject,
  asString,
  buildClockBody,
  buildEmptyFencersBody,
  buildFencersBody,
  buildMatchBody,
  buildScoreBody,
  isValidOpp2Piste,
  OPP2_STATES,
  OPP2_STATUSES,
  opp2Header,
  opp2Topic,
  parseOpp2Payload,
  parseOpp2Time,
  parseOpp2Topic,
  SOFTWARE_PUBLISH,
  type Opp2Topic,
} from './codec';
import { cyranoPCardCounts } from '../cyrano/deviceState';
import type {
  PisteCommand,
  PisteDriver,
  PisteDriverCapabilities,
  PisteDriverEvents,
  PisteInput,
  PisteLink,
  PisteLinkState,
  PisteMode,
  PisteSideState,
  PisteState,
} from '../piste/types';

export const OPP2_DRIVER_ID = 'opp2';

export const OPP2_CAPABILITIES: PisteDriverCapabilities = {
  names: true,
  remote: true,
  ack: true,
  chrono: true,
  pCards: true,
  teams: true,
};

export interface Opp2PisteConfig {
  /** Identifiant de piste dans les sujets (`openpiste/{piste}/…`) */
  piste: string;
  arena?: number;
  mode?: PisteMode;
}

export interface Opp2PisteStatus extends PisteLink {
  /** Modèle d'appareil annoncé (`apparatus/connection`) */
  device?: string;
  firmware?: string;
  lastSeen: number | null;
  /** Dernier état complet connu */
  lastState: PisteState | null;
}

export interface Opp2DriverOptions {
  now?: () => number;
  software?: { name: string; version?: string };
}

const SIDES = ['left', 'right'] as const;

/** Entrée sans source ni séquence (ajoutées par le pilote). */
type PisteInputBody = PisteInput extends infer T
  ? T extends unknown
    ? Omit<T, 'source' | 'seq'>
    : never
  : never;

interface PisteRuntime {
  status: Opp2PisteStatus;
  state: PisteState;
  /** Dernier `seq` / `ts` reçu par émetteur (`apparatus`, `remote`…) */
  seen: Map<string, { seq: number; ts?: number }>;
  /** Intervention médicale en cours, par côté (compte les débuts) */
  medicalActive: { left: boolean; right: boolean };
}

const clean = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};

/** Pilote OPP2 : s'abonne au bus à `start()`. */
export class Opp2PisteDriver extends EventEmitter<PisteDriverEvents> implements PisteDriver {
  readonly id = OPP2_DRIVER_ID;
  readonly capabilities = OPP2_CAPABILITIES;
  private readonly pistes = new Map<string, PisteRuntime>();
  /** Pistes vues sur le broker sans être déclarées */
  private readonly unknown = new Set<string>();
  private unsubscribe: (() => void)[] = [];
  private seq = 0;
  private inputSeq = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    readonly bus: Opp2Bus,
    private readonly options: Opp2DriverOptions = {}
  ) {
    super();
    this.now = options.now ?? Date.now;
  }

  get running(): boolean {
    return this.unsubscribe.length > 0;
  }

  /** S'abonne aux messages des appareils et annonce BellePoule sur chaque piste. */
  start(): void {
    if (this.running) return;
    this.unsubscribe = [
      this.bus.subscribe('openpiste/+/apparatus/#', this.onMessage),
      this.bus.subscribe('openpiste/+/remote/control', this.onMessage),
    ];
    for (const piste of this.pistes.keys()) this.announce(piste, true);
  }

  /** Annonce le départ de BellePoule (retenu) et se désabonne. */
  stop(): void {
    if (!this.running) return;
    for (const piste of this.pistes.keys()) this.announce(piste, false);
    for (const u of this.unsubscribe) u();
    this.unsubscribe = [];
  }

  /** Table des pistes OPP2. Pistes retirées : départ annoncé. */
  setPistes(configs: Opp2PisteConfig[]): void {
    const next = new Map<string, Opp2PisteConfig>();
    for (const c of configs)
      if (c && typeof c.piste === 'string' && isValidOpp2Piste(c.piste)) next.set(c.piste, c);
    for (const piste of [...this.pistes.keys()])
      if (!next.has(piste)) {
        if (this.running) this.announce(piste, false);
        this.pistes.delete(piste);
      }
    for (const [piste, c] of next) {
      const mode: PisteMode = c.mode === 'display' || c.mode === 'manual' ? c.mode : 'master';
      const arena = Number.isInteger(c.arena) && (c.arena as number) > 0 ? c.arena : undefined;
      const rt = this.pistes.get(piste);
      if (rt) {
        rt.status.mode = mode;
        rt.status.arena = arena;
        continue;
      }
      this.pistes.set(piste, {
        status: { piste, arena, mode, status: 'never', lastSeen: null, lastState: null },
        state: {},
        seen: new Map(),
        medicalActive: { left: false, right: false },
      });
      this.unknown.delete(piste);
      if (this.running) this.announce(piste, true);
    }
  }

  /** Pistes vues sur le broker mais absentes de la table. */
  getUnknownPistes(): string[] {
    return [...this.unknown].sort();
  }

  getStatuses(): Opp2PisteStatus[] {
    return [...this.pistes.values()].map(rt => ({ ...rt.status }));
  }

  findPiste(piste: string): Opp2PisteStatus | undefined {
    const rt = this.pistes.get(piste);
    return rt ? { ...rt.status } : undefined;
  }

  findAllByArena(arena: number): Opp2PisteStatus[] {
    return this.getStatuses().filter(s => s.arena === arena);
  }

  /** OPP2 transporte l'identifiant complet (aucune troncature). */
  fencerId(id: string): string {
    return id;
  }

  send(piste: string, command: PisteCommand): boolean {
    const rt = this.pistes.get(piste);
    if (!rt || !this.running) return false;
    switch (command.kind) {
      case 'display': {
        const d = command.display;
        this.publish(piste, 'fencers', buildFencersBody(d));
        this.publish(piste, 'match', buildMatchBody(d, command.competition));
        this.publish(piste, 'score', buildScoreBody(d));
        if (d.stopwatch !== undefined) this.publish(piste, 'clock', buildClockBody(d.stopwatch));
        // Identités attendues de l'appareil : `apparatus/score` ne les porte pas
        for (const side of SIDES) {
          const s = d[side];
          rt.state[side] = clean({
            ...rt.state[side],
            id: s.id,
            name: [s.lastName, s.firstName].filter(Boolean).join(' '),
            nat: s.nat,
          });
        }
        return true;
      }
      case 'clear':
        this.publish(piste, 'fencers', buildEmptyFencersBody());
        for (const side of SIDES) if (rt.state[side]) delete rt.state[side]!.id;
        return true;
      case 'ack':
      case 'nak':
        this.publish(piste, 'control', { command: command.kind.toUpperCase() });
        return true;
      default:
        return false;
    }
  }

  private publish(piste: string, message: string, body: Record<string, unknown>): void {
    const opts = SOFTWARE_PUBLISH[message] ?? { qos: 1 as const, retain: false };
    const payload = { ...opp2Header(++this.seq, this.now()), ...body };
    this.bus.publish(opp2Topic(piste, 'software', message), JSON.stringify(payload), opts);
  }

  private announce(piste: string, online: boolean): void {
    const sw = this.options.software ?? { name: 'BellePoule Modern' };
    this.publish(
      piste,
      'connection',
      online
        ? clean({ online: true, software: sw.name, sw_version: sw.version })
        : { online: false }
    );
  }

  // ── Réception ─────────────────────────────────────────────────────────────

  private onMessage = (topic: string, payload: Buffer): void => {
    const t = parseOpp2Topic(topic);
    if (!t) return;
    const rt = this.pistes.get(t.piste);
    if (!rt) {
      if (t.role === 'apparatus') this.unknown.add(t.piste);
      return;
    }
    const msg = parseOpp2Payload(payload);
    if (!msg) return;
    if (t.message === 'connection') {
      // Dernière volonté : sans en-tête ni `seq` ; nouvelle session de l'appareil
      rt.seen.delete(t.role);
      if (t.role === 'apparatus') this.onConnection(rt, msg);
      return;
    }
    if (this.isDuplicate(rt, t, msg)) return;
    if (t.role === 'apparatus') {
      rt.status.lastSeen = this.now();
      if (rt.status.status !== 'online') this.setLink(rt, 'online');
    }
    if (t.message === 'control') {
      this.onControl(rt, t, msg);
      return;
    }
    if (t.role !== 'apparatus') return;
    if (this.applyApparatus(rt, t.message, msg)) this.emitState(rt);
  };

  /**
   * Doublon QoS 1 (spéc. § 27.3) : `seq` déjà vu pour cet émetteur. Un `seq` plus petit avec
   * un `ts` plus récent signale un redémarrage de l'appareil (§ 27.4) : le compteur repart.
   * Messages QoS 0 (chrono) : sans `seq`, toujours acceptés.
   */
  private isDuplicate(rt: PisteRuntime, t: Opp2Topic, msg: Record<string, unknown>): boolean {
    const seq = asInt(msg.seq);
    if (seq === undefined) return false;
    const ts = asInt(msg.ts);
    const last = rt.seen.get(t.role);
    if (last && seq <= last.seq) {
      const rebooted = ts !== undefined && last.ts !== undefined && ts > last.ts;
      if (!rebooted) return true;
    }
    rt.seen.set(t.role, { seq, ts: ts ?? last?.ts });
    return false;
  }

  private onConnection(rt: PisteRuntime, msg: Record<string, unknown>): void {
    const online = msg.online === true;
    if (online) {
      rt.status.device = asString(msg.device);
      rt.status.firmware = asString(msg.fw_version);
      rt.status.lastSeen = this.now();
    }
    this.setLink(rt, online ? 'online' : 'offline');
  }

  private setLink(rt: PisteRuntime, status: PisteLinkState): void {
    if (rt.status.status === status) return;
    rt.status.status = status;
    this.emit('status', { ...rt.status });
  }

  private onControl(rt: PisteRuntime, t: Opp2Topic, msg: Record<string, unknown>): void {
    const command = asString(msg.command);
    if (t.role !== 'apparatus' && t.role !== 'remote') return;
    switch (command) {
      case 'NEXT':
        if (t.role === 'apparatus') this.emitInput(rt, { kind: 'next' });
        return;
      case 'PREV':
        if (t.role === 'apparatus') this.emitInput(rt, { kind: 'prev' });
        return;
      case 'END':
        // `apparatus/state` « E » suit (ou précède) : une seule fin proposée au PisteHub
        if (t.role === 'apparatus' && rt.state.state !== 'ending') {
          rt.state.state = 'ending';
          this.emitState(rt);
        }
        return;
      case 'RESERVE': {
        const side = msg.side === 'left' || msg.side === 'right' ? msg.side : null;
        if (!side) return;
        rt.state[side] = { ...rt.state[side], reserve: true };
        this.emitState(rt);
        return;
      }
      default:
        // BEGIN, HALT, RESET, VALIDATE de la télécommande : destinés à l'appareil
        return;
    }
  }

  /** Message d'état de l'appareil → état complet ; false si rien à transmettre. */
  private applyApparatus(rt: PisteRuntime, message: string, msg: Record<string, unknown>): boolean {
    const st = rt.state;
    switch (message) {
      case 'state': {
        const state = OPP2_STATES[asString(msg.state) ?? ''];
        if (!state) return false;
        // Fin déjà proposée par `control` END : pas de seconde fin
        if (state === 'ending' && st.state === 'ending') return false;
        st.state = state;
        if (state !== 'ending') for (const side of SIDES) if (st[side]) delete st[side]!.reserve;
        return true;
      }
      case 'score': {
        for (const side of SIDES) {
          const o = asObject(msg[side]);
          if (!o) continue;
          const black = o.black_card === true;
          const status = OPP2_STATUSES[asString(o.status) ?? ''] ?? 'normal';
          st[side] = clean({
            ...st[side],
            score: asInt(o.score) ?? 0,
            status: black && status === 'normal' ? 'exclusion' : status,
            yellowCards: o.yellow_card === true ? 1 : 0,
            redCards: Math.min(9, asInt(o.red_cards) ?? 0),
          });
        }
        const p = msg.priority;
        st.priority = p === 'R' ? 'right' : p === 'L' ? 'left' : 'none';
        return true;
      }
      case 'clock': {
        const ms = asInt(msg.time_ms);
        const seconds = ms !== undefined ? ms / 1000 : parseOpp2Time(msg.time);
        if (seconds === undefined) return false;
        st.stopwatch = seconds;
        return true;
      }
      case 'lights': {
        const right = asObject(msg.right) ?? {};
        const left = asObject(msg.left) ?? {};
        st.right = { ...st.right, light: right.green === true, whiteLight: right.white === true };
        st.left = { ...st.left, light: left.red === true, whiteLight: left.white === true };
        return true;
      }
      case 'uw2f': {
        for (const side of SIDES) {
          const o = asObject(msg[side]);
          if (!o) continue;
          const s: PisteSideState = { ...st[side] };
          delete s.pYellow;
          delete s.pRed;
          delete s.pBlack;
          st[side] = { ...s, ...cyranoPCardCounts(asInt(o.p_card)) };
        }
        return true;
      }
      case 'medical': {
        const side = msg.side === 'left' || msg.side === 'right' ? msg.side : null;
        if (!side) return false;
        const active = msg.active === true;
        const was = rt.medicalActive[side];
        rt.medicalActive[side] = active;
        if (!active || was) return false;
        st[side] = { ...st[side], medical: (st[side]?.medical ?? 0) + 1 };
        return true;
      }
      case 'fencers': {
        // Inversion gaucher / droitier par l'arbitre, ou écho : le PisteHub rapproche par Id
        for (const side of SIDES) {
          const f = asObject(asObject(msg[side])?.fencer);
          const id = asString(f?.id);
          if (!f || f.present === false || !id) {
            if (st[side]) delete st[side]!.id;
            continue;
          }
          st[side] = clean({
            ...st[side],
            id,
            name: asString(f.name),
            nat: asString(f.nation) || asString(f.club_abbr),
          });
        }
        return true;
      }
      default:
        // blade_contact, video_review : sans équivalent dans le modèle commun
        return false;
    }
  }

  private nextSeq(piste: string): number {
    const n = (this.inputSeq.get(piste) ?? 0) + 1;
    this.inputSeq.set(piste, n);
    return n;
  }

  private emitInput(rt: PisteRuntime, input: PisteInputBody): void {
    const piste = rt.status.piste;
    this.emit(
      'input',
      { ...input, source: { driver: this.id, piste }, seq: this.nextSeq(piste) } as PisteInput,
      { ...rt.status }
    );
  }

  private emitState(rt: PisteRuntime): void {
    const state: PisteState = structuredClone(rt.state);
    rt.status.lastState = state;
    this.emitInput(rt, { kind: 'state', state });
  }
}
