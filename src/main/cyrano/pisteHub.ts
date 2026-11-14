/**
 * BellePoule Modern - PisteHub : raccordement CyranoServer ↔ arènes (#1720)
 * Mode appareil maître : score, cartons et chrono viennent de l'appareil ; les tablettes
 * et écrans d'arène suivent en miroir. Les entrées de l'appareil passent par le même
 * chemin que la tablette (`arena_control`, pseudo-socket `cyrano:<piste>`).
 * Sens BellePoule → appareil : DISP au changement de match, après une correction de
 * score faite sur la tablette, et quand l'appareil au repos n'affiche pas le bon match.
 * Sabre laser et armes personnalisées : affichage seul (décision n°5) — noms et score
 * envoyés, commandes de l'appareil ignorées.
 * Licensed under GPL-3.0
 */

import type { Socket } from 'socket.io';
import type { RemoteScoreServer } from '../remoteScoreServer';
import type { ArenaMatch, ArenaUpdate } from '../../shared/types/remote';
import { CyranoServer, type CyranoPisteMode, type CyranoPisteStatus } from './server';
import type { CyranoMessage } from './codec';
import { validateCyranoEnd } from './endValidation';
import { resolveCyranoCoords, type MatchCoordsSource } from './matchCoords';
import { buildDisp, EMPTY_DISP, type CyranoDispFencer, type CyranoDispMatch } from './disp';
import { pickCyranoNat, type CyranoNameLength, type CyranoNatSource } from './names';
import {
  cyranoCards,
  isActiveCyranoState,
  mapCyranoSides,
  parseCyranoStopwatch,
  type CyranoSides,
} from './deviceState';
import { toCyranoWeapon } from './disp';
import { logger, LogCategory } from '../../shared/services/logger';

export interface PisteHubOptions {
  nameLength?: CyranoNameLength;
  natSource?: CyranoNatSource;
  international?: boolean;
}

/** Actions de secours lancées depuis le panneau Cyrano (#1829). */
export type PisteAction = 'ack' | 'next' | 'resync';
export const PISTE_ACTIONS: readonly PisteAction[] = ['ack', 'next', 'resync'];

/** Alerte en cours sur une piste, affichée dans le panneau Cyrano et notifiée au DT. */
export interface PisteAlert {
  kind: 'bad_match';
  since: number;
  /** Arène rattachée à la piste, pour le message au DT */
  arena: string;
  /** Noms affichés par l'appareil (droite – gauche) */
  device: string;
}

/** Issue d'une fin de match acceptée, rapportée aux tireurs A / B de l'arène. */
export function cyranoEndOutcome(
  msg: CyranoMessage,
  sides: CyranoSides
): NonNullable<ArenaMatch['deviceEnd']> {
  const out = (s?: string) => s === 'A' || s === 'E';
  const outA = out(sides.A.status);
  const outB = out(sides.B.status);
  if (outA !== outB) {
    const loser = outA ? sides.A : sides.B;
    return { winner: outA ? 'B' : 'A', reason: loser.status === 'A' ? 'abandon' : 'exclusion' };
  }
  if (outA || sides.A.score !== sides.B.score) return {};
  // Égalité : statut V / D de l'appareil, sinon priorité (côté appareil → tireur)
  if (sides.A.status === 'V' || sides.B.status === 'D') return { winner: 'A', reason: 'priority' };
  if (sides.B.status === 'V' || sides.A.status === 'D') return { winner: 'B', reason: 'priority' };
  if (msg.priority === 'R' || msg.priority === 'L') {
    const aHasPriority = (msg.priority === 'R') === sides.aOnRight;
    return { winner: aHasPriority ? 'A' : 'B', reason: 'priority' };
  }
  return {};
}

/** Dernier état connu de l'appareil (DISP envoyé ou INFO reçu) : évite les échos. */
interface DeviceView {
  matchId: string | null;
  scoreA?: number;
  scoreB?: number;
}

const isFinished = (match: ArenaMatch | null | undefined, status?: string) =>
  status === 'finished' || match?.status === 'finished';

/** Associe CyranoServer aux arènes RemoteScoreServer. Instancié une seule fois. */
export class PisteHub {
  private readonly cyrano: CyranoServer;
  private readonly getRemote: () => RemoteScoreServer | null;
  private opts: Required<PisteHubOptions>;
  /** Ce que l'appareil affiche, par piste. */
  private device = new Map<string, DeviceView>();
  /** Score + cartons déjà appliqués à l'arène, par piste (pas de réécriture à chaque INFO). */
  private applied = new Map<string, string>();
  /** Match dont la fin a été acquittée, par piste : un END répété reçoit à nouveau ACK. */
  private acked = new Map<string, string>();
  /** Alertes en cours (BAD MATCH), par piste. */
  private alerts = new Map<string, PisteAlert>();
  /** Pistes passées hors ligne (bascule en manuel) : le DISP est renvoyé au retour. */
  private offline = new Set<string>();
  /** Dernier mode effectif connu, par piste : détecte un changement de mode. */
  private modes = new Map<string, CyranoPisteMode>();
  /** Base : numéros de poule et de match pour le DISP. */
  private readonly coordsSource?: MatchCoordsSource;
  /** Notification d'une nouvelle alerte BAD MATCH (DT). */
  private readonly onAlert?: (piste: string, alert: PisteAlert) => void;

  constructor(
    cyrano: CyranoServer,
    getRemote: () => RemoteScoreServer | null,
    options: PisteHubOptions & {
      coordsSource?: MatchCoordsSource;
      onAlert?: (piste: string, alert: PisteAlert) => void;
    } = {}
  ) {
    this.cyrano = cyrano;
    this.getRemote = getRemote;
    this.coordsSource = options.coordsSource;
    this.onAlert = options.onAlert;
    this.opts = {
      nameLength: options.nameLength ?? 10,
      natSource: options.natSource ?? 'auto',
      international: options.international ?? false,
    };
  }

  setOptions(opts: PisteHubOptions): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** Alertes en cours, par piste (panneau Cyrano). */
  getAlerts(): Record<string, PisteAlert> {
    return Object.fromEntries(this.alerts);
  }

  private setBadMatch(piste: string, msg: CyranoMessage, arenaId: string): void {
    const isNew = !this.alerts.has(piste);
    if (isNew) {
      logger.warn(
        LogCategory.NETWORK,
        `Cyrano: piste ${piste} — tireurs de l'appareil ≠ match de l'arène ${arenaId} (BAD MATCH)`
      );
    }
    const alert: PisteAlert = {
      kind: 'bad_match',
      since: this.alerts.get(piste)?.since ?? Date.now(),
      arena: arenaId,
      device: `${msg.right?.name ?? '?'} – ${msg.left?.name ?? '?'}`,
    };
    this.alerts.set(piste, alert);
    if (isNew) this.onAlert?.(piste, alert);
  }

  /**
   * Mode effectif d'une piste (#1829) :
   * - hors ligne ou piste en manuel → `manual` (bascule automatique si l'appareil tombe) ;
   * - sabre laser / armes personnalisées → `display` (décision n°5) ;
   * - sinon le mode configuré (`master` ou `display`).
   */
  private modeOf(
    piste: CyranoPisteStatus,
    remote: RemoteScoreServer | null = this.getRemote()
  ): CyranoPisteMode {
    if (piste.mode === 'manual' || piste.status === 'offline') return 'manual';
    const weapon = remote?.getSessionWeapon();
    if (weapon && !toCyranoWeapon(weapon)) return 'display';
    return piste.mode;
  }

  /** Branche les écouteurs sur le CyranoServer. */
  attach(): void {
    this.cyrano.on('info', this.handleInfo);
    this.cyrano.on('next', this.handleNext);
    this.cyrano.on('status', this.handleStatus);
  }

  /** Débranche les écouteurs. */
  detach(): void {
    this.cyrano.off('info', this.handleInfo);
    this.cyrano.off('next', this.handleNext);
    this.cyrano.off('status', this.handleStatus);
  }

  /**
   * Liaison : hors ligne → piste basculée en manuel ; retour en ligne → DISP du match courant
   * (l'appareil redémarré ou reconnecté reprend l'affichage sans intervention).
   */
  private handleStatus = (piste: CyranoPisteStatus): void => {
    if (piste.status === 'offline') {
      this.offline.add(piste.piste);
      logger.warn(
        LogCategory.NETWORK,
        `Cyrano: piste ${piste.piste} hors ligne — bascule en manuel`
      );
      return;
    }
    if (piste.status === 'online' && this.offline.delete(piste.piste)) {
      logger.info(LogCategory.NETWORK, `Cyrano: piste ${piste.piste} de retour en ligne`);
      this.resendMatch(piste.piste);
    }
  };

  /**
   * Après un changement de table des pistes : un changement de mode renvoie le DISP
   * (passage en manuel → plus de trame ; retour en maître ou afficheur → match courant).
   */
  syncPisteModes(): void {
    const statuses = this.cyrano.getStatuses();
    const known = new Set(statuses.map(s => s.piste));
    for (const piste of [...this.modes.keys()]) if (!known.has(piste)) this.modes.delete(piste);
    for (const status of statuses) {
      const mode = this.modeOf(status);
      const previous = this.modes.get(status.piste);
      this.modes.set(status.piste, mode);
      if (previous !== undefined && previous !== mode) this.resendMatch(status.piste);
    }
  }

  /** DISP du match courant de l'arène (ou affichage vide) ; sans effet en manuel. */
  private resendMatch(piste: string): void {
    this.device.delete(piste);
    this.applied.delete(piste);
    const status = this.cyrano.findPiste(piste);
    if (!status?.arena || this.modeOf(status) === 'manual') return;
    const arena = this.getRemote()?.getArena(`arena${status.arena}`);
    const match = arena?.currentMatch;
    if (arena && match && !isFinished(match, arena.status)) {
      this.sendMatch(piste, match, match.scoreA, match.scoreB);
    } else {
      this.device.set(piste, { matchId: null });
      this.cyrano.sendDisp(piste, EMPTY_DISP);
    }
  }

  /**
   * Rappel installé sur `RemoteScoreServer.cyranoHook`, appelé après chaque
   * broadcastArenaUpdate. DISP si le match change ou si le score diffère de celui
   * de l'appareil (correction depuis la tablette). Jamais de DISP d'un match terminé.
   */
  onArenaUpdate = (arenaId: string, update: ArenaUpdate): void => {
    const arenaNumber = parseInt(arenaId.replace(/^arena/, ''), 10);
    if (isNaN(arenaNumber)) return;
    const piste = this.cyrano.findByArena(arenaNumber);
    if (!piste || this.modeOf(piste) === 'manual') return;

    const match = update.match;
    const view = this.device.get(piste.piste);
    if (!match) {
      if (view?.matchId === null) return;
      this.device.set(piste.piste, { matchId: null });
      this.cyrano.sendDisp(piste.piste, EMPTY_DISP);
      return;
    }
    if (isFinished(match, update.status)) return;

    const scoreA = update.scoreA ?? match.scoreA;
    const scoreB = update.scoreB ?? match.scoreB;
    if (view?.matchId === match.id && view.scoreA === scoreA && view.scoreB === scoreB) return;
    this.sendMatch(piste.piste, match, scoreA, scoreB);
  };

  /**
   * Actions de secours depuis le poste (#1829), par piste :
   * - `ack` : ACK forcé (l'appareil reste bloqué en attente d'acquittement) ;
   * - `next` : même effet que la touche NEXT de l'appareil (mêmes garde-fous) ;
   * - `resync` : oubli de l'état connu puis renvoi du match de l'arène (ou affichage vide).
   */
  pisteAction(piste: string, action: PisteAction): boolean {
    const status = this.cyrano.findPiste(piste);
    if (!status) return false;
    const mode = this.modeOf(status);
    logger.info(
      LogCategory.NETWORK,
      `Cyrano: action de secours « ${action} » sur piste ${piste} (mode ${mode})`
    );
    switch (action) {
      case 'ack':
        return this.cyrano.sendAck(piste);
      case 'next':
        // Même garde-fous que la touche de l'appareil : seulement en appareil maître
        if (!status.arena || mode !== 'master') return false;
        this.handleNext(status, { protocol: 'EFP1.1', command: 'NEXT', piste, compe: '' });
        return true;
      case 'resync':
        if (mode === 'manual') return false;
        this.clearDispCache(piste);
        this.resendMatch(piste);
        return true;
      default:
        return false;
    }
  }

  /** Réinitialise l'état connu d'une piste. */
  clearDispCache(piste: string): void {
    this.device.delete(piste);
    this.applied.delete(piste);
    this.alerts.delete(piste);
  }

  private sendMatch(
    piste: string,
    match: ArenaMatch,
    scoreA: number,
    scoreB: number,
    deferIfNoSession = true
  ): void {
    const status = this.cyrano.findPiste(piste);
    if (!status || this.modeOf(status) === 'manual') return;
    this.device.set(piste, { matchId: match.id, scoreA, scoreB });
    this.alerts.delete(piste);
    // Démarrage de séance : les matchs sont assignés avant que la session existe (arme,
    // compétition inconnues) → DISP construit juste après, dans la même tâche
    if (deferIfNoSession && !this.getRemote()?.getSession()) {
      queueMicrotask(() => {
        const view = this.device.get(piste);
        if (view?.matchId !== match.id) return;
        this.sendMatch(piste, match, view.scoreA ?? scoreA, view.scoreB ?? scoreB, false);
      });
      return;
    }
    this.cyrano.sendDisp(piste, this.buildDispFor(match, scoreA, scoreB));
    logger.info(LogCategory.NETWORK, `Cyrano: DISP → ${piste} (match ${match.id})`);
  }

  private handleInfo = (piste: CyranoPisteStatus, msg: CyranoMessage): void => {
    if (!piste.arena) return;
    const remote = this.getRemote();
    if (!remote) return;
    const mode = this.modeOf(piste, remote);
    // Piste hors appareil : aucune entrée prise en compte, la fin reçoit un NAK
    if (mode === 'manual') {
      if (msg.state === 'E') this.cyrano.sendNak(piste.piste);
      return;
    }
    const arenaId = `arena${piste.arena}`;
    const arena = remote.getArena(arenaId);
    const match = arena?.currentMatch;
    if (!arena || !match) return;

    const sides = mapCyranoSides(msg, match);

    if (msg.state === 'E') {
      if (mode === 'display') {
        this.cyrano.sendNak(piste.piste);
        return;
      }
      this.handleEnd(piste, msg, sides, remote, arenaId, match, arena.status);
      return;
    }
    if (isFinished(match, arena.status)) return;

    if (!isActiveCyranoState(msg.state)) {
      // Appareil au repos (W) sans le match de l'arène : redémarrage, reconnexion → DISP
      if (!sides) this.sendMatch(piste.piste, match, match.scoreA, match.scoreB);
      return;
    }
    if (mode === 'display') return;
    if (!sides) {
      this.setBadMatch(piste.piste, msg, arenaId);
      return;
    }
    this.alerts.delete(piste.piste);
    this.applyDeviceState(piste, msg, sides, remote, arenaId, match, arena.status);
  };

  /** Score, cartons, chrono de l'appareil → arène (chemin `arena_control` de la tablette). */
  private applyDeviceState(
    piste: CyranoPisteStatus,
    msg: CyranoMessage,
    sides: CyranoSides,
    remote: RemoteScoreServer,
    arenaId: string,
    match: ArenaMatch,
    arenaStatus: string
  ): void {
    const socket = this.deviceSocket(piste);
    if (arenaStatus !== 'in_progress')
      remote.handleArenaControl(socket, { arenaId, action: 'start' });

    const scoreA = sides.A.score ?? match.scoreA;
    const scoreB = sides.B.score ?? match.scoreB;
    const cardsA = cyranoCards(sides.A);
    const cardsB = cyranoCards(sides.B);
    // L'appareil connaît ce score : pas de DISP en écho
    this.device.set(piste.piste, { matchId: match.id, scoreA, scoreB });
    const key = JSON.stringify([match.id, scoreA, scoreB, cardsA, cardsB]);
    if (
      key !== this.applied.get(piste.piste) ||
      scoreA !== match.scoreA ||
      scoreB !== match.scoreB
    ) {
      this.applied.set(piste.piste, key);
      remote.handleArenaControl(socket, {
        arenaId,
        action: 'update_score',
        scoreA,
        scoreB,
        cardsA,
        cardsB,
      });
    }

    const time = parseCyranoStopwatch(msg.stopwatch);
    if (time !== null) {
      const running = msg.state === 'F';
      remote.handleArenaControl(socket, {
        arenaId,
        action: running ? 'update_timer' : 'pause_timer',
        time,
        timerStatus: running ? 'running' : 'paused',
      });
    }
  }

  private handleEnd(
    piste: CyranoPisteStatus,
    msg: CyranoMessage,
    sides: CyranoSides | null,
    remote: RemoteScoreServer,
    arenaId: string,
    match: ArenaMatch,
    arenaStatus: string
  ): void {
    // END répété (ACK perdu) pour un match déjà enregistré
    if (isFinished(match, arenaStatus)) {
      if (this.acked.get(piste.piste) === match.id) this.cyrano.sendAck(piste.piste);
      return;
    }
    if (!sides) {
      this.setBadMatch(piste.piste, msg, arenaId);
      this.cyrano.sendNak(piste.piste);
      logger.warn(LogCategory.NETWORK, `Cyrano: NAK → ${piste.piste} (BAD MATCH)`);
      return;
    }
    const verdict = validateCyranoEnd(msg);
    if (!verdict.ok) {
      this.cyrano.sendNak(piste.piste);
      logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste.piste} (motif : ${verdict.reason})`);
      return;
    }

    // État final de l'appareil (score, cartons) avant clôture
    this.applyDeviceState(
      piste,
      { ...msg, stopwatch: undefined },
      sides,
      remote,
      arenaId,
      match,
      arenaStatus
    );
    // Vainqueur imposé par l'appareil (priorité, abandon, exclusion) ; marque la fin « appareil »
    match.deviceEnd = cyranoEndOutcome(msg, sides);
    this.cyrano.sendAck(piste.piste);
    logger.info(LogCategory.NETWORK, `Cyrano: ACK → ${piste.piste}`);
    this.acked.set(piste.piste, match.id);
    this.applied.delete(piste.piste);
    remote.handleArenaControl(this.deviceSocket(piste), { arenaId, action: 'finish' });
  }

  /**
   * NEXT : match suivant seulement si l'arène n'a plus de match en cours ou à jouer ;
   * sinon le match courant est renvoyé (jamais d'abandon silencieux d'un assaut).
   */
  private handleNext = (piste: CyranoPisteStatus, _msg: CyranoMessage): void => {
    if (!piste.arena) return;
    const remote = this.getRemote();
    if (!remote) return;
    const arenaId = `arena${piste.arena}`;
    const arena = remote.getArena(arenaId);
    const match = arena?.currentMatch;
    if (this.modeOf(piste, remote) !== 'master') return; // affichage seul : pas de télécommande
    if (arena && match && !isFinished(match, arena.status)) {
      logger.info(
        LogCategory.NETWORK,
        `Cyrano: NEXT sur piste ${piste.piste} refusé — match ${match.id} non terminé, DISP renvoyé`
      );
      this.sendMatch(piste.piste, match, match.scoreA, match.scoreB);
      return;
    }
    this.device.delete(piste.piste);
    remote.handleArenaControl(this.deviceSocket(piste), { arenaId, action: 'next' });
    logger.info(LogCategory.NETWORK, `Cyrano: NEXT sur piste ${piste.piste} → arène ${arenaId}`);
  };

  /** Pseudo-socket de l'appareil pour `arena_control` (id `cyrano:<piste>`). */
  private deviceSocket(piste: CyranoPisteStatus): Socket {
    return { id: `cyrano:${piste.piste}`, emit: () => true } as unknown as Socket;
  }

  private buildDispFor(match: ArenaMatch, scoreA: number, scoreB: number) {
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

    const remote = this.getRemote();
    const { phase, poulTab, matchNum } = resolveCyranoCoords(
      match,
      remote?.getSession()?.competitionId,
      this.coordsSource
    );
    const dispMatch: CyranoDispMatch = {
      phase,
      poulTab,
      match: matchNum,
      // Arme de la séance ; Laser / CUSTOM → champ vide (affichage seul)
      weapon: remote?.getSessionWeapon() ?? '',
      right,
      left,
      referee: match.referee ? { id: match.referee.id, name: match.referee.name } : undefined,
    };
    return buildDisp(dispMatch, { nameLength: this.opts.nameLength });
  }
}
