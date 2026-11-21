/**
 * BellePoule Modern - Lancement des poules par le moteur (#1980, docs/adr/0017, palier « tirage »)
 * La préparation reste à l'écran (tirages, ajustements, ordre des matchs) ; au lancement, la
 * composition retenue part au moteur (generatePools), qui l'écrit avec PoolsGenerated au
 * journal. L'écran relit l'état. Hors moteur : lancement local historique.
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import type { Pool } from '../../shared/types';
import type { TableauMatch } from '../../shared/domain/tableau/tableauTypes';
import { tableauComposition } from '../../shared/domain/tableau/tableauComposition';
import type { RapieresTableauMode } from '../../shared/domain/rapieres/rapieres.types';
import { useBpmClient } from '../api/BpmClientContext';
import { useToast } from '../components/Toast';
import { useTranslation } from './useTranslation';
import type { RecordScoreOutcome } from '../components/tableau/tableauViewShared';

const LOCAL_CODES = new Set(['unavailable', 'unsupported_format']);

/** Composition envoyée au moteur : identifiants, pistes et ordre des matchs tels que préparés */
export function poolComposition(pools: Pool[]) {
  return pools.map(p => ({
    poolId: p.id,
    number: p.number,
    strip: p.strip ?? null,
    fencerIds: p.fencers.map(f => f.id),
    matches: p.matches
      .filter(m => m.fencerA && m.fencerB)
      .map(m => ({ matchId: m.id, fencerAId: m.fencerA!.id, fencerBId: m.fencerB!.id })),
  }));
}

export function usePoolsLaunch(
  competitionId: string | undefined,
  /** Sauvegarde en attente de l'écran écrite avant la commande */
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  return useCallback(
    async (pools: Pool[]): Promise<RecordScoreOutcome> => {
      if (!competitionId || pools.length === 0) return 'local';
      try {
        await flushSession();
        // Pertes de scores déjà confirmées par le DT (confirmScoresLoss) : remplacement admis
        await client.call('generatePools', {
          competitionId,
          composition: poolComposition(pools),
          replace: true,
        });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast(t('pools.launch_failed', { message: (e as Error).message ?? code }), 'error');
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast, t]
  );
}

/** Tireur ajouté à une poule lancée par addPoolFencer (PoolFencerAdded au journal) */
export function usePoolFencerAdd(
  competitionId: string | undefined,
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  return useCallback(
    async (poolId: string, fencerId: string): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        await client.call('addPoolFencer', { competitionId, poolId, fencerId });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast(t('addFencerPool.add_error', { msg: (e as Error).message ?? code }), 'error');
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast, t]
  );
}

/**
 * Tableau généré par l'écran (planTableau), écrit par le moteur : generateTableau avec le
 * placement complet, TableauGenerated au journal (docs/adr/0017). Le tableau se régénère à
 * l'écran quand le classement change : remplacement admis, comme avant.
 */
export function useTableauGenerate(
  competitionId: string | undefined,
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  return useCallback(
    async (
      matches: TableauMatch[],
      thirdPlaceMatch: boolean,
      rapieresTableauMode?: RapieresTableauMode
    ): Promise<RecordScoreOutcome> => {
      if (!competitionId || matches.length === 0) return 'local';
      try {
        await flushSession();
        await client.call('generateTableau', {
          competitionId,
          composition: tableauComposition(matches),
          thirdPlaceMatch,
          replace: true,
          ...(rapieresTableauMode ? { rapieresTableauMode } : {}),
        });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast(t('pools.launch_failed', { message: (e as Error).message ?? code }), 'error');
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast, t]
  );
}

/**
 * Vagues du tournoi des rapières par le moteur (launchRapieresWave, endRapieresWaves,
 * docs/adr/0017) ; « local » : moteur absent, l'écran garde l'état lui-même.
 */
export function useRapieresWaves(
  competitionId: string | undefined,
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const run = useCallback(
    async (send: () => Promise<unknown>): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        await send();
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast((e as Error).message ?? code, 'error');
        return 'refused';
      }
    },
    [competitionId, flushSession, showToast]
  );
  const launchWave = useCallback(
    (wave: number) =>
      run(() => client.call('launchRapieresWave', { competitionId: competitionId!, wave })),
    [client, competitionId, run]
  );
  const endWaves = useCallback(
    (ended: boolean) =>
      run(() => client.call('endRapieresWaves', { competitionId: competitionId!, ended })),
    [client, competitionId, run]
  );
  return { launchWave, endWaves };
}

/** Score annulé par clearScore (ScoreCleared au journal, docs/adr/0017) */
export function useScoreClear(
  competitionId: string | undefined,
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  return useCallback(
    async (matchId: string): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        await client.call('clearScore', { competitionId, matchId });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast(
          code === 'next_match_played'
            ? t('tableauView.next_played')
            : ((e as Error).message ?? code),
          'error'
        );
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast, t]
  );
}

export interface AssignmentsInput {
  pools?: Array<{ poolId: string; strip?: number | null; refereeIds?: string[] }>;
  matches?: Array<{ matchId: string; strip?: number | null; refereeId?: string | null }>;
}

/** Arbitres et pistes écrits par le moteur (assignMatches, docs/adr/0017) */
export function useAssignMatches(
  competitionId: string | undefined,
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  return useCallback(
    async (input: AssignmentsInput): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      if (!input.pools?.length && !input.matches?.length) return 'recorded';
      try {
        await flushSession();
        await client.call('assignMatches', { competitionId, ...input });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast((e as Error).message ?? code, 'error');
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast]
  );
}

/**
 * Changement d'organisation seulement (piste, arbitres) entre deux états du tableau : les
 * affectations à envoyer au moteur ; null si autre chose change (score, tireurs…).
 */
export function tableauAssignmentsDiff(
  before: TableauMatch[],
  after: TableauMatch[]
): AssignmentsInput['matches'] | null {
  if (before.length !== after.length) return null;
  const strip = (m: TableauMatch) => {
    const { arena: _a, referee: _r, referees: _rs, ...rest } = m;
    return JSON.stringify(rest);
  };
  const byId = new Map(before.map(m => [m.id, m]));
  const out: NonNullable<AssignmentsInput['matches']> = [];
  for (const m of after) {
    const old = byId.get(m.id);
    if (!old || strip(old) !== strip(m)) return null;
    const entry: NonNullable<AssignmentsInput['matches']>[number] = { matchId: m.id };
    if ((old.arena ?? null) !== (m.arena ?? null)) entry.strip = m.arena ?? null;
    if ((old.referee?.id ?? null) !== (m.referee?.id ?? null))
      entry.refereeId = m.referee?.id ?? null;
    if (entry.strip !== undefined || entry.refereeId !== undefined) out.push(entry);
  }
  return out;
}

/**
 * Commande d'épreuve générique de l'écran (docs/adr/0017) : sauvegarde en attente écrite
 * d'abord, refus affiché, « local » quand le moteur est absent ou ne pilote pas le format.
 */
export interface CompetitionCommandInputs {
  adjustRanking: {
    ranking: Array<{ fencerId: string; rank: number; questPoints?: number }>;
  };
  skipPools: { fencerIds?: string[] };
  clearTableau: Record<string, never>;
}

export function useCompetitionCommand(
  competitionId: string | undefined,
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  return useCallback(
    async <K extends keyof CompetitionCommandInputs>(
      name: K,
      input: CompetitionCommandInputs[K]
    ): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        await (client.call as (n: string, i: unknown) => Promise<unknown>)(name, {
          competitionId,
          ...input,
        });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast((e as Error).message ?? code, 'error');
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast]
  );
}
