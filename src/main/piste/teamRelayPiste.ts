/**
 * BellePoule Modern - Relais FIE par équipes sur appareil de piste (#1829)
 * Une piste rattachée à l'arène N suit l'arène équipe `/equipe{N}` quand une rencontre en
 * relais FIE y est assignée (`setTeamArenaMatch`). L'appareil affiche le relais en cours :
 * - affichage `type = team`, `round` = n° du relais, tireurs du relais, scores cumulés ;
 * - état reçu : score cumulé → score du relais en cours, cartons reportés à ce relais ;
 * - fin d'un relais (pas le dernier) : toujours correcte → ACK, relais enregistré, puis
 *   affichage du relais suivant avec les scores cumulés ; dernier relais : règles de fin
 *   individuelles du module partagé ;
 * - remplaçant demandé (`reserve`) : accepté une fois par équipe, pour les relais suivants ;
 * - NEXT ne saute jamais un relais ; PREV rappelle le relais précédent tant que le relais en
 *   cours n'a pas commencé (ou après la fin de la rencontre).
 * Format « arène laser » (assauts indépendants) : non raccordé.
 * Licensed under GPL-3.0
 */

import type { RemoteScoreServer } from '../remoteScoreServer';
import type { TeamArenaBout } from '../remote/types';
import {
  applyRelayDeviceState,
  finishRelay,
  reopenPreviousRelay,
  substituteRelayFencer,
  teamRelayView,
  type TeamRelayView,
} from '../remote/teamRelayDevice';
import { pickCyranoNat, type CyranoNatSource } from '../cyrano/names';
import { logger, LogCategory } from '../../shared/services/logger';
import {
  cardCounts,
  isActiveState,
  mapPisteSides,
  pisteEndOutcome,
  sideCards,
  validatePisteEnd,
  type PisteSides,
} from './pisteState';
import type { DeviceView } from './pisteHub';
import type { PisteDisplaySide, PisteDriver, PisteLink, PisteMode, PisteState } from './types';

/** Ce que le relais par équipes utilise du PisteHub. */
export interface TeamPisteHost {
  readonly driver: PisteDriver;
  readonly device: Map<string, DeviceView>;
  readonly acked: Map<string, string>;
  readonly options: Readonly<{ natSource: CyranoNatSource; international: boolean }>;
  setBadMatch(piste: string, state: PisteState, arenaId: string): void;
  clearAlert(piste: string): void;
  competitionField(remote: RemoteScoreServer | null, link: PisteLink): string | undefined;
}

/** Contexte de l'arène équipe d'un serveur distant (absent sur un serveur simulé). */
function teamCtx(remote: RemoteScoreServer): RemoteScoreServer['teamArenaCtx'] | null {
  return (remote as Partial<Pick<RemoteScoreServer, 'teamArenaCtx'>>).teamArenaCtx ?? null;
}

/** Clé d'un relais pour l'état connu de l'appareil et l'ACK. */
const relayKey = (matchId: string, bout: Pick<TeamArenaBout, 'boutOrder'>) =>
  `team:${matchId}#${bout.boutOrder}`;

export class TeamRelayPiste {
  /** Demande de remplaçant déjà traitée, par piste et côté (répétée dans chaque état) */
  private reserveSeen = new Map<string, string>();

  constructor(private readonly host: TeamPisteHost) {}

  /** Relais FIE en direct sur l'arène équipe de la piste ; null sinon. */
  view(remote: RemoteScoreServer, link: PisteLink): TeamRelayView | null {
    const ctx = link.arena ? teamCtx(remote) : null;
    return ctx ? teamRelayView(ctx, String(link.arena)) : null;
  }

  /** Relais en cours sur l'arène équipe N (routage des pistes partagées). */
  hasRelay(remote: RemoteScoreServer, arena: number): boolean {
    const ctx = teamCtx(remote);
    return !!ctx && !!teamRelayView(ctx, String(arena))?.bout;
  }

  /** Rencontre par équipes assignée à l'arène N, terminée ou non. */
  hasArena(remote: RemoteScoreServer, arena: number): boolean {
    return !!teamCtx(remote)?.teamArenaState.has(String(arena));
  }

  private sides(state: PisteState, bout: TeamArenaBout): PisteSides | null {
    return mapPisteSides(
      state,
      { fencerA: { id: bout.fencerAId }, fencerB: { id: bout.fencerBId } },
      id => this.host.driver.fencerId(id)
    );
  }

  private send(piste: string, kind: 'ack' | 'nak' | 'clear'): void {
    this.host.driver.send(piste, { kind });
  }

  /** Tireur d'un relais à afficher : nom en base, nation = pays ou équipe. */
  private side(
    remote: RemoteScoreServer,
    fencerId: string,
    fallbackName: string,
    teamName: string,
    score: number,
    cards: string[] | undefined
  ): PisteDisplaySide {
    const f = teamCtx(remote)?.db.getFencer(fencerId) ?? null;
    const { natSource, international } = this.host.options;
    const country =
      (natSource === 'auto' ? international : natSource === 'country') && f
        ? pickCyranoNat(f, 'country', true)
        : '';
    return {
      id: fencerId,
      lastName: f?.lastName ?? fallbackName,
      firstName: f?.firstName ?? '',
      nat: country || teamName,
      score,
      ...cardCounts(cards),
    };
  }

  /** Affiche le relais en cours (scores cumulés), ou rien quand la rencontre est terminée. */
  display(link: PisteLink, remote: RemoteScoreServer, view: TeamRelayView): void {
    const piste = link.piste;
    const { state, bout } = view;
    if (!bout) {
      this.host.device.set(piste, { matchId: null });
      this.send(piste, 'clear');
      return;
    }
    const key = relayKey(state.matchId, bout);
    this.host.device.set(piste, { matchId: key, scoreA: view.cumulA, scoreB: view.cumulB });
    this.host.clearAlert(piste);
    const cards = state.deviceCards?.[bout.id];
    this.host.driver.send(piste, {
      kind: 'display',
      display: {
        type: 'team',
        round: bout.boutOrder,
        weapon: state.weapon,
        right: this.side(
          remote,
          bout.fencerAId,
          bout.fencerAName,
          state.teamAName,
          view.cumulA,
          cards?.cardsA
        ),
        left: this.side(
          remote,
          bout.fencerBId,
          bout.fencerBName,
          state.teamBName,
          view.cumulB,
          cards?.cardsB
        ),
      },
      competition: this.host.competitionField(remote, link),
    });
    logger.info(LogCategory.NETWORK, `Cyrano: DISP → ${piste} (relais ${bout.boutOrder}, ${key})`);
  }

  /** Arène équipe modifiée : affichage si le relais ou le score cumulé diffèrent de l'appareil. */
  refresh(link: PisteLink, remote: RemoteScoreServer): void {
    const view = this.view(remote, link);
    const known = this.host.device.get(link.piste);
    if (!view) {
      // Rencontre retirée de l'arène : l'appareil ne garde pas le relais
      if (known?.matchId?.startsWith('team:')) {
        this.host.device.set(link.piste, { matchId: null });
        this.send(link.piste, 'clear');
      }
      return;
    }
    if (!view.bout) {
      if (known?.matchId !== null) this.display(link, remote, view);
      return;
    }
    if (
      known?.matchId === relayKey(view.state.matchId, view.bout) &&
      known.scoreA === view.cumulA &&
      known.scoreB === view.cumulB
    )
      return;
    this.display(link, remote, view);
  }

  handleState(
    link: PisteLink,
    state: PisteState,
    remote: RemoteScoreServer,
    mode: PisteMode,
    view: TeamRelayView
  ): void {
    const piste = link.piste;
    if (mode === 'manual') {
      if (state.state === 'ending') this.send(piste, 'nak');
      return;
    }
    if (state.state === 'ending') {
      if (mode === 'display') this.send(piste, 'nak');
      else this.handleEnd(link, state, remote, view);
      return;
    }
    const { bout } = view;
    if (!bout) return; // rencontre terminée
    const sides = this.sides(state, bout);
    if (!isActiveState(state.state)) {
      // Appareil au repos sans le relais en cours (redémarrage, ACK reçu) → affichage
      if (!sides) this.display(link, remote, view);
      return;
    }
    if (mode === 'display') return;
    if (!sides) {
      this.host.setBadMatch(piste, state, `equipe${link.arena}`);
      return;
    }
    this.host.clearAlert(piste);
    this.substitutions(link, sides, remote, view);
    if (!this.apply(link, state, sides, remote, view)) this.display(link, remote, view);
  }

  /** Score cumulé, cartons et chrono → relais en cours ; false si l'arène refuse le cumul. */
  private apply(
    link: PisteLink,
    state: PisteState,
    sides: PisteSides,
    remote: RemoteScoreServer,
    view: TeamRelayView
  ): boolean {
    const ctx = teamCtx(remote);
    if (!ctx || !view.bout) return false;
    const cumulA = sides.A.score ?? view.cumulA;
    const cumulB = sides.B.score ?? view.cumulB;
    // L'appareil connaît ce score : pas d'affichage en écho
    const key = relayKey(view.state.matchId, view.bout);
    this.host.device.set(link.piste, { matchId: key, scoreA: cumulA, scoreB: cumulB });
    const { accepted } = applyRelayDeviceState(ctx, String(link.arena), {
      cumulA,
      cumulB,
      cardsA: sideCards(sides.A),
      cardsB: sideCards(sides.B),
      stopwatch: state.stopwatch,
      running: state.state === 'fencing',
    });
    if (!accepted) this.host.device.delete(link.piste);
    return accepted;
  }

  /** Remplaçant : demande traitée une fois par tireur sorti ; refus tracé. */
  private substitutions(
    link: PisteLink,
    sides: PisteSides,
    remote: RemoteScoreServer,
    view: TeamRelayView
  ): void {
    const ctx = teamCtx(remote);
    if (!ctx || !view.bout) return;
    for (const side of ['A', 'B'] as const) {
      const seenKey = `${link.piste}:${side}`;
      if (!sides[side].reserve) {
        this.reserveSeen.delete(seenKey);
        continue;
      }
      const out = side === 'A' ? view.bout.fencerAId : view.bout.fencerBId;
      const request = `${view.state.matchId}:${out}`;
      if (this.reserveSeen.get(seenKey) === request) continue;
      this.reserveSeen.set(seenKey, request);
      const result = substituteRelayFencer(ctx, String(link.arena), side, out);
      if (result.ok)
        logger.info(
          LogCategory.NETWORK,
          `Cyrano: piste ${link.piste} — remplaçant ${result.reserveId} pour ${out} ` +
            `(relais ${result.relays.join(', ')})`
        );
      else
        logger.warn(
          LogCategory.NETWORK,
          `Cyrano: piste ${link.piste} — remplaçant refusé pour ${out} (motif : ${result.reason})`
        );
    }
  }

  private handleEnd(
    link: PisteLink,
    state: PisteState,
    remote: RemoteScoreServer,
    view: TeamRelayView
  ): void {
    const piste = link.piste;
    const ctx = teamCtx(remote);
    const { bout, previous } = view;
    const acked = this.host.acked.get(piste);
    // END répété (ACK perdu) d'un relais déjà enregistré
    const repeated =
      !!previous &&
      acked === relayKey(view.state.matchId, previous) &&
      !!this.sides(state, previous);
    if (!bout || !ctx) {
      if (repeated) this.send(piste, 'ack');
      return;
    }
    const sides = this.sides(state, bout);
    if (!sides) {
      if (repeated) {
        this.send(piste, 'ack');
        return;
      }
      this.host.setBadMatch(piste, state, `equipe${link.arena}`);
      this.send(piste, 'nak');
      logger.warn(LogCategory.NETWORK, `Cyrano: NAK → ${piste} (BAD MATCH, relais)`);
      return;
    }
    // Relais intermédiaire : fin toujours correcte ; dernier relais : règles individuelles
    const verdict = validatePisteEnd(state, { intermediateRound: !view.isLast });
    if (!verdict.ok) {
      this.send(piste, 'nak');
      logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste} (motif : ${verdict.reason})`);
      return;
    }
    // Le modèle d'équipe déduit le vainqueur du cumul : un vainqueur imposé par l'appareil
    // (priorité à égalité au dernier relais, abandon ou exclusion à n'importe quel relais) ne
    // peut pas être enregistré. Jamais d'abandon ni d'exclusion perdus en silence : NAK tracé.
    const forfeit = [sides.A, sides.B].some(
      s => s.status === 'abandon' || s.status === 'exclusion'
    );
    if (forfeit || (view.isLast && pisteEndOutcome(state, sides).winner)) {
      this.send(piste, 'nak');
      logger.warn(
        LogCategory.NETWORK,
        `Cyrano: NAK → ${piste} (relais ${bout.boutOrder} : ` +
          `${forfeit ? 'abandon ou exclusion' : 'vainqueur imposé'} non enregistrable par le ` +
          `modèle d'équipe, à saisir par le DT)`
      );
      return;
    }
    if (!this.apply(link, { ...state, stopwatch: undefined }, sides, remote, view)) {
      this.send(piste, 'nak');
      logger.info(LogCategory.NETWORK, `Cyrano: NAK → ${piste} (cumul incohérent)`);
      return;
    }
    const key = relayKey(view.state.matchId, bout);
    this.send(piste, 'ack');
    this.host.acked.set(piste, key);
    logger.info(LogCategory.NETWORK, `Cyrano: ACK → ${piste} (relais ${bout.boutOrder})`);
    // Relais enregistré ; l'arène prévient le hub, qui affiche le relais suivant
    this.host.device.delete(piste);
    finishRelay(ctx, String(link.arena));
  }

  /** NEXT : ne saute jamais un relais ; rencontre terminée → affichage vide. */
  handleNext(link: PisteLink, remote: RemoteScoreServer, view: TeamRelayView): void {
    if (view.bout)
      logger.info(
        LogCategory.NETWORK,
        `Cyrano: NEXT sur piste ${link.piste} refusé — relais ${view.bout.boutOrder} non terminé`
      );
    else
      logger.info(
        LogCategory.NETWORK,
        `Cyrano: NEXT sur piste ${link.piste} — rencontre terminée, prochaine rencontre à assigner`
      );
    this.display(link, remote, view);
  }

  /** PREV : rappel du relais précédent (relais en cours pas commencé, ou rencontre terminée). */
  handlePrev(link: PisteLink, remote: RemoteScoreServer, view: TeamRelayView): void {
    const ctx = teamCtx(remote);
    this.host.device.delete(link.piste);
    if (ctx && reopenPreviousRelay(ctx, String(link.arena))) {
      logger.info(LogCategory.NETWORK, `Cyrano: PREV sur piste ${link.piste} → relais rappelé`);
      return;
    }
    logger.info(
      LogCategory.NETWORK,
      `Cyrano: PREV sur piste ${link.piste} refusé — relais en cours renvoyé`
    );
    this.display(link, remote, this.view(remote, link) ?? view);
  }
}
