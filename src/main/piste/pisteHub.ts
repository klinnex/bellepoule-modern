/**
 * BellePoule Modern - PisteHub : raccordement appareils de piste ↔ arènes (#1720, #1829)
 * Indépendant du protocole : consomme les `PisteInput` d'un `PisteDriver` (Cyrano, OPP2 — #1960)
 * et lui envoie des `PisteCommand`. Chaque entrée d'appareil passe d'abord l'`ArenaInputGate`
 * (n° de séquence par source) avant d'atteindre l'arène.
 * Mode appareil maître : score, cartons et chrono viennent de l'appareil ; les tablettes
 * et écrans d'arène suivent en miroir. Les entrées de l'appareil passent par le même
 * chemin que la tablette (`arena_control`, pseudo-socket `cyrano:<piste>`).
 * Sens BellePoule → appareil : affichage au changement de match, après une correction de
 * score faite sur la tablette, et quand l'appareil au repos n'affiche pas le bon match.
 * Sabre laser et armes personnalisées : affichage seul (décision n°5) — noms et score
 * envoyés, commandes de l'appareil ignorées.
 * Relais par équipes (arène `/equipe{N}`) : voir `teamRelayPiste.ts`.
 * Licensed under GPL-3.0
 */

import type { Socket } from 'socket.io';
import type { RemoteScoreServer } from '../remoteScoreServer';
import type { ArenaMatch, ArenaUpdate } from '../../shared/types/remote';
import { resolveCyranoPhases, type MatchCoordsSource } from '../cyrano/matchCoords';
import type { CyranoNatSource } from '../cyrano/names';
import { buildMatchDisplay } from './matchDisplay';
import { toCyranoWeapon } from '../cyrano/disp';
import { logger, LogCategory } from '../../shared/services/logger';
import { ArenaInputGate } from './arenaInputGate';
import {
  isActiveState,
  mapPisteSides,
  pisteEndOutcome,
  sideCards,
  validatePisteEnd,
  type PisteSides,
} from './pisteState';
import { TeamRelayPiste } from './teamRelayPiste';
import type { TeamRelayView } from '../remote/teamRelayDevice';
import type {
  PisteDriver,
  PisteInput,
  PisteLink,
  PisteMode,
  PisteNameLength,
  PisteNotice,
  PisteState,
} from './types';

export interface PisteHubOptions {
  nameLength?: PisteNameLength;
  natSource?: CyranoNatSource;
  international?: boolean;
}

/** Actions de secours lancées depuis le panneau Cyrano (#1829). */
export type PisteAction = 'ack' | 'next' | 'prev' | 'resync';
export const PISTE_ACTIONS: readonly PisteAction[] = ['ack', 'next', 'prev', 'resync'];

/** Alerte en cours sur une piste, affichée dans le panneau Cyrano et notifiée au DT. */
export interface PisteAlert {
  kind: 'bad_match';
  since: number;
  /** Arène rattachée à la piste, pour le message au DT */
  arena: string;
  /** Noms affichés par l'appareil (droite – gauche) */
  device: string;
}

/** Dernier état connu de l'appareil (affichage envoyé ou état reçu) : évite les échos. */
export interface DeviceView {
  matchId: string | null;
  scoreA?: number;
  scoreB?: number;
}

const isFinished = (match: ArenaMatch | null | undefined, status?: string) =>
  status === 'finished' || match?.status === 'finished';

/** Serveurs distants candidats : un par épreuve (un seul hors journée multi-épreuves). */
export type RemoteSource = () => RemoteScoreServer | readonly RemoteScoreServer[] | null;

/** Arène ayant une affectation en cours (match non terminé ou suivant en file), #1878. */
const hasAssignment = (remote: RemoteScoreServer, arenaId: string): boolean =>
  typeof remote.hasArenaAssignment === 'function'
    ? remote.hasArenaAssignment(arenaId)
    : remote.hasSession();

/** Associe un pilote d'appareils aux arènes RemoteScoreServer. Instancié une seule fois. */
export class PisteHub {
  readonly driver: PisteDriver;
  private readonly getRemotes: RemoteSource;
  /** Barrière d'entrée des arènes : séquence par source (#1829) */
  readonly gate = new ArenaInputGate();
  /** Relais par équipes */
  private readonly team: TeamRelayPiste;
  /**
   * Épreuve suivie par chaque piste (#1878) : celle de son affectation en cours ; sans
   * affectation, la dernière suivie (rien n'est envoyé à l'appareil d'ici la suivante).
   */
  private routes = new Map<string, RemoteScoreServer>();
  private opts: Required<PisteHubOptions>;
  /** Ce que l'appareil affiche, par piste. */
  readonly device = new Map<string, DeviceView>();
  /** Score + cartons déjà appliqués à l'arène, par piste (pas de réécriture à chaque INFO). */
  private applied = new Map<string, string>();
  /** Dernier chrono connu de l'appareil (secondes), par piste : repris au rappel du match (PREV) */
  private watch = new Map<string, { matchId: string; stopwatch: number }>();
  /** Match (ou relais) dont la fin a été acquittée, par piste : un END répété reçoit à nouveau ACK. */
  readonly acked = new Map<string, string>();
  /** Alertes en cours (BAD MATCH), par piste. */
  private alerts = new Map<string, PisteAlert>();
  /** Pistes passées hors ligne (bascule en manuel) : l'affichage est renvoyé au retour. */
  private offline = new Set<string>();
  /** Dernier mode effectif connu, par piste : détecte un changement de mode. */
  private modes = new Map<string, PisteMode>();
  /** Demande de remplaçant déjà tracée en individuel, par piste */
  private reserveWarned = new Set<string>();
  /** Base : numéros de poule et de match de l'affichage. */
  private readonly coordsSource?: MatchCoordsSource;
  /** Notification d'une nouvelle alerte BAD MATCH (DT). */
  private readonly onAlert?: (piste: string, alert: PisteAlert) => void;
  /** Notification ponctuelle au DT (abandon ou exclusion en relais par équipes). */
  private readonly onNotice?: (piste: string, notice: PisteNotice) => void;

  constructor(
    driver: PisteDriver,
    getRemotes: RemoteSource,
    options: PisteHubOptions & {
      coordsSource?: MatchCoordsSource;
      onAlert?: (piste: string, alert: PisteAlert) => void;
      onNotice?: (piste: string, notice: PisteNotice) => void;
    } = {}
  ) {
    this.driver = driver;
    this.getRemotes = getRemotes;
    this.coordsSource = options.coordsSource;
    this.onAlert = options.onAlert;
    this.onNotice = options.onNotice;
    this.opts = {
      nameLength: options.nameLength ?? 10,
      natSource: options.natSource ?? 'auto',
      international: options.international ?? false,
    };
    this.driver.setNameLength?.(this.opts.nameLength);
    this.team = new TeamRelayPiste(this);
  }

  setOptions(opts: PisteHubOptions): void {
    this.opts = { ...this.opts, ...opts };
    this.driver.setNameLength?.(this.opts.nameLength);
  }

  get options(): Readonly<Required<PisteHubOptions>> {
    return this.opts;
  }

  /** Alertes en cours, par piste (panneau Cyrano). */
  getAlerts(): Record<string, PisteAlert> {
    return Object.fromEntries(this.alerts);
  }

  remotes(): RemoteScoreServer[] {
    const r = this.getRemotes();
    if (!r) return [];
    return Array.isArray(r) ? [...r] : [r as RemoteScoreServer];
  }

  /**
   * Épreuve de la piste (#1878) : parmi les serveurs distants, celui dont l'arène de la piste a
   * une affectation en cours (arène individuelle ou relais par équipes). Plusieurs : la dernière
   * épreuve suivie, sinon celle dont l'arène est en combat, sinon la première. Aucune : la
   * dernière suivie si elle est toujours ouverte, sinon le seul serveur en séance (une seule
   * épreuve). Changer d'épreuve oublie l'état connu de l'appareil : le prochain affichage part
   * avec l'arme et l'épreuve du nouveau match.
   */
  remoteFor(piste: PisteLink | string, commit = true): RemoteScoreServer | null {
    const status = typeof piste === 'string' ? this.driver.findPiste(piste) : piste;
    if (!status) return null;
    const all = this.remotes();
    const previous = this.routes.get(status.piste);
    let chosen: RemoteScoreServer | null = null;
    if (status.arena) {
      const arenaId = `arena${status.arena}`;
      const n = status.arena;
      const active = all.filter(r => hasAssignment(r, arenaId) || this.team.hasRelay(r, n));
      if (previous && active.includes(previous)) chosen = previous;
      else if (active.length > 0)
        chosen = active.find(r => r.getArena(arenaId)?.status === 'in_progress') ?? active[0];
    }
    if (
      !chosen &&
      previous &&
      all.includes(previous) &&
      (previous.hasSession() || (!!status.arena && this.team.hasArena(previous, status.arena)))
    )
      chosen = previous;
    if (!chosen) {
      const open = all.filter(r => r.hasSession());
      chosen = open.length === 1 ? open[0] : null;
    }
    // Rencontre par équipes terminée, toujours assignée à l'arène (PREV, END répété)
    if (!chosen && status.arena) {
      const n = status.arena;
      const teams = all.filter(r => this.team.hasArena(r, n));
      chosen = teams.length === 1 ? teams[0] : null;
    }
    if (commit && chosen && chosen !== previous) {
      if (previous) {
        logger.info(
          LogCategory.NETWORK,
          `Cyrano: piste ${status.piste} → épreuve ${this.competitionOf(chosen, status) ?? '?'}`
        );
        this.clearDispCache(status.piste);
        this.watch.delete(status.piste);
      }
      this.routes.set(status.piste, chosen);
      // Bandeau appareil et verrou de la tablette : la liaison suit la piste d'une épreuve à
      // l'autre (retirée de l'ancienne arène, publiée sur la nouvelle)
      if (status.arena) {
        const arenaId = `arena${status.arena}`;
        if (previous?.getArena(arenaId)?.cyrano?.piste === status.piste)
          previous.updateArena(arenaId, { cyrano: null });
        this.publishArenaLink(status, chosen);
      }
    }
    return chosen;
  }

  /** Épreuve d'un serveur distant : séance individuelle, sinon relais par équipes de la piste. */
  private competitionOf(remote: RemoteScoreServer, link: PisteLink): string | undefined {
    return (
      remote.getSession()?.competitionId ??
      (link.arena ? this.team.view(remote, link)?.state.competitionId : undefined)
    );
  }

  /**
   * Relais par équipes qui reçoit les entrées de la piste : même critère que le routage
   * (`hasRelay` : relais en cours). Une rencontre terminée encore assignée à `/equipe{N}` ne
   * reçoit les entrées (END répété, PREV) que si l'arène individuelle N n'a aucune affectation.
   */
  private relayFor(remote: RemoteScoreServer, link: PisteLink): TeamRelayView | null {
    const view = link.arena ? this.team.view(remote, link) : null;
    if (!view) return null;
    if (view.bout) return view;
    return hasAssignment(remote, `arena${link.arena}`) ? null : view;
  }

  phases(competitionId: string): { pool: number; tableau: number } {
    return resolveCyranoPhases(competitionId, this.coordsSource);
  }

  /** Champ épreuve de l'affichage (obligatoire en Cyrano) : l'épreuve suivie par la piste. */
  competitionField(remote: RemoteScoreServer | null, link: PisteLink): string | undefined {
    return remote ? this.competitionOf(remote, link) : undefined;
  }

  /** Épreuve suivie par chaque piste (panneau Cyrano, journée). */
  getRoutes(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const p of this.driver.getStatuses()) {
      const remote = this.remoteFor(p, false);
      out[p.piste] = remote ? (this.competitionOf(remote, p) ?? null) : null;
    }
    return out;
  }

  setBadMatch(piste: string, state: PisteState, arenaId: string): void {
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
      device: `${state.right?.name ?? '?'} – ${state.left?.name ?? '?'}`,
    };
    this.alerts.set(piste, alert);
    if (isNew) this.onAlert?.(piste, alert);
  }

  notify(piste: string, notice: PisteNotice): void {
    this.onNotice?.(piste, notice);
  }

  clearAlert(piste: string): void {
    this.alerts.delete(piste);
  }

  /**
   * Mode effectif d'une piste (#1829) :
   * - hors ligne ou piste en manuel → `manual` (bascule automatique si l'appareil tombe) ;
   * - sabre laser / armes personnalisées → `display` (décision n°5) ;
   * - sinon le mode configuré (`master` ou `display`).
   */
  modeOf(piste: PisteLink, remote: RemoteScoreServer | null = this.remoteFor(piste)): PisteMode {
    if (piste.mode === 'manual' || piste.status === 'offline') return 'manual';
    const weapon =
      (remote ? this.relayFor(remote, piste)?.state.weapon : undefined) ??
      remote?.getSessionWeapon();
    if (weapon && !toCyranoWeapon(weapon)) return 'display';
    return piste.mode;
  }

  /** Branche les écouteurs sur le pilote (sans doublon si déjà branchés). */
  attach(): void {
    this.detach();
    this.driver.on('input', this.handleInput);
    this.driver.on('status', this.handleStatus);
  }

  /** Débranche les écouteurs. */
  detach(): void {
    this.driver.off('input', this.handleInput);
    this.driver.off('status', this.handleStatus);
  }

  /** Entrée d'appareil : barrière de l'arène (séquence), puis traitement. */
  private handleInput = (input: PisteInput, link: PisteLink): void => {
    if (link.arena && !this.gate.admit(`arena${link.arena}`, ArenaInputGate.fromInput(input)))
      return;
    switch (input.kind) {
      case 'state':
        this.handleState(link, input.state);
        return;
      case 'next':
        this.handleNext(link);
        return;
      case 'prev':
        this.handlePrev(link);
        return;
    }
  };

  /**
   * Liaison : hors ligne → piste basculée en manuel ; retour en ligne → affichage du match
   * courant (l'appareil redémarré ou reconnecté reprend l'affichage sans intervention).
   */
  private handleStatus = (piste: PisteLink): void => {
    this.syncArenaLink(piste);
    if (piste.status === 'offline') {
      this.offline.add(piste.piste);
      // Appareil redémarré : il peut reprendre sa numérotation à zéro
      this.gate.forgetPiste(piste.piste);
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
   * Après un changement de table des pistes : un changement de mode renvoie l'affichage
   * (passage en manuel → plus de trame ; retour en maître ou afficheur → match courant).
   */
  syncPisteModes(): void {
    const statuses = this.driver.getStatuses();
    const known = new Set(statuses.map(s => s.piste));
    for (const piste of [...this.modes.keys()]) if (!known.has(piste)) this.modes.delete(piste);
    for (const status of statuses) {
      const mode = this.modeOf(status);
      const previous = this.modes.get(status.piste);
      this.modes.set(status.piste, mode);
      if (previous !== undefined && previous !== mode) this.resendMatch(status.piste);
      this.syncArenaLink(status);
    }
  }

  /** Bandeau appareil côté arbitre : mode et liaison de la piste reliée à l'arène (#1829). */
  private syncArenaLink(piste: PisteLink): void {
    const remote = this.remoteFor(piste);
    if (remote) this.publishArenaLink(piste, remote);
  }

  private publishArenaLink(piste: PisteLink, remote: RemoteScoreServer): void {
    if (!piste.arena) return;
    const mode = this.modeOf(piste, remote);
    remote.updateArena(`arena${piste.arena}`, {
      cyrano: { piste: piste.piste, mode, online: piste.status === 'online' },
    });
    // Arène équipe de même numéro : même verrou de la tablette
    this.team.syncLink(piste, remote, mode);
  }

  /**
   * Liaison absente de l'arène (arènes recréées au démarrage d'une séance, piste passée d'une
   * épreuve à l'autre) : republiée. Sans elle, ni bandeau appareil ni verrou sur la tablette.
   */
  private ensureArenaLink(piste: PisteLink, remote: RemoteScoreServer): void {
    if (!piste.arena) return;
    const arena = remote.getArena(`arena${piste.arena}`);
    if (arena && !arena.cyrano) this.publishArenaLink(piste, remote);
  }

  /** Match courant de l'arène (ou affichage vide) ; sans effet en manuel. */
  private resendMatch(piste: string): void {
    this.device.delete(piste);
    this.applied.delete(piste);
    const status = this.driver.findPiste(piste);
    if (!status?.arena || this.modeOf(status) === 'manual') return;
    const remote = this.remoteFor(status);
    const relay = remote ? this.relayFor(remote, status) : null;
    if (remote && relay) {
      this.team.display(status, remote, relay);
      return;
    }
    const arena = remote?.getArena(`arena${status.arena}`);
    const match = arena?.currentMatch;
    if (arena && match && !isFinished(match, arena.status)) {
      this.sendMatch(piste, match, match.scoreA, match.scoreB);
    } else {
      this.device.set(piste, { matchId: null });
      this.driver.send(piste, { kind: 'clear' });
    }
  }

  /**
   * Rappel installé sur `RemoteScoreServer.cyranoHook`, appelé après chaque
   * broadcastArenaUpdate. Affichage si le match change ou si le score diffère de celui
   * de l'appareil (correction depuis la tablette). Jamais d'affichage d'un match terminé.
   */
  onArenaUpdate = (arenaId: string, update: ArenaUpdate, source?: RemoteScoreServer): void => {
    const arenaNumber = parseInt(arenaId.replace(/^arena/, ''), 10);
    if (isNaN(arenaNumber)) return;
    // Toutes les pistes de l'arène : maître et afficheurs qui la partagent reçoivent l'affichage
    for (const piste of this.driver.findAllByArena(arenaNumber)) {
      // Pistes partagées (#1878) : seule l'épreuve suivie par la piste pilote l'appareil
      const remote = this.remoteFor(piste);
      if (source && remote !== source) continue;
      if (remote) this.ensureArenaLink(piste, remote);
      this.displayArenaUpdate(piste, update);
    }
  };

  /**
   * Rappel installé sur `RemoteScoreServer.cyranoTeamHook` : arène équipe `/equipe{N}`
   * modifiée (tablette, DT, appareil) → relais en cours affiché sur les pistes de l'arène N.
   */
  onTeamArenaUpdate = (arenaId: string, source?: RemoteScoreServer): void => {
    if (!/^\d+$/.test(arenaId)) return;
    for (const piste of this.driver.findAllByArena(Number(arenaId))) {
      // Rencontre retirée de l'arène : plus d'affectation, la piste suit encore cette épreuve
      const followed = source && this.routes.get(piste.piste) === source ? source : null;
      const remote = this.remoteFor(piste) ?? followed;
      if (!remote || (source && remote !== source)) continue;
      const mode = this.modeOf(piste, remote);
      this.team.syncLink(piste, remote, mode);
      if (mode === 'manual') continue;
      this.team.refresh(piste, remote);
    }
  };

  private displayArenaUpdate(piste: PisteLink, update: ArenaUpdate): void {
    if (this.modeOf(piste) === 'manual') return;

    const match = update.match;
    const view = this.device.get(piste.piste);
    if (!match) {
      if (view?.matchId === null) return;
      this.device.set(piste.piste, { matchId: null });
      this.driver.send(piste.piste, { kind: 'clear' });
      return;
    }
    if (isFinished(match, update.status)) return;

    const scoreA = update.scoreA ?? match.scoreA;
    const scoreB = update.scoreB ?? match.scoreB;
    if (view?.matchId === match.id && view.scoreA === scoreA && view.scoreB === scoreB) return;
    this.sendMatch(piste.piste, match, scoreA, scoreB);
  }

  /**
   * Actions de secours depuis le poste (#1829), par piste :
   * - `ack` : ACK forcé (l'appareil reste bloqué en attente d'acquittement) ;
   * - `next` : même effet que la touche NEXT de l'appareil (mêmes garde-fous) ;
   * - `resync` : oubli de l'état connu puis renvoi du match de l'arène (ou affichage vide).
   */
  pisteAction(piste: string, action: PisteAction): boolean {
    const status = this.driver.findPiste(piste);
    if (!status) return false;
    const mode = this.modeOf(status);
    logger.info(
      LogCategory.NETWORK,
      `Cyrano: action de secours « ${action} » sur piste ${piste} (mode ${mode})`
    );
    switch (action) {
      case 'ack':
        return this.driver.send(piste, { kind: 'ack' });
      case 'next':
        // Même garde-fous que la touche de l'appareil : seulement en appareil maître
        if (!status.arena || mode !== 'master') return false;
        this.handleNext(status);
        return true;
      case 'prev':
        // PREV : seulement en appareil maître, arène liée (rappel borné par la fenêtre de correction)
        if (!status.arena || mode !== 'master') return false;
        this.handlePrev(status);
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
    const status = this.driver.findPiste(piste);
    if (!status || this.modeOf(status) === 'manual') return;
    this.device.set(piste, { matchId: match.id, scoreA, scoreB });
    this.alerts.delete(piste);
    // Démarrage de séance : les matchs sont assignés avant que la session existe (arme,
    // compétition inconnues) → affichage construit juste après, dans la même tâche
    const remote = this.remoteFor(status);
    if (deferIfNoSession && !remote?.getSession()) {
      queueMicrotask(() => {
        const view = this.device.get(piste);
        if (view?.matchId !== match.id) return;
        this.sendMatch(piste, match, view.scoreA ?? scoreA, view.scoreB ?? scoreB, false);
      });
      return;
    }
    this.driver.send(piste, {
      kind: 'display',
      display: buildMatchDisplay({
        match,
        scoreA,
        scoreB,
        link: status,
        remote,
        watch: this.watch.get(piste),
        options: this.opts,
        coordsSource: this.coordsSource,
      }),
      // Champ épreuve : seulement entre plusieurs épreuves (sinon celui du pilote)
      competition: this.competitionField(remote, status),
    });
    logger.info(LogCategory.NETWORK, `Cyrano: DISP → ${piste} (match ${match.id})`);
  }

  private handleState(piste: PisteLink, state: PisteState): void {
    if (!piste.arena) return;
    const remote = this.remoteFor(piste);
    if (!remote) return;
    this.ensureArenaLink(piste, remote);
    const mode = this.modeOf(piste, remote);
    const relay = this.relayFor(remote, piste);
    if (relay) {
      this.team.handleState(piste, state, remote, mode, relay);
      return;
    }
    // Piste hors appareil : aucune entrée prise en compte, la fin reçoit un NAK
    if (mode === 'manual') {
      if (state.state === 'ending') this.driver.send(piste.piste, { kind: 'nak' });
      return;
    }
    const arenaId = `arena${piste.arena}`;
    const arena = remote.getArena(arenaId);
    const match = arena?.currentMatch;
    if (!arena || !match) return;

    const sides = mapPisteSides(state, match, id => this.driver.fencerId(id, piste.piste));

    if (state.state === 'ending') {
      if (mode === 'display') {
        this.driver.send(piste.piste, { kind: 'nak' });
        return;
      }
      this.handleEnd(piste, state, sides, remote, arenaId, match, arena.status);
      return;
    }
    if (isFinished(match, arena.status)) return;

    if (!isActiveState(state.state)) {
      // Appareil au repos (W) sans le match de l'arène : redémarrage, reconnexion → affichage
      if (!sides) this.sendMatch(piste.piste, match, match.scoreA, match.scoreB);
      return;
    }
    if (mode === 'display') return;
    if (!sides) {
      this.setBadMatch(piste.piste, state, arenaId);
      return;
    }
    this.alerts.delete(piste.piste);
    this.warnIndividualReserve(piste.piste, sides);
    this.applyDeviceState(piste, state, sides, remote, arenaId, match, arena.status);
  }

  /** Remplaçant demandé sur une épreuve individuelle : refusé, tracé une fois par demande. */
  private warnIndividualReserve(piste: string, sides: PisteSides): void {
    if (!sides.A.reserve && !sides.B.reserve) {
      this.reserveWarned.delete(piste);
      return;
    }
    if (this.reserveWarned.has(piste)) return;
    this.reserveWarned.add(piste);
    logger.warn(
      LogCategory.NETWORK,
      `Cyrano: piste ${piste} — remplaçant refusé : épreuve individuelle`
    );
  }

  /** Score, cartons, chrono de l'appareil → arène (chemin `arena_control` de la tablette). */
  private applyDeviceState(
    piste: PisteLink,
    state: PisteState,
    sides: PisteSides,
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
    const cardsA = sideCards(sides.A);
    const cardsB = sideCards(sides.B);
    // L'appareil connaît ce score : pas d'affichage en écho
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

    const time = state.stopwatch;
    if (time !== undefined) {
      this.watch.set(piste.piste, { matchId: match.id, stopwatch: time });
      const running = state.state === 'fencing';
      remote.handleArenaControl(socket, {
        arenaId,
        action: running ? 'update_timer' : 'pause_timer',
        time,
        timerStatus: running ? 'running' : 'paused',
        // État P : minute de repos (#1829)
        resting: state.state === 'pause',
      });
    }
  }

  private handleEnd(
    piste: PisteLink,
    state: PisteState,
    sides: PisteSides | null,
    remote: RemoteScoreServer,
    arenaId: string,
    match: ArenaMatch,
    arenaStatus: string
  ): void {
    // END répété (ACK perdu) pour un match déjà enregistré
    if (isFinished(match, arenaStatus)) {
      if (this.acked.get(piste.piste) === match.id) this.driver.send(piste.piste, { kind: 'ack' });
      return;
    }
    if (!sides) {
      this.setBadMatch(piste.piste, state, arenaId);
      this.driver.send(piste.piste, { kind: 'nak' });
      logger.warn(LogCategory.NETWORK, `Cyrano: NAK → ${piste.piste} (BAD MATCH)`);
      return;
    }
    const verdict = validatePisteEnd(state);
    if (!verdict.ok) {
      this.driver.send(piste.piste, { kind: 'nak' });
      logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste.piste} (motif : ${verdict.reason})`);
      return;
    }

    // Chrono à la fin du match : repris si le match est rappelé (PREV)
    if (state.stopwatch !== undefined)
      this.watch.set(piste.piste, { matchId: match.id, stopwatch: state.stopwatch });
    // État final de l'appareil (score, cartons) avant clôture
    this.applyDeviceState(
      piste,
      { ...state, stopwatch: undefined },
      sides,
      remote,
      arenaId,
      match,
      arenaStatus
    );
    // Vainqueur imposé par l'appareil (priorité, abandon, exclusion) ; marque la fin « appareil »
    match.deviceEnd = pisteEndOutcome(state, sides);
    // Score contrôlé par la commande avant l'ACK (ADR-0005) : refus → NAK, l'arbitre corrige
    const refused = remote.checkArenaFinish?.(arenaId) ?? null;
    if (refused) {
      match.deviceEnd = undefined;
      this.driver.send(piste.piste, { kind: 'nak' });
      logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste.piste} (score refusé : ${refused})`);
      return;
    }
    this.driver.send(piste.piste, { kind: 'ack' });
    logger.info(LogCategory.NETWORK, `Cyrano: ACK → ${piste.piste}`);
    this.acked.set(piste.piste, match.id);
    this.applied.delete(piste.piste);
    remote.handleArenaControl(this.deviceSocket(piste), { arenaId, action: 'finish' });
  }

  /**
   * NEXT : match suivant seulement si l'arène n'a plus de match en cours ou à jouer ;
   * sinon le match courant est renvoyé (jamais d'abandon silencieux d'un assaut).
   */
  private handleNext(piste: PisteLink): void {
    if (!piste.arena) return;
    const remote = this.remoteFor(piste);
    if (!remote) return;
    if (this.modeOf(piste, remote) !== 'master') return; // affichage seul : pas de télécommande
    const relay = this.relayFor(remote, piste);
    if (relay) {
      this.team.handleNext(piste, remote, relay);
      return;
    }
    const arenaId = `arena${piste.arena}`;
    const arena = remote.getArena(arenaId);
    const match = arena?.currentMatch;
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
  }

  /**
   * PREV (touche PREVIOUS de l'appareil, ou bouton de secours du poste) : rappel du dernier
   * match terminé de l'arène pour correction (fenêtre bornée, `recallPrevMatch`). L'affichage
   * du match rappelé part par `onArenaUpdate`, avec ses scores et cartons. Refus (combat en
   * cours, rien à rappeler, fenêtre dépassée) : l'appareil retrouve le match courant.
   */
  private handlePrev(piste: PisteLink): void {
    if (!piste.arena) return;
    const remote = this.remoteFor(piste);
    if (!remote) return;
    if (this.modeOf(piste, remote) !== 'master') return; // affichage seul : pas de télécommande
    const relay = this.relayFor(remote, piste);
    if (relay) {
      this.team.handlePrev(piste, remote, relay);
      return;
    }
    const arenaId = `arena${piste.arena}`;
    const before = remote.getArena(arenaId)?.currentMatch;
    this.device.delete(piste.piste);
    remote.handleArenaControl(this.deviceSocket(piste), { arenaId, action: 'prev' });
    const recalled = remote.getArena(arenaId)?.currentMatch;
    if (recalled && recalled !== before) {
      logger.info(LogCategory.NETWORK, `Cyrano: PREV sur piste ${piste.piste} → match rappelé`);
      // Chrono de fin du match rappelé : tablette et écran d'arène (l'affichage le porte déjà)
      const w = this.watch.get(piste.piste);
      if (w?.matchId === recalled.id)
        remote.handleArenaControl(this.deviceSocket(piste), {
          arenaId,
          action: 'pause_timer',
          time: w.stopwatch,
          timerStatus: 'paused',
        });
      return;
    }
    logger.info(
      LogCategory.NETWORK,
      `Cyrano: PREV sur piste ${piste.piste} refusé — match courant renvoyé`
    );
    this.resendMatch(piste.piste);
  }

  /** Pseudo-socket de l'appareil pour `arena_control` (id `cyrano:<piste>`). */
  private deviceSocket(piste: PisteLink): Socket {
    return { id: `cyrano:${piste.piste}`, emit: () => true } as unknown as Socket;
  }
}
