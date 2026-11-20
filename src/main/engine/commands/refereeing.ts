/**
 * BellePoule Modern - Commandes des arbitres (docs/adr/0014) : réglages d'affectation
 * (fusion côté moteur dans competitions.settings.refereeing), affectation automatique des
 * poules par le moteur unique (shared/domain/referees), affectation à la main.
 * Licensed under GPL-3.0
 */
import type { Competition, Pool, Referee, RefereeingSettings } from '../../../shared/types';
import { propagatePoolReferee } from '../../../shared/utils/refereeStats';
import { autoAssignReferees } from '../../../shared/domain/referees/refereeAutoAssign';
import { neutralityConflicts } from '../../../shared/domain/referees/refereeMatching';
import {
  mergeRefereeing,
  resolveRefereeing,
  type ResolvedRefereeing,
} from '../../../shared/domain/referees/refereeingSettings';
import { CommandError, type CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { readSession } from './sessionView';
import { assertSupported, emitSession, sessionPools, writeSession } from './sport';

export function setRefereeingSettings(
  ctx: CommandContext,
  competitionId: string,
  patch: RefereeingSettings & { dryRun?: boolean }
): { dryRun: boolean; refereeing: ResolvedRefereeing } {
  const { dryRun, ...change } = patch;
  // Relu en base : jamais d'écriture depuis un état d'écran périmé
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const refereeing = mergeRefereeing(comp.settings?.refereeing, change);
  const out = { dryRun: !!dryRun, refereeing: resolveRefereeing(refereeing) };
  if (dryRun) return out;
  ctx.db.updateCompetition(competitionId, {
    settings: { ...comp.settings, refereeing } as Competition['settings'],
  });
  ctx.emitChange?.({ scope: 'competitions', competitionIds: [competitionId] });
  return out;
}

/**
 * Arbitres des poules : un arbitre principal par poule sans arbitre (ou toutes avec
 * replace), parmi les arbitres pointés, par le moteur d'affectation unique (couplage
 * optimal, neutralité club / nation / ligue selon l'épreuve, docs/adr/0014). Un arbitre
 * peut enchaîner plusieurs poules s'il en manque ; une poule sans arbitre neutre reste
 * sans arbitre et est expliquée (« unassigned »).
 */
export function assignPoolReferees(
  ctx: CommandContext,
  competitionId: string,
  options: { replace?: boolean; includeUnchecked?: boolean; dryRun?: boolean } = {}
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  const pools = sessionPools(session);
  if (pools.length === 0)
    throw new CommandError('no_pools', 'Aucune poule : generate_pools d’abord');
  const referees = ctx.db.getRefereesByCompetition(competitionId);
  const candidates = options.includeUnchecked
    ? referees.map(r => ({ ...r, status: 'available' as const }))
    : referees.filter(r => r.status !== 'unavailable');
  if (candidates.length === 0) {
    throw new CommandError(
      'no_referees',
      options.includeUnchecked ? 'Aucun arbitre dans l’épreuve' : 'Aucun arbitre pointé'
    );
  }
  const targets = pools.filter(p => options.replace || !p.referees?.length);
  // Charge : poules déjà arbitrées et conservées
  const load = new Map<string, number>();
  for (const p of pools) {
    const id = p.referees?.[0]?.id;
    if (id && !targets.includes(p)) load.set(id, (load.get(id) ?? 0) + 1);
  }
  const rules = resolveRefereeing(comp.settings?.refereeing);
  const result = autoAssignReferees(
    targets.flatMap(p => p.matches.map(m => ({ ...m, poolId: p.id }))),
    targets,
    candidates,
    {
      neutrality: rules.neutrality,
      balance: rules.balance,
      matchesToday: load,
      reuseReferees: true,
    }
  );
  const refOfPool = (pool: Pool): Referee | undefined =>
    pool.matches.map(m => result.assignments.get(m.id)).find((r): r is Referee => !!r);

  const assignments: Array<{ poolNumber: number; referee: string; refereeId: string }> = [];
  const warnings: string[] = [];
  const matchChanges: Array<{ matchId: string; refereeId: string | null }> = [];
  const nextPools = pools.map(pool => {
    if (!targets.includes(pool)) return pool;
    const found = refOfPool(pool);
    // Poule sans match (rare) : pas de créneau, l'arbitre n'est pas choisi
    if (!found) return pool;
    const ref = referees.find(r => r.id === found.id) ?? found;
    const name = `${ref.firstName} ${ref.lastName}`.trim();
    assignments.push({ poolNumber: pool.number, referee: name, refereeId: ref.id });
    const { matches, changes } = propagatePoolReferee(pool.matches, pool.referees?.[0]?.id, ref);
    matchChanges.push(...changes);
    return { ...pool, referees: [ref], matches };
  });
  // Poules restées sans arbitre : raisons (neutralité) pour le DT ou l'agent
  const unassigned = result.shortages.flatMap(sh =>
    sh.slots
      .filter(sl => sl.kind === 'pool')
      .map(sl => ({
        poolNumber: sl.number,
        conflicts: sh.conflicts
          .filter(c => c.slot.kind === 'pool' && c.slot.number === sl.number)
          .map(c => ({
            referee: `${c.referee.firstName} ${c.referee.lastName}`.trim(),
            refereeId: c.referee.id,
            reasons: c.reasons,
          })),
      }))
  );
  for (const u of unassigned) {
    warnings.push(
      u.conflicts.length > 0
        ? `Poule ${u.poolNumber} : aucun arbitre neutre (${u.conflicts
            .map(c => `${c.referee} : ${c.reasons.join(', ')}`)
            .join(' ; ')})`
        : `Poule ${u.poolNumber} : aucun arbitre disponible`
    );
  }
  const out = { dryRun: !!options.dryRun, assignments, unassigned, warnings };
  if (options.dryRun || assignments.length === 0) return out;
  ctx.db.transaction(() => {
    for (const pool of nextPools) {
      const a = assignments.find(x => x.poolNumber === pool.number);
      if (a) ctx.db.updatePoolReferees(pool.id, [a.refereeId]);
    }
    for (const c of matchChanges) ctx.db.updateMatch(c.matchId, { refereeId: c.refereeId });
    writeSession(ctx, competitionId, { pools: nextPools });
  });
  emitSession(ctx, competitionId);
  return out;
}

/**
 * Arbitre d'une poule choisi à la main (docs/adr/0014) : il remplace l'arbitre principal
 * et passe sur les matchs de la poule. La neutralité est contrôlée et signalée sans
 * bloquer : le DT tranche. refereeId null : poule sans arbitre.
 */
export function assignPoolReferee(
  ctx: CommandContext,
  competitionId: string,
  input: { poolNumber: number; refereeId: string | null; dryRun?: boolean }
) {
  const comp = getCompetitionOrThrow(ctx, competitionId);
  const session = readSession(ctx, competitionId);
  assertSupported(comp, session);
  const pools = sessionPools(session);
  const pool = pools.find(p => p.number === input.poolNumber);
  if (!pool) throw new CommandError('pool_not_found', `Poule ${input.poolNumber} introuvable`);
  const ref =
    input.refereeId === null
      ? null
      : ctx.db.getRefereesByCompetition(competitionId).find(r => r.id === input.refereeId);
  if (ref === undefined) {
    throw new CommandError('referee_not_found', `Arbitre ${input.refereeId} introuvable`);
  }
  const conflicts = ref
    ? neutralityConflicts(
        ref,
        {
          id: pool.id,
          clubs: pool.fencers.map(f => f.club),
          nationalities: pool.fencers.map(f => f.nationality),
          regions: pool.fencers.map(f => f.region),
        },
        resolveRefereeing(comp.settings?.refereeing).neutrality
      )
    : [];
  const name = ref ? `${ref.firstName} ${ref.lastName}`.trim() : null;
  const warnings = conflicts.length
    ? [`Poule ${pool.number} : ${name} n’est pas neutre (${conflicts.join(', ')})`]
    : [];
  const out = {
    dryRun: !!input.dryRun,
    poolNumber: pool.number,
    referee: name,
    conflicts,
    warnings,
  };
  if (input.dryRun) return out;
  const { matches, changes } = propagatePoolReferee(
    pool.matches,
    pool.referees?.[0]?.id,
    ref ?? undefined
  );
  const nextPools = pools.map(p =>
    p.id === pool.id ? { ...p, referees: ref ? [ref] : [], matches } : p
  );
  ctx.db.transaction(() => {
    ctx.db.updatePoolReferees(pool.id, ref ? [ref.id] : []);
    for (const c of changes) ctx.db.updateMatch(c.matchId, { refereeId: c.refereeId });
    writeSession(ctx, competitionId, { pools: nextPools });
  });
  emitSession(ctx, competitionId);
  return out;
}
