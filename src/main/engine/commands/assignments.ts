/**
 * BellePoule Modern - Arbitres et pistes des poules et des matchs (#1980, docs/adr/0017)
 * assignMatches : organisation de l'épreuve écrite par le moteur (état de session, base),
 * plus par l'écran. Pas d'événement : l'affectation des arbitres a aussi d'autres chemins
 * (tablettes, moteur ADR-0014) ; elle sera journalisée quand ils passeront tous par ici
 * (ADR-0005). Même règle que l'écran pour l'arbitre principal d'une poule
 * (propagatePoolReferee).
 * Licensed under GPL-3.0
 */
import type { Pool, Referee } from '../../../shared/types';
import type { ConsolationBracket, TableauMatch } from '../../../shared/domain/tableau/tableauTypes';
import { propagatePoolReferee } from '../../../shared/utils/refereeStats';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { readSession } from './sessionView';
import {
  emitSession,
  sessionConsolation,
  sessionPools,
  sessionTableau,
  writeSession,
} from './sport';

export interface PoolAssignment {
  poolId: string;
  /** Piste ; null : aucune */
  strip?: number | null;
  /** Arbitres de la poule, principal en tête ([] : aucun) */
  refereeIds?: string[];
}

export interface MatchAssignment {
  matchId: string;
  /** Piste d'un match de tableau ; null : aucune */
  strip?: number | null;
  /** Arbitre principal ; null : aucun. Les arbitres secondaires d'un match de tableau restent */
  refereeId?: string | null;
}

export interface AssignMatchesInput {
  competitionId: string;
  pools?: PoolAssignment[];
  matches?: MatchAssignment[];
  dryRun?: boolean;
}

type RefLite = { id: string; firstName: string; lastName: string };
const lite = (r: Referee): RefLite => ({ id: r.id, firstName: r.firstName, lastName: r.lastName });

export function assignMatches(ctx: CommandContext, input: AssignMatchesInput) {
  const comp = getCompetitionOrThrow(ctx, input.competitionId);
  const session = readSession(ctx, comp.id);
  const referees = new Map(ctx.db.getRefereesByCompetition(comp.id).map(r => [r.id, r]));
  const refereeOf = (id: string): Referee => {
    const r = referees.get(id);
    if (!r) throw new CommandError('referee_not_found', `Arbitre introuvable : ${id}`);
    return r;
  };

  let pools: Pool[] = sessionPools(session);
  let tableau: TableauMatch[] = sessionTableau(session);
  let brackets: ConsolationBracket[] = sessionConsolation(session);
  const poolWrites = new Set<string>();
  const matchWrites: Array<{ dbId: string; refereeId: string | null }> = [];
  let tableauTouched = false;

  for (const a of input.pools ?? []) {
    const pool = pools.find(p => p.id === a.poolId);
    if (!pool) throw new CommandError('pool_not_found', `Poule introuvable : ${a.poolId}`);
    let next: Pool = { ...pool };
    if (a.strip !== undefined) {
      next = { ...next, strip: a.strip ?? undefined };
    }
    if (a.refereeIds !== undefined) {
      const refs = a.refereeIds.map(refereeOf);
      const { matches, changes } = propagatePoolReferee(
        next.matches ?? [],
        pool.referees?.[0]?.id,
        refs[0]
      );
      next = { ...next, referees: refs, matches };
      for (const c of changes) matchWrites.push({ dbId: c.matchId, refereeId: c.refereeId });
    }
    pools = pools.map(p => (p.id === pool.id ? next : p));
    poolWrites.add(pool.id);
  }

  const applyToTableau = (m: TableauMatch, a: MatchAssignment): TableauMatch => {
    let next: TableauMatch = { ...m };
    if (a.strip !== undefined) next = { ...next, arena: a.strip };
    if (a.refereeId !== undefined) {
      const principal = a.refereeId ? lite(refereeOf(a.refereeId)) : null;
      const others = (m.referees ?? []).slice(1).filter(r => r.id !== principal?.id);
      next = {
        ...next,
        referee: principal,
        referees: principal ? [principal, ...others] : others,
      };
      matchWrites.push({ dbId: `${comp.id}-${m.id}`, refereeId: a.refereeId });
    }
    return next;
  };

  for (const a of input.matches ?? []) {
    const pool = pools.find(p => p.matches.some(m => m.id === a.matchId));
    if (pool) {
      if (a.refereeId !== undefined) {
        const ref = a.refereeId ? refereeOf(a.refereeId) : undefined;
        pools = pools.map(p =>
          p.id === pool.id
            ? {
                ...p,
                matches: p.matches.map(m => (m.id === a.matchId ? { ...m, referee: ref } : m)),
              }
            : p
        );
        matchWrites.push({ dbId: a.matchId, refereeId: a.refereeId });
      }
      continue;
    }
    if (tableau.some(m => m.id === a.matchId)) {
      tableau = tableau.map(m => (m.id === a.matchId ? applyToTableau(m, a) : m));
      tableauTouched = true;
      continue;
    }
    const bracket = brackets.find(b => b.matches.some(m => m.id === a.matchId));
    if (!bracket) throw new CommandError('match_not_found', `Match introuvable : ${a.matchId}`);
    brackets = brackets.map(b =>
      b.id === bracket.id
        ? { ...b, matches: b.matches.map(m => (m.id === a.matchId ? applyToTableau(m, a) : m)) }
        : b
    );
    tableauTouched = true;
  }

  const report = {
    dryRun: !!input.dryRun,
    pools: (input.pools ?? []).length,
    matches: (input.matches ?? []).length,
  };
  if (input.dryRun) return report;
  ctx.db.transaction(() => {
    for (const p of pools) if (poolWrites.has(p.id)) ctx.db.updatePool(p);
    for (const w of matchWrites) {
      // Match de tableau absent de la base (jamais synchronisé) : l'état de session suffit
      try {
        ctx.db.updateMatch(w.dbId, { refereeId: w.refereeId });
      } catch {
        /* non bloquant */
      }
    }
    writeSession(ctx, comp.id, {
      pools,
      ...(tableauTouched ? { tableauMatches: tableau, consolationBrackets: brackets } : {}),
    });
  });
  emitSession(ctx, comp.id);
  return report;
}
