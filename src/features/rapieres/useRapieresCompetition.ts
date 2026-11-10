/**
 * BellePoule Modern - Tournoi des rapières : logique des vagues et migration (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FencerStatus, Gender, MatchStatus } from '../../shared/types';
import type { Fencer, Pool, PoolRanking } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from '../../renderer/components/Toast';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import type { useFencerManagement } from '../../renderer/hooks/useFencerManagement';
import { usePdfTemplateStore } from '../pdfTemplates/hooks/usePdfTemplateStore';
import { createRapieresSession } from './rapieres.types';
import type { RapieresSession, RapieresTeamInfo } from './rapieres.types';
import { waveMatchIds, waveSheetMatches } from './rapieresCalculations';
import type { RapieresTeamStats } from './RapieresRankingPanel';
import type { useRapieresSessionState } from './useRapieresSessionState';
import type { useRapieresTeams } from './useRapieresTeams';

type SessionState = ReturnType<typeof useRapieresSessionState>;

interface UseRapieresCompetitionParams {
  competitionId: string;
  competitionTitle: string;
  isRapieres: boolean;
  isLoaded: boolean;
  isRemoteActive: boolean;
  fencers: Fencer[];
  pools: Pool[];
  overallRanking: PoolRanking[];
  rapieres: RapieresSession;
  rapieresState: SessionState['rapieresState'];
  setRapieresState: SessionState['setRapieresState'];
  updateRapieres: SessionState['updateRapieres'];
  bulkAddFencers: ReturnType<typeof useFencerManagement>['bulkAddFencers'];
  rapieresFencerFields: ReturnType<typeof useRapieresTeams>['rapieresFencerFields'];
}

/** Vagues, statistiques d'équipe, migration v1 et impression des feuilles du tournoi des rapières. */
export function useRapieresCompetition({
  competitionId,
  competitionTitle,
  isRapieres,
  isLoaded,
  isRemoteActive,
  fencers,
  pools,
  overallRanking,
  rapieres,
  rapieresState,
  setRapieresState,
  updateRapieres,
  bulkAddFencers,
  rapieresFencerFields,
}: UseRapieresCompetitionParams) {
  const { showToast } = useToast();
  const { t } = useTranslation();

  // Migration de la première version (vue dédiée) : équipes recréées comme tireurs
  const rapieresMigrating = useRef(false);
  useEffect(() => {
    if (!isRapieres || !isLoaded || rapieresState?.version !== 1 || rapieresMigrating.current)
      return;
    rapieresMigrating.current = true;
    const legacy = rapieresState;
    const LEGACY_STATUS: Record<string, FencerStatus> = {
      checked_in: FencerStatus.CHECKED_IN,
      abandoned: FencerStatus.ABANDONED,
      forfait: FencerStatus.FORFAIT,
      excluded: FencerStatus.EXCLUDED,
    };
    (async () => {
      const teams: Record<string, RapieresTeamInfo> = {};
      if (fencers.length === 0 && legacy.teams.length > 0) {
        const added = await bulkAddFencers(
          legacy.teams.map(
            tm =>
              ({
                ...rapieresFencerFields({
                  name: tm.name,
                  info: { level: tm.level, fencers: tm.fencers },
                }),
                gender: Gender.MIXED,
                nationality: 'FRA',
                status: LEGACY_STATUS[tm.status ?? 'checked_in'] ?? FencerStatus.NOT_CHECKED_IN,
              }) as Omit<Fencer, 'id' | 'createdAt' | 'updatedAt'>
          )
        );
        added.forEach((f, i) => {
          teams[f.id] = { level: legacy.teams[i].level, fencers: legacy.teams[i].fencers };
        });
      }
      setRapieresState({ ...createRapieresSession(), teams });
    })().catch(error => {
      rapieresMigrating.current = false;
      logger.error(LogCategory.UI, 'Rapières : migration impossible', error as Error);
    });
  }, [isRapieres, isLoaded, rapieresState, fencers.length]);

  /** Nouvelles poules : aucune vague lancée tant qu'aucun match n'est joué */
  const resetRapieresWaves = (newPools: Pool[]) => {
    if (!isRapieres) return;
    const played = newPools.some(p => p.matches.some(m => m.status !== MatchStatus.NOT_STARTED));
    if (!played) updateRapieres({ launchedWave: 0, wavesEnded: false });
  };

  // Statistiques de poule par équipe (classements rapières)
  const rapieresStats = useMemo(
    () =>
      new Map<string, RapieresTeamStats>(
        overallRanking.map(r => [
          r.fencer.id,
          {
            victories: r.victories,
            matches: r.matchesPlayed,
            index: r.index,
            touchesGiven: r.touchesScored,
          },
        ])
      ),
    [overallRanking]
  );

  // Matchs de la vague en cours (surbrillance violette)
  const currentWaveMatchIds = useMemo(
    () =>
      isRapieres && !rapieres.wavesEnded ? waveMatchIds(pools, rapieres.launchedWave) : undefined,
    [isRapieres, pools, rapieres.launchedWave, rapieres.wavesEnded]
  );

  // Tablettes arbitre : matchs de la vague active seulement (rapières, #1118), mémorisé par le main
  useEffect(() => {
    if (!isRapieres || !competitionId) return;
    const ids = currentWaveMatchIds ? [...currentWaveMatchIds] : null;
    const api = window.electronAPI?.remote;
    api?.setActiveWave?.(competitionId, ids, !!rapieres.wavesEnded)?.catch?.(() => undefined);
  }, [isRapieres, isRemoteActive, competitionId, currentWaveMatchIds, rapieres.wavesEnded]);

  // Impression des feuilles de match d'un intervalle de vagues (#1118, plage #1441).
  // Flux continu : une feuille qui ne tient pas sur la page bascule sur la suivante.
  const printWaves = useCallback(
    async (from: number, to: number) => {
      const sheets = [];
      for (let wave = from; wave <= to; wave++) sheets.push(...waveSheetMatches(pools, wave));
      if (sheets.length === 0) {
        showToast(t('rapieres.print_wave_sheets_empty'), 'error');
        return;
      }
      const label = from === to ? `Vague ${from}` : `Vagues ${from} à ${to}`;
      try {
        const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
        const { printTableauHTML } = await import('../../shared/utils/pdfExport');
        await printTableauHTML(
          sheets,
          3,
          `${competitionTitle} — ${label}`,
          logo,
          usePdfTemplateStore.getState().templates.tableau,
          undefined,
          {
            subtitle: `Feuilles d'arbitrage — ${label}`,
            badge: 'V' + from,
            continuous: true,
            sheetsOnly: true, // sans bandeau titre ni pied de page (#1441)
          }
        );
      } catch (e) {
        showToast((e as Error).message, 'error');
      }
    },
    [pools, competitionTitle, showToast, t]
  );

  // Impression des feuilles de match de la vague active (même rendu que les feuilles du tableau) (#1118)
  const handlePrintWaveSheets = useCallback(
    () => printWaves(rapieres.launchedWave, rapieres.launchedWave),
    [printWaves, rapieres.launchedWave]
  );

  return {
    resetRapieresWaves,
    rapieresStats,
    currentWaveMatchIds,
    printWaves,
    handlePrintWaveSheets,
  };
}
