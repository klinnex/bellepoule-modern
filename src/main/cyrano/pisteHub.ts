/**
 * BellePoule Modern - PisteHub : raccordement CyranoServer ↔ arènes (#1720)
 * Écoute les événements du CyranoServer (INFO, NEXT), met à jour l'arène
 * correspondante et envoie DISP quand le match change.
 * Licensed under GPL-3.0
 */

import type { RemoteScoreServer } from '../remoteScoreServer';
import type { ArenaMatch, ArenaUpdate } from '../../shared/types/remote';
import { CyranoServer, type CyranoPisteStatus } from './server';
import type { CyranoMessage } from './codec';
import { validateCyranoEnd, cyranoResult } from './endValidation';
import { buildDisp, EMPTY_DISP, type CyranoDispFencer, type CyranoDispMatch } from './disp';
import { pickCyranoNat, type CyranoNameLength, type CyranoNatSource } from './names';
import { logger, LogCategory } from '../../shared/services/logger';

export interface PisteHubOptions {
  nameLength?: CyranoNameLength;
  natSource?: CyranoNatSource;
  international?: boolean;
}

/** Associe CyranoServer aux arènes RemoteScoreServer. Instancié une seule fois. */
export class PisteHub {
  private readonly cyrano: CyranoServer;
  private readonly getRemote: () => RemoteScoreServer | null;
  private opts: Required<PisteHubOptions>;
  /** Dernier matchId envoyé en DISP par piste — évite les doublons. */
  private lastDispMatch = new Map<string, string | null>();

  constructor(
    cyrano: CyranoServer,
    getRemote: () => RemoteScoreServer | null,
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
   * Rappel installé sur `RemoteScoreServer.cyranoHook`.
   * Appelé après chaque broadcastArenaUpdate : envoie DISP si le match a changé.
   */
  onArenaUpdate = (arenaId: string, update: ArenaUpdate): void => {
    const arenaNumber = parseInt(arenaId.replace(/^arena/, ''), 10);
    if (isNaN(arenaNumber)) return;
    const piste = this.cyrano.findByArena(arenaNumber);
    if (!piste) return;

    const matchId = update.match?.id ?? null;
    if (matchId === (this.lastDispMatch.get(piste.piste) ?? undefined)) return;
    this.lastDispMatch.set(piste.piste, matchId);

    if (!update.match) {
      this.cyrano.sendDisp(piste.piste, EMPTY_DISP);
      return;
    }
    this.cyrano.sendDisp(piste.piste, this.buildDispFromUpdate(update));
    logger.info(
      LogCategory.NETWORK,
      `Cyrano: DISP → ${piste.piste} (arène ${arenaId}, match ${matchId})`
    );
  };

  /** Réinitialise le cache DISP d'une piste (utile après fin de match). */
  clearDispCache(piste: string): void {
    this.lastDispMatch.delete(piste);
  }

  private handleInfo = (piste: CyranoPisteStatus, msg: CyranoMessage): void => {
    if (!piste.arena) return;
    const remote = this.getRemote();
    if (!remote) return;
    const arenaId = `arena${piste.arena}`;
    const arena = remote.getArena(arenaId);
    if (!arena?.currentMatch) return;

    if (msg.state === 'E') {
      this.handleEnd(piste, msg, remote, arenaId, arena.currentMatch);
      return;
    }

    // Mise à jour du score en cours (état F, H, P)
    const { right, left } = msg;
    if (right?.score === undefined && left?.score === undefined) return;

    const fA = arena.currentMatch.fencerA;
    const fB = arena.currentMatch.fencerB;
    const byId: Record<string, number> = {};
    if (right?.id !== undefined && right.score !== undefined) byId[right.id] = right.score;
    if (left?.id !== undefined && left.score !== undefined) byId[left.id] = left.score;

    const scoreA = byId[fA.id] ?? arena.currentMatch.scoreA;
    const scoreB = byId[fB.id] ?? arena.currentMatch.scoreB;
    if (scoreA !== arena.currentMatch.scoreA || scoreB !== arena.currentMatch.scoreB) {
      remote.updateArenaScore(arenaId, scoreA, scoreB);
    }
  };

  private handleEnd(
    piste: CyranoPisteStatus,
    msg: CyranoMessage,
    remote: RemoteScoreServer,
    arenaId: string,
    currentMatch: ArenaMatch
  ): void {
    const verdict = validateCyranoEnd(msg);
    if (!verdict.ok) {
      this.cyrano.sendNak(piste.piste);
      logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste.piste} (motif : ${verdict.reason})`);
      return;
    }

    const result = cyranoResult(msg);
    if (result) {
      const scoreA = result.scores[currentMatch.fencerA.id] ?? currentMatch.scoreA;
      const scoreB = result.scores[currentMatch.fencerB.id] ?? currentMatch.scoreB;
      remote.updateArenaScore(arenaId, scoreA, scoreB);
    }

    this.cyrano.sendAck(piste.piste);
    logger.info(LogCategory.NETWORK, `Cyrano: ACK → ${piste.piste}`);
    this.lastDispMatch.delete(piste.piste);
    remote.finishArenaMatch(arenaId);
  }

  private handleNext = (piste: CyranoPisteStatus, _msg: CyranoMessage): void => {
    if (!piste.arena) return;
    const remote = this.getRemote();
    if (!remote) return;
    const arenaId = `arena${piste.arena}`;
    this.lastDispMatch.delete(piste.piste);
    remote.loadNextMatch(arenaId);
    logger.info(LogCategory.NETWORK, `Cyrano: NEXT sur piste ${piste.piste} → arène ${arenaId}`);
  };

  private buildDispFromUpdate(update: ArenaUpdate): ReturnType<typeof buildDisp> {
    const match = update.match!;
    const fA = match.fencerA;
    const fB = match.fencerB;

    const right: CyranoDispFencer = {
      id: fA.id,
      lastName: fA.lastName,
      firstName: fA.firstName,
      nat: pickCyranoNat(fA, this.opts.natSource, this.opts.international),
      score: update.scoreA ?? match.scoreA,
    };
    const left: CyranoDispFencer = {
      id: fB.id,
      lastName: fB.lastName,
      firstName: fB.firstName,
      nat: pickCyranoNat(fB, this.opts.natSource, this.opts.international),
      score: update.scoreB ?? match.scoreB,
    };

    const { phase, poulTab, matchNum } = coordsFromMatch(match);
    const dispMatch: CyranoDispMatch = {
      phase,
      poulTab,
      match: matchNum,
      weapon: 'E', // arme non disponible dans ArenaUpdate ; DISP reste valide
      right,
      left,
      referee: match.referee ? { id: match.referee.id, name: match.referee.name } : undefined,
    };
    return buildDisp(dispMatch, { nameLength: this.opts.nameLength });
  }
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
