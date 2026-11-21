/**
 * BellePoule Modern - Navigation entre phases de la compétition (poules → classement → tableau,
 * tour suivant, 3e place) (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { FencerStatus } from '../../shared/types';
import type { Competition, Fencer, Pool, PoolRanking, QuestPhaseConfig } from '../../shared/types';
import { generateInitialRanking } from '../../shared/utils/poolCalculations';
import { getRoundQualifierCount, selectNextRoundFencers } from '../../shared/utils/poolRounds';
import {
  getAdvancementCount,
  getPoolRoundAdvancement,
} from '../../shared/utils/customFormulaSettings';
import type { getActiveFormula } from '../../shared/utils/customFormulaSettings';
import {
  rapieresSemifinalists,
  rapieresTableauSettings,
} from '../../shared/domain/rapieres/rapieresCalculations';
import type {
  RapieresTableauMode,
  RapieresSession,
} from '../../shared/domain/rapieres/rapieres.types';
import type {
  ConsolationBracket,
  FinalResult,
  TableauMatch,
} from '../../shared/domain/tableau/tableauTypes';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import type { Phase } from './useCompetitionSession';
import type { useFencerManagement } from './useFencerManagement';
import type { usePoolManagement } from './usePoolManagement';
import { useTranslation } from './useTranslation';
import { useBpmClient } from '../api/BpmClientContext';
import { isTableauEligible } from '../../shared/domain/fencers/fencerStatus';

type PoolManagement = ReturnType<typeof usePoolManagement>;
type Setter<T> = Dispatch<SetStateAction<T>>;
type SplitTableauStates = Record<
  string,
  { matches: TableauMatch[]; consolation: ConsolationBracket[]; results: FinalResult[] }
>;

interface UseCompetitionNavigationParams {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  setCurrentPhase: Setter<Phase>;
  fencers: Fencer[];
  updateFencers: ReturnType<typeof useFencerManagement>['updateFencers'];
  getCheckedInFencers: () => Fencer[];
  pools: Pool[];
  setPools: Setter<Pool[]>;
  overallRanking: PoolRanking[];
  setOverallRanking: Setter<PoolRanking[]>;
  computeOverallRanking: PoolManagement['computeOverallRanking'];
  nextPoolRound: PoolManagement['nextPoolRound'];
  currentPoolRound: number;
  currentAppelFencers: Fencer[];
  poolRoundQualifiers: number[] | undefined;
  customFormula: ReturnType<typeof getActiveFormula>;
  hasDirectElimination: boolean;
  thirdPlaceMatch: boolean;
  playAllPositions: boolean;
  isRapieres: boolean;
  updateRapieres: (patch: Partial<RapieresSession>) => void;
  setShowRapieresTableauDialog: Setter<boolean>;
  setPoolsLaunched: Setter<boolean>;
  setViewedPoolRound: Setter<number | null>;
  setRankingValidated: Setter<boolean>;
  setSkipPoolPhase: Setter<boolean>;
  rankingChanged: boolean;
  setRankingChanged: Setter<boolean>;
  tableauMatches: TableauMatch[];
  setTableauMatches: Setter<TableauMatch[]>;
  consolationBrackets: ConsolationBracket[];
  setConsolationBrackets: Setter<ConsolationBracket[]>;
  finalResults: FinalResult[];
  setFinalResults: Setter<FinalResult[]>;
  activeSplitGroup: string | null;
  setActiveSplitGroup: Setter<string | null>;
  splitTableauStates: SplitTableauStates;
  setSplitTableauStates: Setter<SplitTableauStates>;
  /** Sauvegarde en attente écrite avant une commande du moteur (docs/adr/0017) */
  flushSession?: () => Promise<void>;
}

/** Transitions entre phases : classement, tableau (3e place, rapières), tour de poules suivant. */
export function useCompetitionNavigation({
  competition,
  onUpdate,
  setCurrentPhase,
  fencers,
  updateFencers,
  getCheckedInFencers,
  pools,
  setPools,
  overallRanking,
  setOverallRanking,
  computeOverallRanking,
  nextPoolRound,
  currentPoolRound,
  currentAppelFencers,
  poolRoundQualifiers,
  customFormula,
  thirdPlaceMatch,
  playAllPositions,
  isRapieres,
  updateRapieres,
  setShowRapieresTableauDialog,
  setPoolsLaunched,
  setViewedPoolRound,
  setRankingValidated,
  setSkipPoolPhase,
  rankingChanged,
  setRankingChanged,
  tableauMatches,
  setTableauMatches,
  consolationBrackets,
  setConsolationBrackets,
  finalResults,
  setFinalResults,
  activeSplitGroup,
  setActiveSplitGroup,
  splitTableauStates,
  setSplitTableauStates,
  flushSession,
}: UseCompetitionNavigationParams) {
  const client = useBpmClient();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();

  const handleQuestConfigUpdate = useCallback(
    async (updates: Partial<QuestPhaseConfig>) => {
      if (!competition.settings?.questConfig) return;
      const updatedCompetition = {
        ...competition,
        settings: {
          ...competition.settings,
          questConfig: { ...competition.settings.questConfig, ...updates },
        },
      };
      onUpdate(updatedCompetition);
      await window.electronAPI?.db.updateCompetition(competition.id, updatedCompetition);
    },
    [competition, onUpdate]
  );

  const handleGoToRanking = () => {
    if (overallRanking.length === 0) {
      const ranking = computeOverallRanking(pools);
      setOverallRanking(ranking);
    }
    setCurrentPhase('ranking');
  };

  const handleSkipToRanking = () => {
    const checkedIn = getCheckedInFencers();
    const initialRanking = generateInitialRanking(checkedIn);
    setOverallRanking(initialRanking);
    setSkipPoolPhase(true);
    setPools([]);
    setRankingValidated(false);
    setCurrentPhase('ranking');
  };

  const handleGoToTableau = (splitGroup?: string) => {
    setRankingValidated(true);
    // Ne pas recalculer : overallRanking est déjà à jour

    if (splitGroup && splitGroup !== activeSplitGroup) {
      // Sauvegarder l'état du groupe courant avant de basculer
      if (activeSplitGroup) {
        setSplitTableauStates(prev => ({
          ...prev,
          [activeSplitGroup]: {
            matches: tableauMatches,
            consolation: consolationBrackets,
            results: finalResults,
          },
        }));
      }
      // Charger l'état sauvegardé du nouveau groupe (ou partir de zéro)
      const saved = splitTableauStates[splitGroup];
      setTableauMatches(saved?.matches ?? []);
      setConsolationBrackets(saved?.consolation ?? []);
      setFinalResults(saved?.results ?? []);
      setActiveSplitGroup(splitGroup);
    }

    // Tableau déjà tiré : on y retourne sans le refaire, sinon ses matchs joués seraient
    // effacés par le choix de la petite finale (#1996)
    const targetHasTableau =
      splitGroup && splitGroup !== activeSplitGroup
        ? (splitTableauStates[splitGroup]?.matches.length ?? 0) > 0
        : tableauMatches.length > 0;
    if (targetHasTableau) {
      setCurrentPhase('tableau');
      return;
    }

    // Si le classement a changé, réinitialiser les matches du tableau
    if (rankingChanged) {
      setTableauMatches([]);
      setConsolationBrackets([]);
      setRankingChanged(false);
      showToast("Le classement a changé. Le tableau d'élimination va être régénéré.", 'warning');
    }

    // Rapières : mode de tableau demandé à chaque passage au tableau (#1441)
    if (isRapieres) {
      setShowRapieresTableauDialog(true);
      return;
    }
    // Tirer toutes les places → 3ème place implicite, pas de question
    if (playAllPositions) {
      handleThirdPlaceDecision(true);
      return;
    }
    // 3ème place décidée dans la formule (#1125, #2013) : plus de question au lancement
    handleThirdPlaceDecision(thirdPlaceMatch);
  };

  /** Rapières : mode de tableau choisi dans la popup (#1441) */
  const handleRapieresTableauMode = (mode: RapieresTableauMode) => {
    if (mode === 'semis' && !rapieresSemifinalists(pools, overallRanking)) {
      showToast(t('rapieres.semis_unavailable'), 'error');
      return;
    }
    updateRapieres({ tableauMode: mode });
    setShowRapieresTableauDialog(false);
    const { thirdPlaceMatch, ...extra } = rapieresTableauSettings(mode); // toutes places (#1441)
    handleThirdPlaceDecision(thirdPlaceMatch, extra);
  };

  const handleThirdPlaceDecision = (thirdPlace: boolean, extra?: { playAllPositions: boolean }) => {
    const settings = { ...competition.settings, ...extra, thirdPlaceMatch: thirdPlace };
    const updatedCompetition = { ...competition, settings };

    if (window.electronAPI) {
      window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
    }

    onUpdate(updatedCompetition);
    setTableauMatches([]);
    setConsolationBrackets([]);
    setCurrentPhase('tableau');
  };

  // Tour suivant (#1051) : qualifiés selon le classement du tour terminé, non-qualifiés
  // éliminés, puis appel + nouveau tirage seedé sur ce classement.
  const afterRoundClosed = (nextRound: number) => {
    setPoolsLaunched(false);
    setRankingValidated(false);
    setViewedPoolRound(null);
    setCurrentPhase('checkin');
    showToast(t('pools.next_round_checkin', { n: nextRound }), 'success');
  };

  /**
   * Clôture par le moteur (closePoolRound, PoolRoundClosed au journal, docs/adr/0017) :
   * simulation pour la confirmation, puis commande ; l'écran relit tireurs et état.
   * « local » : moteur absent ou format qu'il ne pilote pas.
   */
  const closeRoundByCommand = async (): Promise<'recorded' | 'local' | 'refused'> => {
    try {
      await flushSession?.();
      const sim = await client.call('closePoolRound', {
        competitionId: competition.id,
        dryRun: true,
      });
      const ok = await confirm(
        t('pools.next_round_confirm', {
          n: sim.nextRound,
          qualified: sim.qualified,
          eliminated: sim.eliminated,
        })
      );
      if (!ok) return 'refused';
      await client.call('closePoolRound', { competitionId: competition.id });
      afterRoundClosed(sim.nextRound);
      return 'recorded';
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'internal';
      if (code === 'unavailable' || code === 'unsupported_format') return 'local';
      if (code === 'not_enough_qualifiers') {
        showToast('Il faut au moins 4 qualifiés pour un nouveau tour de poules.', 'warning');
      } else {
        showToast((e as Error).message ?? code, 'error');
      }
      return 'refused';
    }
  };

  const handleNextPoolRound = async () => {
    if ((await closeRoundByCommand()) !== 'local') return;
    const nextRound = currentPoolRound + 1;
    const qualifierCount = customFormula
      ? getAdvancementCount(
          computeOverallRanking(pools).length,
          getPoolRoundAdvancement(customFormula, currentPoolRound - 1)
        )
      : getRoundQualifierCount(poolRoundQualifiers, nextRound);
    const { qualified, eliminated } = selectNextRoundFencers(
      computeOverallRanking(pools),
      qualifierCount
    );
    if (qualified.length < 4) {
      showToast('Il faut au moins 4 qualifiés pour un nouveau tour de poules.', 'warning');
      return;
    }
    const toEliminate = eliminated.filter(f => {
      const status = fencers.find(x => x.id === f.id)?.status;
      return status !== undefined && isTableauEligible({ status });
    });
    const ok = await confirm(
      t('pools.next_round_confirm', {
        n: nextRound,
        qualified: qualified.length,
        eliminated: toEliminate.length,
      })
    );
    if (!ok) return;
    // Appel du tour terminé figé avant MAJ (consultation + export PDF par tour)
    const appelSnapshot = currentAppelFencers;
    // Non-qualifiés éliminés ; qualifiés : classement = place au tour terminé
    const updates: Record<string, Partial<Fencer>> = {};
    for (const f of toEliminate) updates[f.id] = { status: FencerStatus.ELIMINATED };
    for (const f of qualified) {
      if (fencers.find(x => x.id === f.id)?.ranking !== f.ranking) {
        updates[f.id] = { ranking: f.ranking };
      }
    }
    await updateFencers(updates);
    nextPoolRound(appelSnapshot);
    afterRoundClosed(nextRound);
  };

  return {
    handleQuestConfigUpdate,
    handleGoToRanking,
    handleSkipToRanking,
    handleGoToTableau,
    handleRapieresTableauMode,
    handleThirdPlaceDecision,
    handleNextPoolRound,
  };
}
