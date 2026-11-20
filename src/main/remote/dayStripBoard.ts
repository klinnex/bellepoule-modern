/**
 * BellePoule Modern - Pistes d'une journée multi-épreuves en temps réel (#1878) :
 * occupation lue sur les serveurs distants des épreuves, travail en attente proposé pour les
 * pistes libérées (selon la réservation de chaque piste), affectation en un clic ou automatique.
 * Une piste n'est proposée qu'une fois libre : on n'interrompt jamais une affectation en cours.
 * Licensed under GPL-3.0
 */
import type { ArenaMatch } from '../../shared/types/remote';
import type {
  DayStripBoard,
  DayStripLive,
  StripCandidate,
  StripRule,
} from '../../shared/types/eventDay';
import { DEFAULT_STRIP_RULE, sortCandidates, stripAllows } from '../../shared/utils/stripRules';
import type { WaitingWork } from './stripHandover';

/** Serveur distant d'une épreuve, vu par la journée */
export interface DayStripServer {
  hasSession(): boolean;
  hasArenaAssignment(arenaId: string): boolean;
  /** La piste peut recevoir du travail de l'épreuve (hors pistes indisponibles de son plan) */
  canHostStrip(strip: number): boolean;
  getWaitingWork(): WaitingWork[];
  moveWorkToArena(work: WaitingWork, strip: number): boolean;
}

export interface DayEvent {
  competitionId: string;
  title: string;
  server: DayStripServer;
}

/** Coordonnées d'un match : taille du tableau et n° du match ; n° de poule pour un match de poule */
export type TableauCoords = (
  competitionId: string,
  match: ArenaMatch
) => { size: number | null; number: number | null; pool?: number | null };

interface Candidate extends StripCandidate {
  event: DayEvent;
  work: WaitingWork;
}

function candidatesOf(events: DayEvent[], coords: TableauCoords): Candidate[] {
  const out: Candidate[] = [];
  for (const event of events) {
    if (!event.server.hasSession()) continue;
    for (const work of event.server.getWaitingWork()) {
      const base = {
        competitionId: event.competitionId,
        competitionTitle: event.title,
        fromStrip: work.fromArena,
        event,
        work,
      };
      if (work.kind === 'pool') {
        out.push({
          ...base,
          key: `${event.competitionId}|pool:${work.poolId}`,
          kind: 'pool',
          number:
            work.poolNumber ??
            coords(event.competitionId, { id: '', poolId: work.poolId } as ArenaMatch).pool ??
            null,
          tableauSize: null,
          fencers: null,
        });
      } else {
        const c = coords(event.competitionId, work.match);
        out.push({
          ...base,
          key: `${event.competitionId}|match:${work.matchId}`,
          kind: 'match',
          number: c.number,
          tableauSize: c.size,
          fencers: work.fencers,
        });
      }
    }
  }
  return out;
}

/** Épreuve dont l'arène N porte une affectation en cours (la première trouvée) */
function ownerOf(events: DayEvent[], strip: number): DayEvent | null {
  return (
    events.find(e => e.server.hasSession() && e.server.hasArenaAssignment(`arena${strip}`)) ?? null
  );
}

/** Tableau des pistes de la journée : occupation, réservation, propositions pour les libres. */
export function buildStripBoard(
  stripCount: number,
  rules: Record<number, StripRule>,
  autoAssign: boolean,
  events: DayEvent[],
  coords: TableauCoords
): DayStripBoard {
  const live = events.some(e => e.server.hasSession());
  const all = live ? sortCandidates(candidatesOf(events, coords)) : [];
  const strips: DayStripLive[] = [];
  for (let n = 1; n <= stripCount; n++) {
    const owner = ownerOf(events, n);
    const rule = rules[n] ?? DEFAULT_STRIP_RULE;
    strips.push({
      strip: n,
      competitionId: owner?.competitionId ?? null,
      competitionTitle: owner?.title ?? null,
      rule,
      candidates: owner
        ? []
        : all
            .filter(
              c => c.fromStrip !== n && c.event.server.canHostStrip(n) && stripAllows(rule, c)
            )
            .map(({ event: _e, work: _w, ...c }) => c),
    });
  }
  return { live, autoAssign, strips };
}

/**
 * Affecte une piste libre au travail désigné par `key`. Refus si la piste est occupée, si le
 * travail n'attend plus, ou si la réservation de la piste l'interdit.
 */
export function assignStrip(
  strip: number,
  key: string,
  rule: StripRule | undefined,
  events: DayEvent[],
  coords: TableauCoords
): boolean {
  if (!Number.isInteger(strip) || strip < 1 || ownerOf(events, strip)) return false;
  const target = candidatesOf(events, coords).find(c => c.key === key);
  if (!target || !stripAllows(rule ?? DEFAULT_STRIP_RULE, target)) return false;
  if (!target.event.server.canHostStrip(strip)) return false;
  return target.event.server.moveWorkToArena(target.work, strip);
}

/**
 * Affectation automatique : chaque piste libre reçoit la première proposition autorisée ;
 * un même travail n'est affecté qu'une fois. Retourne les affectations faites.
 */
export function autoAssignStrips(
  stripCount: number,
  rules: Record<number, StripRule>,
  events: DayEvent[],
  coords: TableauCoords
): { strip: number; key: string }[] {
  const done: { strip: number; key: string }[] = [];
  const board = buildStripBoard(stripCount, rules, true, events, coords);
  const used = new Set<string>();
  for (const s of board.strips) {
    if (s.competitionId) continue;
    const pick = s.candidates.find(c => !used.has(c.key));
    if (!pick) continue;
    if (assignStrip(s.strip, pick.key, s.rule, events, coords)) {
      used.add(pick.key);
      done.push({ strip: s.strip, key: pick.key });
    }
  }
  return done;
}
