/**
 * BellePoule Modern - Serveur UDP Cyrano (#1720)
 * Registre des pistes (IP ↔ piste), liste blanche d'IP, battement HELLO toutes les 15 s,
 * supervision (en ligne / incertain / hors ligne / jamais vu), journal des trames.
 * Le serveur ne connaît pas le domaine : il émet des événements (`info`, `next`, `prev`)
 * et expose `sendDisp`, `sendAck`, `sendNak` ; le raccordement aux arènes est fait ailleurs.
 * Licensed under GPL-3.0
 */

import dgram from 'dgram';
import { EventEmitter } from 'events';
import {
  buildCyrano,
  parseCyrano,
  sanitizeField,
  CYRANO_DEFAULT_PORT,
  CYRANO_MAX_FRAME,
  type CyranoMessage,
  type CyranoProtocol,
} from './codec';
import { isIP } from 'net';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export type CyranoProtocolSetting = CyranoProtocol | 'auto';

/**
 * Mode d'une piste (#1829) :
 * - `master` : appareil maître (score, cartons, chrono viennent de l'appareil) ;
 * - `display` : appareil afficheur (reçoit les DISP, ses commandes sont ignorées) ;
 * - `manual` : piste hors appareil (aucune trame envoyée, entrées ignorées).
 */
export type CyranoPisteMode = 'master' | 'display' | 'manual';
export const CYRANO_PISTE_MODES: readonly CyranoPisteMode[] = ['master', 'display', 'manual'];

export interface CyranoPisteConfig {
  /** Identifiant de piste Cyrano (8 caractères max : « 1 », « podium », « rouge »…) */
  piste: string;
  /** Adresse IPv4/IPv6 fixe de l'appareil */
  ip: string;
  /** Port UDP de l'appareil (50100 par défaut, 50101 sur certains modèles) */
  port?: number;
  /** Arène BellePoule rattachée (`/arene{N}`) */
  arena?: number;
  /** Version du protocole : imposée, ou `auto` (celle de la dernière trame reçue) */
  protocol?: CyranoProtocolSetting;
  /** Mode de la piste ; `master` par défaut */
  mode?: CyranoPisteMode;
}

export type CyranoLinkStatus = 'online' | 'stale' | 'offline' | 'never';

export interface CyranoPisteStatus extends CyranoPisteConfig {
  /** Mode effectif de la piste (toujours renseigné dans la table) */
  mode: CyranoPisteMode;
  status: CyranoLinkStatus;
  lastSeen: number | null;
  /** Version détectée dans la dernière trame reçue */
  detectedProtocol: CyranoProtocol | null;
  lastInfo: CyranoMessage | null;
}

export interface CyranoFrameLogEntry {
  ts: number;
  dir: 'in' | 'out';
  ip: string;
  port: number;
  piste: string | null;
  raw: string;
  /** Trame entrante ignorée : IP inconnue ou trame illisible */
  rejected?: 'unknown_ip' | 'malformed';
}

export interface CyranoServerOptions {
  port?: number;
  /** Adresse d'écoute (toutes les interfaces par défaut) */
  host?: string;
  /** Identifiant de compétition (champ Compe, 8 caractères max) */
  compe?: string;
  /** Version utilisée tant qu'un appareil n'a rien envoyé (`auto`) */
  defaultProtocol?: CyranoProtocol;
  helloIntervalMs?: number;
  /** Au-delà : statut « incertain » (orange) */
  staleAfterMs?: number;
  /** Au-delà : hors ligne (la spécification fixe 40 s côté appareil) */
  offlineAfterMs?: number;
  logSize?: number;
  now?: () => number;
}

export interface CyranoServerEvents {
  /** Toute trame acceptée venant d'un appareil déclaré */
  message: [piste: CyranoPisteStatus, msg: CyranoMessage];
  info: [piste: CyranoPisteStatus, msg: CyranoMessage];
  next: [piste: CyranoPisteStatus, msg: CyranoMessage];
  prev: [piste: CyranoPisteStatus, msg: CyranoMessage];
  /** Changement de statut de liaison */
  status: [piste: CyranoPisteStatus];
  /** Trame d'une IP non déclarée (découverte, aide au paramétrage) */
  unknown: [ip: string, port: number, msg: CyranoMessage | null];
  error: [err: Error];
}

interface PisteEntry extends CyranoPisteStatus {
  key: string;
}

const ipKey = (ip: string): string => ip.replace(/^::ffff:/, '').toLowerCase();

export class CyranoServer extends EventEmitter<CyranoServerEvents> {
  private socket: dgram.Socket | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  private readonly pistes = new Map<string, PisteEntry>();
  private readonly log: CyranoFrameLogEntry[] = [];
  private readonly opts: Required<Omit<CyranoServerOptions, 'host'>> & { host?: string };
  private boundPort = 0;

  constructor(options: CyranoServerOptions = {}) {
    super();
    this.opts = {
      port: options.port ?? CYRANO_DEFAULT_PORT,
      host: options.host,
      compe: sanitizeField(options.compe ?? '', 8),
      defaultProtocol: options.defaultProtocol ?? 'EFP1.1',
      helloIntervalMs: options.helloIntervalMs ?? 15000,
      staleAfterMs: options.staleAfterMs ?? 20000,
      offlineAfterMs: options.offlineAfterMs ?? 40000,
      logSize: options.logSize ?? 500,
      now: options.now ?? Date.now,
    };
  }

  /** Démarre l'écoute UDP ; résout avec le port réellement ouvert. */
  start(port?: number): Promise<number> {
    if (this.socket) return Promise.resolve(this.boundPort);
    if (port !== undefined && Number.isInteger(port) && port >= 0 && port <= 65535) {
      this.opts.port = port;
    }
    const host = this.opts.host;
    const socket = dgram.createSocket({ type: host?.includes(':') ? 'udp6' : 'udp4' });
    this.socket = socket;
    socket.on('message', (buf, rinfo) => this.handle(buf, rinfo.address, rinfo.port));
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket = null;
        reject(err);
      };
      socket.once('error', onError);
      socket.bind(this.opts.port, host, () => {
        socket.off('error', onError);
        socket.on('error', err => {
          logger.error(LogCategory.NETWORK, 'Cyrano: erreur socket UDP', toError(err));
          this.emit('error', err);
        });
        this.boundPort = socket.address().port;
        this.helloTimer = setInterval(() => this.tick(), this.opts.helloIntervalMs);
        this.helloTimer.unref?.();
        this.sendHelloAll();
        logger.info(LogCategory.NETWORK, `Cyrano: écoute UDP sur le port ${this.boundPort}`);
        resolve(this.boundPort);
      });
    });
  }

  stop(): Promise<void> {
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return Promise.resolve();
    return new Promise(resolve => socket.close(() => resolve()));
  }

  get port(): number {
    return this.boundPort;
  }

  get running(): boolean {
    return this.socket !== null;
  }

  /**
   * Interface d'écoute (#1829) : adresse IP locale, ou vide = toutes les interfaces.
   * Prise en compte au prochain démarrage. Valeur non IP refusée.
   */
  setHost(host: string | undefined): boolean {
    const h = (host ?? '').trim();
    if (h && !isIP(h)) return false;
    this.opts.host = h || undefined;
    return true;
  }

  get host(): string | undefined {
    return this.opts.host;
  }

  setCompe(compe: string): void {
    this.opts.compe = sanitizeField(compe, 8);
  }

  /** Remplace la table des pistes ; conserve l'état de liaison des IP déjà connues. */
  setPistes(configs: CyranoPisteConfig[]): void {
    const previous = new Map(this.pistes);
    this.pistes.clear();
    for (const cfg of configs) {
      const key = ipKey(cfg.ip);
      const piste = sanitizeField(cfg.piste, 8);
      if (!key || !piste) continue;
      const old = previous.get(key);
      this.pistes.set(key, {
        piste,
        ip: cfg.ip,
        port: cfg.port ?? CYRANO_DEFAULT_PORT,
        arena: cfg.arena,
        protocol: cfg.protocol ?? 'auto',
        mode: CYRANO_PISTE_MODES.includes(cfg.mode as CyranoPisteMode)
          ? (cfg.mode as CyranoPisteMode)
          : 'master',
        key,
        status: old?.status ?? 'never',
        lastSeen: old?.lastSeen ?? null,
        detectedProtocol: old?.detectedProtocol ?? null,
        lastInfo: old?.lastInfo ?? null,
      });
    }
  }

  getStatuses(): CyranoPisteStatus[] {
    this.refreshStatuses();
    return [...this.pistes.values()].map(({ key: _key, ...rest }) => ({ ...rest }));
  }

  getLog(): CyranoFrameLogEntry[] {
    return [...this.log];
  }

  /** Statuts rafraîchis avant lecture : une piste hors ligne bascule aussitôt (#1829). */
  findPiste(piste: string): CyranoPisteStatus | undefined {
    this.refreshStatuses();
    const entry = [...this.pistes.values()].find(p => p.piste === piste);
    return entry ? this.view(entry) : undefined;
  }

  findByArena(arena: number): CyranoPisteStatus | undefined {
    this.refreshStatuses();
    const entry = [...this.pistes.values()].find(p => p.arena === arena);
    return entry ? this.view(entry) : undefined;
  }

  /** Envoie un match à afficher. Sans tireurs : DISP « vide » (aucun match disponible). */
  sendDisp(piste: string, disp: Omit<CyranoMessage, 'protocol' | 'command' | 'piste' | 'compe'>) {
    return this.send(piste, { ...disp, command: 'DISP' });
  }

  sendAck(piste: string): boolean {
    return this.send(piste, { command: 'ACK' });
  }

  sendNak(piste: string): boolean {
    return this.send(piste, { command: 'NAK' });
  }

  sendHello(piste: string): boolean {
    return this.send(piste, { command: 'HELLO' });
  }

  sendHelloAll(): void {
    for (const p of this.pistes.values()) this.send(p.piste, { command: 'HELLO' });
  }

  private protocolFor(p: PisteEntry): CyranoProtocol {
    if (p.protocol && p.protocol !== 'auto') return p.protocol;
    return p.detectedProtocol ?? this.opts.defaultProtocol;
  }

  private send(
    piste: string,
    partial: Omit<CyranoMessage, 'protocol' | 'piste' | 'compe'>
  ): boolean {
    const p = [...this.pistes.values()].find(e => e.piste === piste);
    if (!p || !this.socket) return false;
    const msg: CyranoMessage = {
      ...partial,
      protocol: this.protocolFor(p),
      piste: p.piste,
      compe: this.opts.compe,
    };
    const raw = buildCyrano(msg);
    const port = p.port ?? CYRANO_DEFAULT_PORT;
    this.record({ dir: 'out', ip: p.ip, port, piste: p.piste, raw });
    this.socket.send(raw, port, p.ip, err => {
      if (err) logger.warn(LogCategory.NETWORK, `Cyrano: envoi impossible vers ${p.ip}`, err);
    });
    return true;
  }

  private record(entry: Omit<CyranoFrameLogEntry, 'ts'>): void {
    this.log.push({ ts: this.opts.now(), ...entry });
    if (this.log.length > this.opts.logSize)
      this.log.splice(0, this.log.length - this.opts.logSize);
  }

  /** Traite un datagramme reçu (public pour les tests). */
  handle(buf: Buffer | string, address: string, port: number): void {
    const raw = typeof buf === 'string' ? buf : buf.toString('latin1');
    const entry = this.pistes.get(ipKey(address));
    if (raw.length > CYRANO_MAX_FRAME) {
      this.record({
        dir: 'in',
        ip: address,
        port,
        piste: null,
        raw: raw.slice(0, 80),
        rejected: 'malformed',
      });
      return;
    }
    const msg = parseCyrano(raw);
    if (!entry) {
      this.record({ dir: 'in', ip: address, port, piste: null, raw, rejected: 'unknown_ip' });
      this.emit('unknown', address, port, msg);
      return;
    }
    if (!msg) {
      this.record({ dir: 'in', ip: address, port, piste: entry.piste, raw, rejected: 'malformed' });
      return;
    }
    this.record({ dir: 'in', ip: address, port, piste: entry.piste, raw });
    entry.lastSeen = this.opts.now();
    entry.detectedProtocol = msg.protocol;
    if (msg.command === 'INFO') entry.lastInfo = msg;
    this.setStatus(entry, 'online');
    const view = this.view(entry);
    this.emit('message', view, msg);
    if (msg.command === 'INFO') this.emit('info', view, msg);
    else if (msg.command === 'NEXT') this.emit('next', view, msg);
    else if (msg.command === 'PREV') this.emit('prev', view, msg);
  }

  private view(entry: PisteEntry): CyranoPisteStatus {
    const { key: _key, ...rest } = entry;
    return { ...rest };
  }

  private setStatus(entry: PisteEntry, status: CyranoLinkStatus): void {
    if (entry.status === status) return;
    entry.status = status;
    this.emit('status', this.view(entry));
  }

  private refreshStatuses(): void {
    const now = this.opts.now();
    for (const entry of this.pistes.values()) {
      if (entry.lastSeen === null) continue;
      const age = now - entry.lastSeen;
      const status: CyranoLinkStatus =
        age > this.opts.offlineAfterMs
          ? 'offline'
          : age > this.opts.staleAfterMs
            ? 'stale'
            : 'online';
      this.setStatus(entry, status);
    }
  }

  /** Battement : HELLO à toutes les pistes et mise à jour des statuts (public pour les tests). */
  tick(): void {
    this.refreshStatuses();
    this.sendHelloAll();
  }
}
