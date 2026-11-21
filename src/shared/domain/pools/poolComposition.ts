/**
 * BellePoule Modern - Poules composées par le DT (#1980, docs/adr/0017, palier « tirage »)
 * La préparation des poules (tirage, ajustements, ordre des matchs) se fait à l'écran ; au
 * lancement, la composition retenue est envoyée au moteur (generatePools). Cette fonction
 * pure en fait des poules complètes, identifiants conservés, après contrôle.
 * Licensed under GPL-3.0
 */
import { MatchStatus, type Fencer, type Match, type Pool } from '../../types';

export interface PoolCompositionInput {
  poolId: string;
  number: number;
  strip?: number | null;
  fencerIds: string[];
  /** Ordre des matchs retenu (planPoolMatches, ordre classique des rapières…) */
  matches: Array<{ matchId: string; fencerAId: string; fencerBId: string }>;
}

export type CompositionError =
  'unknown_fencer' | 'duplicate_fencer' | 'pool_too_small' | 'invalid_match' | 'duplicate_id';

export type CompositionResult =
  { ok: true; pools: Pool[] } | { ok: false; code: CompositionError; detail: string };

/**
 * Poules à partir d'une composition : tireurs connus, chacun dans une seule poule, au moins
 * deux par poule ; matchs entre deux tireurs distincts de la poule ; identifiants uniques.
 */
export function composePools(
  composition: PoolCompositionInput[],
  fencers: ReadonlyMap<string, Fencer>,
  options: { poolMaxScore: number; round: number; now: Date }
): CompositionResult {
  const seen = new Set<string>();
  const ids = new Set<string>();
  const fail = (code: CompositionError, detail: string): CompositionResult => ({
    ok: false,
    code,
    detail,
  });
  const pools: Pool[] = [];
  for (const input of composition) {
    if (input.fencerIds.length < 2) return fail('pool_too_small', `poule ${input.number}`);
    for (const id of [input.poolId, ...input.matches.map(m => m.matchId)]) {
      if (ids.has(id)) return fail('duplicate_id', id);
      ids.add(id);
    }
    const poolFencers: Fencer[] = [];
    for (const id of input.fencerIds) {
      const fencer = fencers.get(id);
      if (!fencer) return fail('unknown_fencer', id);
      if (seen.has(id)) return fail('duplicate_fencer', id);
      seen.add(id);
      poolFencers.push(fencer);
    }
    const inPool = new Map(poolFencers.map(f => [f.id, f]));
    const matches: Match[] = [];
    for (const [index, m] of input.matches.entries()) {
      const a = inPool.get(m.fencerAId);
      const b = inPool.get(m.fencerBId);
      if (!a || !b || a.id === b.id) return fail('invalid_match', m.matchId);
      matches.push({
        id: m.matchId,
        poolId: input.poolId,
        number: index + 1,
        fencerA: a,
        fencerB: b,
        scoreA: null,
        scoreB: null,
        maxScore: options.poolMaxScore,
        status: MatchStatus.NOT_STARTED,
        createdAt: options.now,
        updatedAt: options.now,
      } as Match);
    }
    pools.push({
      id: input.poolId,
      number: input.number,
      phaseId: options.round > 1 ? `phase-pools-r${options.round}` : 'phase-pools',
      fencers: poolFencers,
      matches,
      referees: [],
      ...(input.strip != null ? { strip: input.strip } : {}),
      isComplete: false,
      hasError: false,
      ranking: [],
      createdAt: options.now,
      updatedAt: options.now,
    });
  }
  return { ok: true, pools };
}

/**
 * Tireur ajouté à une poule en cours d'épreuve (#1980, docs/adr/0017) : un match contre chaque
 * tireur déjà présent, à la suite des matchs existants ; poule à nouveau incomplète.
 */
export function addFencerToPool(
  pool: Pool,
  fencer: Fencer,
  options: { maxScore: number; newId: () => string; now: Date }
): Pool {
  let nextNumber = pool.matches.reduce((max, m) => Math.max(max, m.number || 0), 0);
  const newMatches: Match[] = pool.fencers.map(existing => ({
    id: options.newId(),
    poolId: pool.id,
    number: ++nextNumber,
    fencerA: fencer,
    fencerB: existing,
    scoreA: null,
    scoreB: null,
    maxScore: options.maxScore,
    status: MatchStatus.NOT_STARTED,
    createdAt: options.now,
    updatedAt: options.now,
  }));
  return {
    ...pool,
    fencers: [...pool.fencers, fencer],
    matches: [...pool.matches, ...newMatches],
    isComplete: false,
    updatedAt: options.now,
  };
}
