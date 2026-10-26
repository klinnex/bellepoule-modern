/**
 * BellePoule Modern - Instantané du tableau de bord et estimation de fin de phase (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { estimatePhaseEta } from '../../shared/utils/phaseEta';
import type { PhaseEtaSummary } from './routes/context';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface DashboardContext {
  readonly arenas: S['arenas'];
  readonly computePhaseEta: S['computePhaseEta'];
  readonly db: S['db'];
  readonly isTrainingMode: S['isTrainingMode'];
  readonly recentMatchDurationsMs: S['recentMatchDurationsMs'];
  readonly session: S['session'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  readonly sessionMatches: S['sessionMatches'];
}

export function buildDashboardSnapshot(ctx: DashboardContext): {
  rankings: any[];
  pools: any[];
  liveMatches: any[];
  eta?: { finishAt: string; basis: string; remainingMatches: number; perMatchMinutes: number };
} | null {
  if (!ctx.session) return null;
  if (ctx.isTrainingMode) return { rankings: [], pools: [], liveMatches: [] };
  const { competitionId } = ctx.session;

  // Classement global (depuis les poules terminées)
  let rankings: any[] = [];
  try {
    const fencers = ctx.db.getFencersByCompetition(competitionId);
    rankings = fencers
      .filter((f: any) => f.poolStats)
      .map((f: any) => {
        const stats = typeof f.poolStats === 'string' ? JSON.parse(f.poolStats) : f.poolStats;
        return {
          lastName: f.lastName,
          firstName: f.firstName,
          club: f.club || '',
          victories: stats?.victories ?? 0,
          quest: stats?.questPoints ?? stats?.touchesScored ?? 0,
        };
      })
      .sort((a: any, b: any) => b.victories - a.victories || b.quest - a.quest);
  } catch {
    /* */
  }

  // État des poules
  const pools: any[] = [];
  try {
    const matchesByPool = new Map<string, any[]>();
    for (const m of ctx.sessionMatches) {
      const pid = m.poolId || m.pool?.id;
      if (!pid) continue;
      if (!matchesByPool.has(pid)) matchesByPool.set(pid, []);
      matchesByPool.get(pid)!.push(m);
    }
    let poolNum = 1;
    for (const [pid, pMatches] of matchesByPool) {
      const isComplete = pMatches.every((m: any) => {
        const u = ctx.sessionMatchScores.get(m.id);
        return u ? u.status === 'finished' : m.status === 'finished';
      });
      pools.push({ id: pid, number: poolNum++, isComplete, ranking: [] });
    }
  } catch {
    /* */
  }

  // Matchs en direct (arènes actives)
  const liveMatches: any[] = [];
  for (const arena of ctx.arenas.values()) {
    if (arena.currentMatch && arena.status === 'in_progress') {
      const m = arena.currentMatch;
      liveMatches.push({
        number: arena.number,
        poolNumber: m.poolId || null,
        fencerA: `${m.fencerA?.lastName ?? ''} ${m.fencerA?.firstName ?? ''}`.trim(),
        fencerB: `${m.fencerB?.lastName ?? ''} ${m.fencerB?.firstName ?? ''}`.trim(),
        clubA: m.fencerA?.club || '',
        clubB: m.fencerB?.club || '',
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        winner: m.status === 'finished' ? (m.scoreA > m.scoreB ? 'A' : 'B') : null,
      });
    }
  }

  const eta = ctx.computePhaseEta();

  return { rankings, pools, liveMatches, eta };
}

/**
 * Fin estimée de la phase en cours, d'après les durées réelles des matchs (#1077).
 * Tableau : seul le tour en cours compte (les tours suivants ne sont pas encore
 * connus, sinon l'estimation reculerait à chaque match terminé). Poules : chaque
 * poule s'enchaîne sur une piste ; parallélisme = nombre de pistes de la session.
 */
export function computePhaseEta(ctx: DashboardContext): PhaseEtaSummary {
  const pending = ctx.sessionMatches.filter(m => {
    const u = ctx.sessionMatchScores.get(m.id);
    return (u ? u.status : m.status) !== 'finished';
  });
  const tableau = pending.filter(m => m.isTableau);
  let phase: PhaseEtaSummary['phase'] = 'pools';
  let round: number | null = null;
  let remaining = pending;
  let sequentialGroups: number[] | undefined;
  if (tableau.length > 0) {
    phase = 'tableau';
    // Petite finale (3) jouée avec la finale (2)
    const roundOf = (m: { round?: unknown }) => (Number(m.round) === 3 ? 2 : Number(m.round) || 0);
    round = Math.max(...tableau.map(roundOf)) || null;
    remaining = tableau.filter(m => roundOf(m) === (round ?? 0));
  } else {
    const byPool = new Map<string, number>();
    for (const m of pending) {
      const key = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
      byPool.set(key, (byPool.get(key) ?? 0) + 1);
    }
    sequentialGroups = [...byPool.values()];
  }
  const estimate = estimatePhaseEta({
    durationsMs: ctx.recentMatchDurationsMs,
    remainingMatches: remaining.length,
    sequentialGroups,
    activeArenas: ctx.session?.strips?.length || ctx.arenas.size,
    now: Date.now(),
  });
  return {
    finishAt: new Date(estimate.finishAt).toISOString(),
    basis: estimate.basis,
    remainingMatches: estimate.remainingMatches,
    perMatchMinutes: Math.round(estimate.perMatchMs / 60_000),
    phase,
    round,
  };
}
