/**
 * BellePoule Modern - Compétition couplée : groupes du tableau et séparation en compétition
 * distincte (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Gender } from '../../shared/types';
import type { Competition, Fencer, PoolRanking } from '../../shared/types';
import type { CompetitionCreateData, FencerCreateData } from '../../shared/types/preload';
import { logger, LogCategory } from '@shared/services/logger';
import {
  buildSplitCompetitionData,
  extractSplitGroupRanking,
  remapRankingFencers,
  toSplitFencerData,
} from '../../shared/utils/splitCompetition';
import type {
  ConsolationBracket,
  FinalResult,
  TableauMatch,
} from '../components/tableau/tableauTypes';
import { useToast } from '../components/Toast';
import type { Phase } from './useCompetitionSession';

type SplitTableauStates = Record<
  string,
  { matches: TableauMatch[]; consolation: ConsolationBracket[]; results: FinalResult[] }
>;

interface UseSplitGroupsParams {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  onOpenCompetition?: (competitionId: string) => void;
  setCurrentPhase: Dispatch<SetStateAction<Phase>>;
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatch[];
  setTableauMatches: Dispatch<SetStateAction<TableauMatch[]>>;
  consolationBrackets: ConsolationBracket[];
  setConsolationBrackets: Dispatch<SetStateAction<ConsolationBracket[]>>;
  finalResults: FinalResult[];
  setFinalResults: Dispatch<SetStateAction<FinalResult[]>>;
  activeSplitGroup: string | null;
  setActiveSplitGroup: Dispatch<SetStateAction<string | null>>;
  setPendingSplitOffGroup: Dispatch<SetStateAction<string | null>>;
  splitOffInProgress: boolean;
  setSplitOffInProgress: Dispatch<SetStateAction<boolean>>;
  splitTableauStates: SplitTableauStates;
  setSplitTableauStates: Dispatch<SetStateAction<SplitTableauStates>>;
}

/** Groupes disponibles, bascule entre groupes du tableau et extraction d'un groupe. */
export function useSplitGroups({
  competition,
  onUpdate,
  onOpenCompetition,
  setCurrentPhase,
  overallRanking,
  tableauMatches,
  setTableauMatches,
  consolationBrackets,
  setConsolationBrackets,
  finalResults,
  setFinalResults,
  activeSplitGroup,
  setActiveSplitGroup,
  setPendingSplitOffGroup,
  splitOffInProgress,
  setSplitOffInProgress,
  splitTableauStates,
  setSplitTableauStates,
}: UseSplitGroupsParams) {
  const { showToast } = useToast();
  const postPoolSplitCriteria = competition.settings?.postPoolSplitCriteria;
  const splitOffCompetitionIds = competition.settings?.splitOffCompetitionIds;

  // Groupes disponibles pour la séparation (pour les onglets du tableau)
  const splitGroups = useMemo((): string[] => {
    if (postPoolSplitCriteria !== 'gender') return [];
    const genders = new Set<string>();
    for (const r of overallRanking) {
      const g = r.fencer.gender as string;
      if (g !== Gender.MIXED && !splitOffCompetitionIds?.[g]) genders.add(g);
    }
    return Array.from(genders).sort();
  }, [postPoolSplitCriteria, overallRanking, splitOffCompetitionIds]);

  // Basculer vers un autre groupe dans un tableau déjà ouvert
  const handleSwitchSplitGroup = (newGroup: string) => {
    if (newGroup === activeSplitGroup) return;
    // Sauvegarder l'état courant
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
    const saved = splitTableauStates[newGroup];
    setTableauMatches(saved?.matches ?? []);
    setConsolationBrackets(saved?.consolation ?? []);
    setFinalResults(saved?.results ?? []);
    setActiveSplitGroup(newGroup);
    // Revenir au classement si le groupe choisi n'a pas de résultats
    if (!saved?.results?.length) {
      setCurrentPhase('tableau');
    }
  };

  // Compétition couplée : extraire un groupe dans une compétition séparée (ou l'ouvrir si déjà créée)
  const handleSplitOff = (group: string) => {
    const existingId = splitOffCompetitionIds?.[group];
    if (existingId) {
      onOpenCompetition?.(existingId);
      return;
    }
    setPendingSplitOffGroup(group);
  };

  const createSplitOffCompetition = async (group: string, title: string) => {
    if (splitOffInProgress) return;
    setSplitOffInProgress(true);
    try {
      const db = window.electronAPI.db;
      const groupRanking = extractSplitGroupRanking(overallRanking, group);
      const created = await db.createCompetition(
        buildSplitCompetitionData(competition, title, group) as unknown as CompetitionCreateData
      );
      const newFencerByOldId = new Map<string, Fencer>();
      for (const r of groupRanking) {
        const f = await db.addFencer(
          created.id,
          toSplitFencerData(r) as unknown as FencerCreateData
        );
        newFencerByOldId.set(r.fencer.id, f);
      }
      // Démarrer la nouvelle compétition directement au classement après poules
      await db.saveSessionState(created.id, {
        currentPhase: 3,
        overallRanking: remapRankingFencers(groupRanking, newFencerByOldId),
        pools: [],
        poolHistory: [],
        tableauMatches: [],
        finalResults: [],
        consolationBrackets: [],
        currentPoolRound: 1,
        skipPoolPhase: false,
      } as unknown as Parameters<typeof db.saveSessionState>[1]);

      const settings = {
        ...competition.settings,
        splitOffCompetitionIds: { ...splitOffCompetitionIds, [group]: created.id },
      };
      await db.updateCompetition(competition.id, { settings });
      onUpdate({ ...competition, settings } as Competition);
      if (activeSplitGroup === group) setActiveSplitGroup(null);
      setPendingSplitOffGroup(null);
      showToast(
        `Compétition « ${created.title} » créée (${groupRanking.length} tireurs)`,
        'success'
      );
      onOpenCompetition?.(created.id);
    } catch (e) {
      logger.error(
        LogCategory.DATABASE,
        'Split-off competition creation failed',
        e instanceof Error ? e : undefined
      );
      showToast('Erreur lors de la création de la compétition séparée', 'error');
    } finally {
      setSplitOffInProgress(false);
    }
  };

  return { splitGroups, handleSwitchSplitGroup, handleSplitOff, createSplitOffCompetition };
}
