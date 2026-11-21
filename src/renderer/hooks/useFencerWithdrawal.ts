/**
 * BellePoule Modern - Retrait et réintégration d'un tireur à l'écran (#1980, docs/adr/0016)
 * Appel, poule, tableau : withdrawFencer / reinstateFencer, règle appliquée par le moteur
 * (matchs perdus, instantané, journal). L'écran relit tireurs et session après la réponse ;
 * succès affiché seulement alors. Format que le moteur ne pilote pas : saisie locale.
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import { useBpmClient } from '../api/BpmClientContext';
import { useToast } from '../components/Toast';
import { useTranslation } from './useTranslation';
import type { RecordScoreOutcome } from '../components/tableau/tableauViewShared';

/** Pas de moteur (hors Electron) ou format laissé à l'écran (équipes, tableaux séparés) */
const LOCAL_CODES = new Set(['unavailable', 'unsupported_format']);

export type WithdrawalReason = 'abandon' | 'forfait' | 'exclusion';

export interface WithdrawInput {
  fencerId: string;
  reason: WithdrawalReason;
  blackCard?: boolean;
  matchId?: string;
}

export function useFencerWithdrawal(
  competitionId: string | undefined,
  /** Sauvegarde en attente de l'écran écrite avant la commande (rien de perdu au rechargement) */
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const fail = useCallback(
    (e: unknown, key: string): RecordScoreOutcome => {
      const code = (e as { code?: string }).code ?? 'internal';
      if (LOCAL_CODES.has(code)) return 'local';
      showToast(t(key, { message: (e as Error).message ?? code }), 'error');
      return 'refused';
    },
    [showToast, t]
  );

  const withdraw = useCallback(
    async (input: WithdrawInput): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        const res = await client.call('withdrawFencer', { competitionId, ...input });
        if (res.forfeitedMatchIds.length > 0) {
          showToast(
            t('plural.matches_not_played', {
              count: res.forfeitedMatchIds.length,
              status: input.reason,
            }),
            'success'
          );
        }
        return 'recorded';
      } catch (e) {
        return fail(e, 'fencerList.withdraw_failed');
      }
    },
    [client, competitionId, flushSession, showToast, t, fail]
  );

  const reinstate = useCallback(
    async (fencerId: string): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        await client.call('reinstateFencer', { competitionId, fencerId });
        return 'recorded';
      } catch (e) {
        return fail(e, 'fencerList.reinstate_failed');
      }
    },
    [client, competitionId, flushSession, fail]
  );

  return { withdraw, reinstate };
}
