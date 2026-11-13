/**
 * BellePoule Modern - PisteHub : raccordement CyranoServer ↔ arènes (#1720)
 * Mode appareil maître : score, cartons et chrono viennent de l'appareil (INFO), la fin de
 * match passe par ACK / NAK, NEXT charge le match suivant. Chaque changement de match ou
 * de score côté logiciel (tablette, DT) renvoie un DISP, sans écho vers l'appareil qui
 * vient de le produire.
 * Licensed under GPL-3.0
 */

import type { RemoteScoreServer } from '../remoteScoreServer';
import type { Arena, ArenaMatch, ArenaUpdate } from '../../shared/types/remote';
import type { DeviceArenaState } from '../remote/deviceState';
import { CyranoServer, type CyranoPisteStatus } from './server';
import type { CyranoFencer, CyranoMessage } from './codec';
import { validateCyranoEnd } from './endValidation';
import {
  buildDisp,
  EMPTY_DISP,
  toCyranoWeapon,
  type CyranoDisp,
  type CyranoDispFencer,
  type CyranoDispMatch,
} from './disp';
import { pickCyranoNat, type CyranoNameLength, type CyranoNatSource } from './names';
import {
  fencersOfMatch,
  parseCyranoTime,
  type DeviceCardCounts,
  type SideFencers,
} from './mapping';
import { logger, LogCategory } from '../../shared/services/logger';

export interface PisteHubOptions {
  nameLength?: CyranoNameLength;
  natSource?: CyranoNatSource;
  international?: boolean;
}

/** Méthodes du serveur utilisées par le raccordement. */
export type PisteRemote = Pick<
  RemoteScoreServer,
  | 'getArena'
  | 'updateArenaScore'
  | 'startArenaMatch'
  | 'finishArenaMatch'
  | 'loadNextMatch'
  | 'applyDeviceArenaState'
  | 'clearArenaEvents'
  | 'getSessionWeapon'
>;

/** Dernier DISP envoyé à une piste : match affiché et scores affichés. */
interface DispState {
  matchId: string | null;
  scoreA: number;
  scoreB: number;
}

/** Délai minimal entre deux rappels de match vers un appareil qui n'affiche pas le bon match. */
export const RESEND_INTERVAL_MS = 5000;

/** Associe CyranoServer aux arènes RemoteScoreServer. Instancié une seule fois. */
export class PisteHub {
  private readonly cyrano: CyranoServer;
  private readonly getRemote: () => PisteRemote | null;
  private opts: Required<PisteHubOptions>;
  private lastDisp = new Map<string, DispState>();
  private lastResend = new Map<string, number>();
  /** Vrai pendant une modification qui vient de l'appareil : pas d'écho DISP. */
  private deviceOrigin = false;

  constructor(
    cyrano: CyranoServer,
    getRemote: () => PisteRemote | null,
    options: PisteHubOptions = {}
  ) {
    this.cyrano = cyrano;
    this.getRemote = getRemote;
    this.opts = {
      nameLength: options.nameLength ?? 10,
      natSource: options.natSource ?? 'auto',
      international: options.international ?? false,
    };
  }

  setOptions(opts: PisteHubOptions): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** Branche les écouteurs sur le CyranoServer. */
  attach(): void {
    this.cyrano.on('info', this.handleInfo);
    this.cyrano.on('next', this.handleNext);
  }

  /** Débranche les écouteurs. */
  detach(): void {
    this.cyrano.off('info', this.handleInfo);
    this.cyrano.off('next', this.handleNext);
  }

  /**
   * Rappel installé sur `RemoteScoreServer.cyranoHook`, après chaque diffusion d'arène.
   * Envoie un DISP si le match ou les scores affichés ont changé côté logiciel.
   */
  onArenaUpdate = (arenaId: string, update: ArenaUpdate): void => {
    const arenaNumber = parseInt(arenaId.replace(/^arena/, ''), 10);
    if (isNaN(arenaNumber)) return;
    const piste = this.cyrano.findByArena(arenaNumber);
    if (!piste) return;
    const pisteId = piste.piste;
    const match = update.match;

    if (!match) {
      if (this.lastDisp.get(pisteId)?.matchId === null) return;
      this.lastDisp.set(pisteId, { matchId: null, scoreA: 0, scoreB: 0 });
      this.cyrano.sendDisp(pisteId, EMPTY_DISP);
      return;
    }

    // Match terminé : rien à afficher. L'appareil revient en attente (W) après ACK.
    if (update.status === 'finished' || match.status === 'finished') {
      this.lastDisp.delete(pisteId);
      return;
    }

    const scoreA = update.scoreA ?? match.scoreA;
    const scoreB = update.scoreB ?? match.scoreB;
    const previous = this.lastDisp.get(pisteId);
    const sameMatch = previous !== undefined && previous.matchId === match.id;
    if (sameMatch && previous.scoreA === scoreA && previous.scoreB === scoreB) return;

    if (this.deviceOrigin) {
      // Modification venue de l'appareil : il affiche déjà ce score, pas d'écho DISP
      this.lastDisp.set(pisteId, { matchId: match.id, scoreA, scoreB });
      return;
    }

    this.sendMatch(pisteId, match, scoreA, scoreB);
    logger.info(
      LogCategory.NETWORK,
      `Cyrano: DISP → ${pisteId} (arène ${arenaId}, match ${match.id}, ${scoreA}-${scoreB})`
    );
  };

  /** Réinitialise le cache DISP d'une piste (après changement de paramètres). */
  clearDispCache(piste: string): void {
    this.lastDisp.delete(piste);
  }

  private handleInfo = (piste: CyranoPisteStatus, msg: CyranoMessage): void => {
    if (!piste.arena) return;
    const remote = this.getRemote();
    if (!remote) return;
    const arenaId = `arena${piste.arena}`;

    // Arme sans télécommande (laser, personnalisée) : affichage seul
    if (!this.controlAllowed(remote)) {
      if (msg.state === 'E') this.sendNak(piste.piste, 'display_only');
      return;
    }

    const arena = remote.getArena(arenaId);
    if (msg.state === 'E') {
      this.handleEnd(piste, msg, remote, arenaId, arena);
      return;
    }

    const match = arena?.currentMatch;
    if (!arena || !match || isFinished(arena, match)) return;

    if (msg.state === 'W') {
      this.handleWaiting(piste, msg, arena, match);
      return;
    }

    const fencers = fencersOfMatch(msg, match);
    if (!fencers) {
      logger.warn(
        LogCategory.NETWORK,
        `Cyrano: BAD MATCH sur piste ${piste.piste} (tireurs ${msg.right?.id ?? '?'} / ${msg.left?.id ?? '?'}) — INFO ignoré`
      );
      return;
    }

    if (msg.state === 'F' && arena.status !== 'in_progress') {
      remote.startArenaMatch(arenaId);
    }
    const timerStatus = msg.state === 'F' ? 'running' : 'paused';
    this.withDeviceOrigin(() =>
      remote.applyDeviceArenaState(arenaId, deviceStateOf(fencers, msg, timerStatus))
    );
  };

  /** État W : si l'appareil n'affiche pas le match de l'arène, on le lui renvoie (au plus toutes les 5 s). */
  private handleWaiting(
    piste: CyranoPisteStatus,
    msg: CyranoMessage,
    arena: Arena,
    match: ArenaMatch
  ): void {
    if (fencersOfMatch(msg, match)) return;
    const now = Date.now();
    if (now - (this.lastResend.get(piste.piste) ?? 0) < RESEND_INTERVAL_MS) return;
    this.lastResend.set(piste.piste, now);
    this.sendMatch(piste.piste, match, match.scoreA, match.scoreB);
  }

  private handleEnd(
    piste: CyranoPisteStatus,
    msg: CyranoMessage,
    remote: PisteRemote,
    arenaId: string,
    arena: Arena | null
  ): void {
    const match = arena?.currentMatch;
    if (!arena || !match) {
      this.sendNak(piste.piste, 'no_match');
      return;
    }
    const fencers = fencersOfMatch(msg, match);
    if (!fencers) {
      this.sendNak(piste.piste, 'bad_match');
      return;
    }
    // END répété après ACK : acquitter sans enregistrer une seconde fois
    if (isFinished(arena, match)) {
      this.cyrano.sendAck(piste.piste);
      logger.info(
        LogCategory.NETWORK,
        `Cyrano: END répété → ACK sur ${piste.piste} (déjà enregistré)`
      );
      return;
    }

    const verdict = validateCyranoEnd(msg);
    if (!verdict.ok) {
      this.sendNak(piste.piste, verdict.reason);
      return;
    }

    this.withDeviceOrigin(() => remote.applyDeviceArenaState(arenaId, deviceStateOf(fencers, msg)));
    this.cyrano.sendAck(piste.piste);
    logger.info(LogCategory.NETWORK, `Cyrano: ACK → ${piste.piste}`);
    this.lastDisp.delete(piste.piste);
    remote.finishArenaMatch(arenaId);
    remote.clearArenaEvents(arenaId);
  }

  private handleNext = (piste: CyranoPisteStatus, _msg: CyranoMessage): void => {
    if (!piste.arena) return;
    const remote = this.getRemote();
    if (!remote) return;
    if (!this.controlAllowed(remote)) return;
    const arenaId = `arena${piste.arena}`;
    const arena = remote.getArena(arenaId);

    // Pas de changement de match pendant un assaut : on renvoie le match en cours
    if (arena?.currentMatch && arena.status === 'in_progress') {
      logger.info(LogCategory.NETWORK, `Cyrano: NEXT refusé sur ${piste.piste} (match en cours)`);
      this.sendMatch(
        piste.piste,
        arena.currentMatch,
        arena.currentMatch.scoreA,
        arena.currentMatch.scoreB
      );
      return;
    }

    this.lastDisp.delete(piste.piste);
    remote.loadNextMatch(arenaId);
    remote.clearArenaEvents(arenaId);
    logger.info(LogCategory.NETWORK, `Cyrano: NEXT sur piste ${piste.piste} → arène ${arenaId}`);
  };

  /** Télécommande autorisée pour l'arme de la séance (pas de laser ni d'arme personnalisée). */
  private controlAllowed(remote: PisteRemote): boolean {
    const weapon = remote.getSessionWeapon();
    return weapon === null || toCyranoWeapon(weapon) !== undefined;
  }

  private withDeviceOrigin(action: () => void): void {
    const previous = this.deviceOrigin;
    this.deviceOrigin = true;
    try {
      action();
    } finally {
      this.deviceOrigin = previous;
    }
  }

  private sendNak(piste: string, reason: string): void {
    this.cyrano.sendNak(piste);
    logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste} (motif : ${reason})`);
  }

  /** Envoie le match courant à la piste et mémorise ce qu'elle affiche. */
  private sendMatch(pisteId: string, match: ArenaMatch, scoreA: number, scoreB: number): void {
    this.lastDisp.set(pisteId, { matchId: match.id, scoreA, scoreB });
    this.cyrano.sendDisp(pisteId, this.buildDispFor(match, scoreA, scoreB));
  }

  private buildDispFor(match: ArenaMatch, scoreA: number, scoreB: number): CyranoDisp {
    const fA = match.fencerA;
    const fB = match.fencerB;
    const right: CyranoDispFencer = {
      id: fA.id,
      lastName: fA.lastName,
      firstName: fA.firstName,
      nat: pickCyranoNat(fA, this.opts.natSource, this.opts.international),
      score: scoreA,
    };
    const left: CyranoDispFencer = {
      id: fB.id,
      lastName: fB.lastName,
      firstName: fB.firstName,
      nat: pickCyranoNat(fB, this.opts.natSource, this.opts.international),
      score: scoreB,
    };

    const { phase, poulTab, matchNum } = coordsFromMatch(match);
    const dispMatch: CyranoDispMatch = {
      phase,
      poulTab,
      match: matchNum,
      weapon: this.getRemote()?.getSessionWeapon() ?? '',
      right,
      left,
      referee: match.referee ? { id: match.referee.id, name: match.referee.name } : undefined,
    };
    return buildDisp(dispMatch, { nameLength: this.opts.nameLength });
  }
}

/** Match terminé côté arène ou côté match. */
function isFinished(arena: Arena, match: ArenaMatch): boolean {
  return arena.status === 'finished' || match.status === 'finished';
}

/** Traduit les tireurs et la trame en état d'arène (cartons par compteurs, chrono en secondes). */
function deviceStateOf(
  fencers: SideFencers,
  msg: CyranoMessage,
  timerStatus?: 'running' | 'paused'
): DeviceArenaState {
  const counts = (f: CyranoFencer): DeviceCardCounts => ({
    yellow: f.yellowCards,
    red: f.redCards,
  });
  return {
    scoreA: fencers.A.score,
    scoreB: fencers.B.score,
    cardsA: counts(fencers.A),
    cardsB: counts(fencers.B),
    time: parseCyranoTime(msg.time),
    timerStatus,
  };
}

/** Coordonnées Cyrano (phase, poulTab, matchNum) dérivées de l'ArenaMatch. */
function coordsFromMatch(match: ArenaMatch): {
  phase: number;
  poulTab: string;
  matchNum: number;
} {
  if (match.isTableau) {
    return { phase: 2, poulTab: 'A', matchNum: 1 };
  }
  const poolNum = match.poolId ? parseInt(match.poolId.replace(/.*-/, ''), 10) || 1 : 1;
  return { phase: 1, poulTab: String(poolNum), matchNum: 1 };
}
