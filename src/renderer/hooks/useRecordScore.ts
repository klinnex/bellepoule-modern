/**
 * BellePoule Modern - Saisie d'un score à l'écran par la commande recordScore (#1980, ADR-0005)
 * Un fait, un chemin : écran, tablettes, appareils de piste et MCP écrivent le score par le
 * moteur (session, base et journal dans une transaction) ; l'écran relit la session
 * (session:changed). Les formats que le moteur ne pilote pas restent saisis localement.
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import { useBpmClient } from '../api/BpmClientContext';
import { useToast } from '../components/Toast';
import { useTranslation } from './useTranslation';
import type { RecordScoreOutcome } from '../components/tableau/tableauViewShared';

/** Refus qui signalent un format ou un cas laissé à la saisie locale de l'écran */
const LOCAL_CODES = new Set([
  // Hors Electron (navigateur, tests E2E sur le serveur de dev) : pas de moteur
  'unavailable',
  'unsupported_format',
  'match_not_found',
  'bracket_exists',
  'round_closed',
  'next_match_played',
  'match_not_ready',
]);

export interface ScreenScoreInput {
  matchId: string;
  scoreA: number;
  scoreB: number;
  winner?: 'A' | 'B';
  priority?: 'A' | 'B';
}

export function useRecordScore(
  competitionId: string | undefined,
  /** Sauvegarde en attente de l'écran écrite avant la commande (rien de perdu au rechargement) */
  flushSession: () => Promise<void>
) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  return useCallback(
    async (input: ScreenScoreInput): Promise<RecordScoreOutcome> => {
      if (!competitionId) return 'local';
      try {
        await flushSession();
        await client.call('recordScore', { competitionId, ...input });
        return 'recorded';
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'internal';
        if (LOCAL_CODES.has(code)) return 'local';
        showToast(
          t('scoreAudit.record_failed', { message: (e as Error).message ?? code }),
          'error'
        );
        return 'refused';
      }
    },
    [client, competitionId, flushSession, showToast, t]
  );
}
