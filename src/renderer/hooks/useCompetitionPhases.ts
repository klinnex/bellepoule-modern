/**
 * BellePoule Modern - Phases d'une compétition : ordre, onglets et verrouillages (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Pool, QuestPhaseConfig } from '../../shared/types';
import type { FinalResult, TableauMatch } from '../components/tableau/tableauTypes';
import { PHASE_ICONS, TEAM_PHASE_ICONS } from '../components/competition/phaseIcons';
import { TEAM_PHASE_VIEWS, isTeamPhase } from '../components/competition/teamPhases';
import type { TeamPhase } from '../components/competition/teamPhases';
import { poolTabLock } from '../components/poolLaunchState';
import { useTranslation } from './useTranslation';
import type { Phase } from './useCompetitionSession';

interface UseCompetitionPhasesParams {
  isTeamEvent: boolean;
  currentPhase: Phase;
  setCurrentPhase: Dispatch<SetStateAction<Phase>>;
  setRankingValidated: (v: boolean) => void;
  rankingValidated: boolean;
  skipPoolPhase: boolean;
  poolsLaunched: boolean;
  pools: Pool[];
  poolHistory: Pool[][];
  areAllPoolsComplete: () => boolean;
  isRapieres: boolean;
  rapieresWavesEnded: boolean;
  currentPoolRound: number;
  poolRounds: number;
  hasDirectElimination: boolean;
  finalResults: FinalResult[];
  tableauMatches: TableauMatch[];
  questEnabled: boolean;
  questNoPool: boolean;
  questConfig: QuestPhaseConfig | undefined;
  auditLogEnabled: boolean;
  refereeFeatureEnabled: boolean;
}

/** Ordre des phases, onglets de navigation, accessibilité des étapes (poules, tableau, résultats). */
export function useCompetitionPhases({
  isTeamEvent,
  currentPhase,
  setCurrentPhase,
  setRankingValidated,
  rankingValidated,
  skipPoolPhase,
  poolsLaunched,
  pools,
  poolHistory,
  areAllPoolsComplete,
  isRapieres,
  rapieresWavesEnded,
  currentPoolRound,
  poolRounds,
  hasDirectElimination,
  finalResults,
  tableauMatches,
  questEnabled,
  questNoPool,
  questConfig,
  auditLogEnabled,
  refereeFeatureEnabled,
}: UseCompetitionPhasesParams) {
  const { t } = useTranslation();
  const phaseOrder = useMemo<Phase[]>(() => {
    if (isTeamEvent) return ['checkin', 'teams', 'teampool', 'teamtableau', 'teamranking'];
    if (!questEnabled) return ['checkin', 'poolprep', 'pools', 'ranking', 'tableau', 'results'];
    if (questConfig?.hasPreliminaryPools)
      return ['checkin', 'poolprep', 'pools', 'quest', 'ranking', 'tableau', 'results'];
    return ['checkin', 'quest', 'ranking', 'tableau', 'results'];
  }, [isTeamEvent, questEnabled, questConfig?.hasPreliminaryPools]);

  // Réinitialiser currentPhase si elle n'existe plus dans le nouveau phaseOrder
  useEffect(() => {
    if (!phaseOrder.includes(currentPhase)) {
      setCurrentPhase('checkin');
    }
  }, [phaseOrder]);

  const handleGoBack = () => {
    if (skipPoolPhase && currentPhase === 'ranking') {
      setCurrentPhase('poolprep');
      return;
    }
    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex > 0) {
      setCurrentPhase(phaseOrder[currentIndex - 1]);
    }
  };

  // Phases dynamiques
  const canAdvanceFromPools =
    skipPoolPhase ||
    (pools.length > 0 && (areAllPoolsComplete() || (isRapieres && rapieresWavesEnded)));
  const isLastPoolRound = currentPoolRound >= poolRounds;
  const isResultsLocked = hasDirectElimination && finalResults.length === 0;
  // En mode quest-sans-poules, le tableau se débloque par la complétion de la quête (rankingValidated)
  // Le tableau reste accessible en lecture seule si les résultats finaux existent déjà
  // ou si des matchs de tableau ont déjà été générés (session restaurée même sans poules chargées)
  const isTableauUnlocked =
    finalResults.length > 0 ||
    tableauMatches.length > 0 ||
    (questNoPool ? rankingValidated : canAdvanceFromPools && rankingValidated);

  // Réinitialiser la validation du classement si les poules ne sont plus toutes terminées
  // (sauf en mode quest-sans-poules ou si on est déjà en phase tableau/résultats)
  useEffect(() => {
    const postPoolPhase = ['tableau', 'results', 'remote'].includes(currentPhase);
    if (!canAdvanceFromPools && !questNoPool && !postPoolPhase) {
      setRankingValidated(false);
    }
  }, [canAdvanceFromPools, questNoPool, currentPhase]);

  const teamPhases = (Object.keys(TEAM_PHASE_VIEWS) as TeamPhase[]).map((id, i) => ({
    id,
    label: t(`phases.${id}`),
    icon: TEAM_PHASE_ICONS[i],
    disabled: false,
    title: undefined as string | undefined,
  }));

  const { prepLocked, poolsLocked } = poolTabLock({
    pools,
    poolHistory,
    skipPoolPhase,
    poolsLaunched,
  });

  const phases = [
    {
      id: 'checkin',
      label: t('phases.checkin'),
      icon: PHASE_ICONS.checkin,
      disabled: false,
      title: undefined as string | undefined,
    },
    ...(isTeamEvent ? teamPhases : []),
    // Phases de poules : masquées en mode Quest sans poules préliminaires
    ...(!questEnabled || questConfig?.hasPreliminaryPools
      ? [
          {
            id: 'poolprep',
            label: t('phases.poolprep'),
            icon: PHASE_ICONS.poolprep,
            disabled: prepLocked,
            title: prepLocked ? t('phases.poolprep_locked_tooltip') : undefined,
          },
          {
            id: 'pools',
            label: skipPoolPhase
              ? t('phases.pools_skip')
              : poolRounds > 1
                ? t('phases.pools_round', { current: currentPoolRound, total: poolRounds })
                : t('phases.pools'),
            icon: skipPoolPhase ? PHASE_ICONS.skipPools : PHASE_ICONS.pools,
            disabled: skipPoolPhase || poolsLocked,
            title: skipPoolPhase
              ? t('phases.pools_skip_tooltip')
              : poolsLocked
                ? t('phases.pools_locked_tooltip')
                : (undefined as string | undefined),
          },
        ]
      : []),
    ...(questEnabled
      ? [
          {
            id: 'quest',
            label: 'Tour Quest',
            icon: PHASE_ICONS.quest,
            disabled: false,
            title: undefined as string | undefined,
          },
        ]
      : []),
    // Classement : toujours présent (désactivé en mode quest-sans-poules jusqu'à fin de quête)
    {
      id: 'ranking',
      label: t('phases.ranking'),
      icon: PHASE_ICONS.ranking,
      disabled: questNoPool && !rankingValidated,
      title:
        questNoPool && !rankingValidated
          ? t('phases.tableau_locked_tooltip')
          : (undefined as string | undefined),
    },
    ...(hasDirectElimination
      ? [
          {
            id: 'tableau',
            label: t('phases.tableau'),
            icon: PHASE_ICONS.tableau,
            disabled: !isTableauUnlocked && finalResults.length === 0,
            title:
              !isTableauUnlocked && finalResults.length === 0
                ? t('phases.tableau_locked_tooltip')
                : (undefined as string | undefined),
          },
        ]
      : []),
    {
      id: 'results',
      label: t('phases.results'),
      icon: PHASE_ICONS.results,
      disabled: isResultsLocked,
      title: undefined as string | undefined,
    },
    ...(auditLogEnabled
      ? [
          {
            id: 'logs',
            label: t('phases.logs'),
            icon: PHASE_ICONS.logs,
            disabled: false,
            title: undefined as string | undefined,
            isSupplementary: true,
          },
        ]
      : []),
    ...(refereeFeatureEnabled
      ? [
          {
            id: 'referees',
            label: t('phases.referees') || 'Arbitres',
            icon: PHASE_ICONS.referees,
            disabled: false,
            title: undefined as string | undefined,
            isSupplementary: true,
          },
        ]
      : []),
  ].filter(
    // Équipes : les phases individuelles (poules, tableau…) laissent place aux phases équipes
    p =>
      !isTeamEvent || isTeamPhase(p.id) || ['checkin', 'remote', 'logs', 'referees'].includes(p.id)
  );

  return {
    phaseOrder,
    phases,
    handleGoBack,
    canAdvanceFromPools,
    isLastPoolRound,
  };
}
