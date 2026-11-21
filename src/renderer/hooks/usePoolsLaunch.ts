/**
 * BellePoule Modern - Lancement des poules par le moteur (#1980, docs/adr/0017, palier « tirage »)
 * La préparation reste à l'écran (tirages, ajustements, ordre des matchs) ; au lancement, la
 * composition retenue part au moteur (generatePools), qui l'écrit avec PoolsGenerated au
 * journal. L'écran relit l'état. Hors moteur : lancement local historique.
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import type { Pool } from '../../shared/types';
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
