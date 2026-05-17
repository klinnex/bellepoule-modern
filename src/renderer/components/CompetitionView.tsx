/**
 * BellePoule Modern - Competition View Component (Refactored)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Competition, Fencer, FencerStatus, Match, MatchStatus, Weapon, QuestPhaseConfig } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { RankingImportResult } from '../../shared/utils/fileParser';
import FencerList from './FencerList';
import PoolView from './PoolView';
import TableauView, { TableauMatch, FinalResult, propagateWinners } from './TableauView';
import PoolRankingView from './PoolRankingView';
import ResultsView from './ResultsView';
import AddFencerModal from './AddFencerModal';
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import ImportModal from './ImportModal';
import PoolPrepView from './PoolPrepView';
import RemoteScoreManager from './RemoteScoreManager';
import { useToast } from './Toast';
import { useTranslation } from '../hooks/useTranslation';
import { useCompetitionSession, Phase } from '../hooks/useCompetitionSession';
import { useFencerManagement } from '../hooks/useFencerManagement';
import { usePoolManagement } from '../hooks/usePoolManagement';
import { useExport } from '../hooks/useExport';
import { useMenuEvents } from '../hooks/useMenuEvents';
import {
  calculateOptimalPoolCount,
  distributeFencersToPoolsSerpentine,
  generatePoolMatchOrder,
  generateInitialRanking,
} from '../../shared/utils/poolCalculations';
import { FencerComparison } from './FencerComparison';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { QRCodeShare } from './QRCodeShare';
import { TouchOptimizedReferee } from './TouchOptimizedReferee';
import { PresentationMode } from './PresentationMode';
import KioskDisplay from './KioskDisplay';
import { FencerPhoto } from './FencerPhoto';
import QuestPhaseView from './QuestPhaseView';

interface CompetitionViewProps {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  requestPhase?: string;
  onPhaseApplied?: () => void;
}

const CompetitionView: React.FC<CompetitionViewProps> = ({ competition, onUpdate, requestPhase, onPhaseApplied }) => {
  const { showToast } = useToast();
  const { t, language } = useTranslation();

  // Settings avec valeurs par défaut
  const poolRounds = competition.settings?.poolRounds ?? 1;
  const hasDirectElimination = competition.settings?.hasDirectElimination ?? true;
  const thirdPlaceMatch = competition.settings?.thirdPlaceMatch ?? false;
  const poolMaxScore = competition.settings?.defaultPoolMaxScore ?? 21;
  const tableMaxScore = competition.settings?.defaultTableMaxScore ?? 0;
  const isLaserSabre = competition.weapon === Weapon.LASER;

  // États locaux
  const [currentPhase, setCurrentPhase] = useState<Phase>('checkin');

  useEffect(() => {
    if (requestPhase) {
      setCurrentPhase(requestPhase as Phase);
      onPhaseApplied?.();
    }
  }, [requestPhase]);

  const [showAddFencerModal, setShowAddFencerModal] = useState(false);
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [importData, setImportData] = useState<{
    format: string;
    filepath: string;
    content: string;
  } | null>(null);
  const [isRemoteActive, setIsRemoteActive] = useState(false);
  const [remoteArenaCount, setRemoteArenaCount] = useState<number>(1);
  const [showThirdPlaceDialog, setShowThirdPlaceDialog] = useState(false);
  const [tableauMatches, setTableauMatches] = useState<TableauMatch[]>([]);
  const [finalResults, setFinalResults] = useState<FinalResult[]>([]);
  const [showFencerComparison, setShowFencerComparison] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showKiosk, setShowKiosk] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showKioskDisplay, setShowKioskDisplay] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Paramètres de préparation des poules (persistés entre les phases)
  const [minFencersPerPool, setMinFencersPerPool] = useState<number>(5);
  const [maxFencersPerPool, setMaxFencersPerPool] = useState<number>(7);

  // Flag pour indiquer si le classement a changé (nécessite régénération du tableau)
  const [rankingChanged, setRankingChanged] = useState(false);

  // Flag pour indiquer si le classement a été validé (débloque l'onglet Tableau)
  const [rankingValidated, setRankingValidated] = useState(false);

  // Flag pour indiquer que la phase de poules est sautée (0 poules configurées)
  const [skipPoolPhase, setSkipPoolPhase] = useState(false);

  // Hooks personnalisés
  const {
    fencers,
    loadFencers,
    addFencer,
    bulkAddFencers,
    updateFencer,
    deleteFencer,
    deleteAllFencers,
    checkInAll,
    uncheckAll,
    getCheckedInFencers,
  } = useFencerManagement({ competition, onUpdate });

  const {
    pools,
    setPools,
    poolHistory,
    setPoolHistory,
    currentPoolRound,
    setCurrentPoolRound,
    overallRanking,
    setOverallRanking,
    generatePools: generatePoolsHook,
    updateScore,
    updateMatchFromRemote,
    computePoolRanking,
    computeOverallRanking,
    areAllPoolsComplete,
    handleFencerForfeit,
    handleUndoAbandon,
    syncFencersToPool,
  } = usePoolManagement({ isLaserSabre, poolMaxScore, showToast, competitionId: competition?.id });

  const { exportFencersList, exportRanking, exportResults, exportPoolsPDF } = useExport({
    competition,
    showToast,
  });

  // Synchroniser le nombre d'arènes avec le nombre de poules (seed initial uniquement)
  useEffect(() => {
    if (pools.length > 0 && remoteArenaCount === 1) setRemoteArenaCount(pools.length);
  }, [pools.length]);

  const poolPrepParams = useMemo(() => ({
    poolCount: pools.length,
    minFencersPerPool,
    maxFencersPerPool,
  }), [pools.length, minFencersPerPool, maxFencersPerPool]);

  // Session state persistence
  const { isLoaded, restoredState } = useCompetitionSession({
    competitionId: competition.id,
    currentPhase,
    currentPoolRound,
    pools,
    poolHistory,
    overallRanking,
    tableauMatches,
    finalResults,
    skipPoolPhase,
    poolPrepParams,
  });

  // Restaurer l'état au chargement
  useEffect(() => {
    if (restoredState && isLoaded) {
      const phaseMap = [
        'checkin',
        'poolprep',
        'pools',
        'ranking',
        'quest',
        'tableau',
        'results',
        'remote',
      ] as const;
      const restoredPhase = phaseMap[restoredState.currentPhase || 0];
      if (restoredPhase) setCurrentPhase(restoredPhase);
      if (['tableau', 'results', 'remote'].includes(restoredPhase)) {
        setRankingValidated(true);
      }
      if (restoredState.currentPoolRound) setCurrentPoolRound(restoredState.currentPoolRound);
      if (restoredState.pools) setPools(restoredState.pools);
      if (restoredState.poolHistory) setPoolHistory(restoredState.poolHistory || []);
      if (restoredState.overallRanking) setOverallRanking(restoredState.overallRanking);
      if (restoredState.tableauMatches) setTableauMatches(restoredState.tableauMatches);
      if (restoredState.finalResults) setFinalResults(restoredState.finalResults);
      if (restoredState.poolPrepParams) {
        setMinFencersPerPool(restoredState.poolPrepParams.minFencersPerPool);
        setMaxFencersPerPool(restoredState.poolPrepParams.maxFencersPerPool);
      }
      if (restoredState.skipPoolPhase) setSkipPoolPhase(restoredState.skipPoolPhase);
    }
  }, [restoredState, isLoaded]);

  // Fallback DB : si session state n'a pas de poules, essayer de les charger depuis la DB
  useEffect(() => {
    if (!isLoaded || pools.length > 0) return;
    let cancelled = false;
    window.electronAPI.db.getPhasesByCompetition(competition.id)
      .then(phases => {
        if (cancelled) return [];
        const poolPhase = phases.find((p: { type: string }) => p.type === 'pool');
        return poolPhase ? window.electronAPI.db.getPoolsByPhase(poolPhase.id) : [];
      })
      .then(dbPools => {
        if (!cancelled && dbPools.length > 0) setPools(dbPools);
      })
      .catch((e: unknown) => logger.warn(LogCategory.DATABASE, 'DB pool fallback failed', e instanceof Error ? e : undefined));
    return () => { cancelled = true; };
  }, [isLoaded, pools.length, competition.id]);

  // Charger les tireurs au montage
  useEffect(() => {
    loadFencers();
  }, [loadFencers]);

  // Synchroniser les photos/données tireurs dans les matches de poule à chaque mise à jour
  useEffect(() => {
    if (fencers.length > 0) {
      syncFencersToPool(fencers);
    }
  }, [fencers]);

  // Restaurer l'état actif de la saisie distante si le serveur tourne déjà (ex : retour sur l'onglet)
  useEffect(() => {
    if (!window.electronAPI?.remote) return;
    window.electronAPI.remote.getServerInfo(competition.id).then((res: any) => {
      if (res?.success && res.serverInfo) {
        setIsRemoteActive(true);
      }
    });
  }, [competition.id]);

  // Écouter les mises à jour des matches distants
  // Note: pas de garde sur currentPhase car la phase 'remote' affiche le panel de saisie distante
  // mais les mises à jour doivent quand même être appliquées aux pools
  useEffect(() => {
    if (!window.electronAPI?.onRemoteMatchFinished) return;

    const handleMatchFinished = (data: {
      matchId: string;
      scoreA: number;
      scoreB: number;
      winner?: 'A' | 'B';
      isTableau?: boolean;
    }) => {
      const { matchId, scoreA, scoreB, winner: winnerOverride } = data;
      logger.debug(
        LogCategory.UI,
        `[CompetitionView] Match terminé reçu: ${matchId} - Score: ${scoreA}-${scoreB}`
      );
      updateMatchFromRemote(matchId, scoreA, scoreB, MatchStatus.FINISHED, winnerOverride);

      // Mise à jour du tableau d'élimination directe si c'est un match DE
      setTableauMatches(prev => {
        const idx = prev.findIndex(m => m.id === matchId);
        if (idx === -1) return prev;
        const match = prev[idx];
        const winner = scoreA > scoreB ? match.fencerA : scoreB > scoreA ? match.fencerB : null;
        const updated = prev.map((m, i) => (i === idx ? { ...m, scoreA, scoreB, winner } : m));
        const size = prev.length > 0 ? Math.max(...prev.map(m => m.round)) : 0;
        propagateWinners(updated, size);
        return [...updated];
      });
    };

    window.electronAPI.onRemoteMatchFinished(handleMatchFinished);

    return () => {
      window.electronAPI.removeAllListeners?.('match:finished');
    };
  }, [updateMatchFromRemote]);

  // Sync scores/statuts des matches de poule vers la DB quand ils changent
  const prevPoolsRef = useRef(pools);
  useEffect(() => {
    if (!window.electronAPI?.db?.updateMatch || !isLoaded) return;
    const prev = prevPoolsRef.current;
    prevPoolsRef.current = pools;
    pools.forEach((pool, pIdx) => {
      pool.matches.forEach((match, mIdx) => {
        const prevMatch = prev[pIdx]?.matches[mIdx];
        if (!prevMatch) return;
        if (match.status !== prevMatch.status || match.scoreA !== prevMatch.scoreA || match.scoreB !== prevMatch.scoreB) {
          window.electronAPI!.db!.updateMatch(match.id, {
            scoreA: match.scoreA ?? undefined,
            scoreB: match.scoreB ?? undefined,
            status: match.status,
          }).catch((e: unknown) => logger.warn(LogCategory.DATABASE, 'updateMatch pool failed', e instanceof Error ? e : undefined));
        }
      });
    });
  }, [pools, isLoaded]);

  // Sync matchs tableau vers DB (batch, inclut la 3e place)
  useEffect(() => {
    if (!competition?.id || tableauMatches.length === 0) return;
    const maxScore = competition.settings?.defaultTableMaxScore ?? 15;
    window.electronAPI.db.upsertMultipleTableauMatches(
      competition.id,
      tableauMatches.map(m => ({
        matchId: m.id,
        round: m.round,
        position: m.position,
        fencerAId: m.fencerA?.id ?? null,
        fencerBId: m.fencerB?.id ?? null,
        scoreA: m.scoreA != null ? { value: m.scoreA, isVictory: m.winner?.id === m.fencerA?.id } : null,
        scoreB: m.scoreB != null ? { value: m.scoreB, isVictory: m.winner?.id === m.fencerB?.id } : null,
        status: m.winner ? 'finished' : m.isBye ? 'finished' : 'not_started',
        maxScore,
        isBye: m.isBye,
      }))
    ).catch((e: unknown) => logger.warn(LogCategory.DATABASE, 'upsertMultipleTableauMatches failed', e instanceof Error ? e : undefined));
  }, [tableauMatches, competition?.id]);

  // Menu events
  useMenuEvents({
    currentPhase,
    onShowProperties: () => setShowPropertiesModal(true),
    onShowAddFencer: () => setShowAddFencerModal(true),
    onExportFencers: format => exportFencersList(fencers, format),
    onExportFencersBpf: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: 'Exporter tireurs + photos (.bpf)',
        defaultPath: `tireurs-${competition.title}.bpf`,
        filters: [{ name: 'BellePoule Fencers', extensions: ['bpf'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await window.electronAPI.file.exportFencersArchive(competition.id, result.filePath);
        showToast(`${count} tireur${count !== 1 ? 's' : ''} exporté${count !== 1 ? 's' : ''} (.bpf)`, 'success');
      }
    },
    onExportPhotos: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: 'Exporter les photos (.zip)',
        defaultPath: `photos-${competition.title}.zip`,
        filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await window.electronAPI.file.exportPhotos(competition.id, result.filePath);
        showToast(`${count} photo${count !== 1 ? 's' : ''} exportée${count !== 1 ? 's' : ''}`, 'success');
      }
    },
    onExportRanking: format => exportRanking(overallRanking, format, isLaserSabre),
    onExportResults: format => exportResults(finalResults, format),
    onImport: async (format, filepath, content) => {
      if (format === 'fencers-bpf') {
        try {
          await window.electronAPI.file.importFencersArchive(competition.id, filepath);
          loadFencers();
        } catch (err) {
          logger.error(LogCategory.UI, 'Erreur import .bpf', err as Error);
        }
        return;
      }
      setImportData({ format, filepath, content });
    },
    onReportIssue: () => {}, // À implémenter
    onNextPhase: () => {},
    loadFencers,
    hasPools: pools.length > 0,
    overallRanking,
    finalResults,
    isLaserSabre,
  });

  // Persister les poules générées dans les tables DB (pools, pool_fencers, matches)
  const persistPoolsToDB = useCallback(async (generatedPools: typeof pools) => {
    if (!window.electronAPI?.db) return;
    try {
      const phases = await window.electronAPI.db.getPhasesByCompetition(competition.id);
      let poolPhase = phases.find(p => p.type === 'pool');
      if (!poolPhase) {
        poolPhase = await window.electronAPI.db.createPhase(competition.id, 'pool', 1, 'Poules');
      }
      await window.electronAPI.db.clearPoolsForPhase(poolPhase.id);
      for (const pool of generatedPools) {
        await window.electronAPI.db.createPool(poolPhase.id, pool.number, pool.id);
        pool.fencers.forEach((fencer, pos) => {
          window.electronAPI!.db!.addFencerToPool(pool.id, fencer.id, pos);
        });
        for (const match of pool.matches) {
          await window.electronAPI.db.createMatch(
            { id: match.id, number: match.number, fencerAId: match.fencerA?.id, fencerBId: match.fencerB?.id, maxScore: match.maxScore },
            pool.id
          );
        }
      }
    } catch (e) {
      logger.error(LogCategory.DATABASE, 'persistPoolsToDB failed', e as Error);
    }
  }, [competition.id]);

  // Handlers
  const handleCheckInFencer = (id: string) => {
    const fencer = fencers.find(f => f.id === id);
    if (fencer) {
      const newStatus =
        fencer.status === FencerStatus.CHECKED_IN
          ? FencerStatus.NOT_CHECKED_IN
          : FencerStatus.CHECKED_IN;
      updateFencer(id, { status: newStatus });
    }
  };

  const handleGeneratePools = async () => {
    const checkedIn = getCheckedInFencers();
    const newPools = generatePoolsHook(checkedIn);
    if (newPools) {
      await persistPoolsToDB(newPools);
      setCurrentPhase('poolprep');
    }
  };

  const handleExportAllPoolsPDF = () => {
    exportPoolsPDF(pools, currentPoolRound);
  };

  const handleImportFencers = async (importedFencers: Partial<Fencer>[]) => {
    await bulkAddFencers(importedFencers as any);
    setImportData(null);
  };

  const handleOpenImportDialog = async (type: 'xml' | 'fff' | 'ranking' = 'fff') => {
    const configs = {
      xml: {
        title: 'Importer un fichier XML BellePoule',
        filters: [{ name: 'XML BellePoule', extensions: ['xml', 'cotcot'] }],
      },
      fff: {
        title: 'Importer une liste FFE',
        filters: [{ name: 'Fichiers FFE', extensions: ['fff', 'csv', 'txt'] }],
      },
      ranking: {
        title: 'Importer un classement FFE',
        filters: [{ name: 'Fichier classement', extensions: ['fff', 'csv', 'txt', 'xlsx'] }],
      },
    };
    const cfg = configs[type];
    const result = await window.electronAPI.dialog.openFile({
      title: cfg.title,
      filters: [...cfg.filters, { name: 'Tous les fichiers', extensions: ['*'] }],
      properties: ['openFile'],
    });

    if (result && result.filePath) {
      const filepath = result.filePath;
      const content = result.content || '';
      const extension = filepath.split('.').pop()?.toLowerCase();

      let format: string = type;
      if (type === 'fff' && (extension === 'csv' || extension === 'txt')) {
        format = 'txt';
      }

      setImportData({ format, filepath, content });
    }
  };

  const handleImportRanking = async (result: RankingImportResult) => {
    if (!window.electronAPI?.db?.updateFencer) {
      showToast('Erreur: API non disponible', 'error');
      return;
    }

    try {
      const updatePromises = result.details
        .filter(d => d.matched && d.fencerId)
        .map(d =>
          window.electronAPI!.db!.updateFencer!(d.fencerId!, { ranking: d.ranking }).catch(err =>
            logger.error(LogCategory.UI, `Failed to update ranking for fencer ${d.fencerId}`, err as Error)
          )
        );
      await Promise.allSettled(updatePromises);

      onUpdate({
        ...competition,
        fencers: (competition.fencers || []).map(f => {
          const detail = result.details.find(d => d.fencerId === f.id);
          return detail?.matched ? { ...f, ranking: detail.ranking, updatedAt: new Date() } : f;
        }),
      });

      showToast(
        `Classement importé: ${result.updated} tireur(s) mis à jour`,
        result.errors.length > 0 ? 'warning' : 'success'
      );
      setImportData(null);
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to import ranking', error as Error);
      showToast("Erreur lors de l'import du classement", 'error');
    }
  };

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
    const ranking = computeOverallRanking(pools);
    setOverallRanking(ranking);
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

  const handleGoToTableau = () => {
    setRankingValidated(true);
    // Ne pas recalculer : overallRanking est déjà à jour
    // (calculé à l'entrée dans handleGoToRanking, mis à jour par onRankingChange si édité manuellement)

    // Si le classement a changé, réinitialiser les matches du tableau
    if (rankingChanged) {
      setTableauMatches([]);
      setRankingChanged(false);
      showToast("Le classement a changé. Le tableau d'élimination va être régénéré.", 'warning');
    }

    setShowThirdPlaceDialog(true);
  };

  const handleThirdPlaceDecision = (shouldHaveThirdPlace: boolean) => {
    const updatedCompetition = {
      ...competition,
      settings: {
        ...competition.settings,
        thirdPlaceMatch: shouldHaveThirdPlace,
      },
    };

    if (window.electronAPI) {
      window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
    }

    onUpdate(updatedCompetition);
    setTableauMatches([]);
    setCurrentPhase('tableau');
    setShowThirdPlaceDialog(false);
  };

  const handleNextPoolRound = () => {
    const checkedIn = getCheckedInFencers();
    const ranking = computeOverallRanking(pools);
    const rankedFencers = ranking.map(r => r.fencer);

    const poolCount = calculateOptimalPoolCount(rankedFencers.length, 5, 7);
    const distribution = distributeFencersToPoolsSerpentine(rankedFencers, poolCount, {
      byClub: true,
      byRegion: true,
      byNation: false,
    });

    const now = new Date();
    const newPools = distribution.map((poolFencers, index) => {
      const matchOrder = generatePoolMatchOrder(poolFencers.length);
      const poolId = crypto.randomUUID();
      const matches = matchOrder.map(([a, b], matchIndex) => ({
        id: crypto.randomUUID(),
        number: matchIndex + 1,
        fencerA: poolFencers[a - 1],
        fencerB: poolFencers[b - 1],
        scoreA: null,
        scoreB: null,
        maxScore: poolMaxScore,
        status: MatchStatus.NOT_STARTED,
        poolId,
        createdAt: now,
        updatedAt: now,
      }));

      return {
        id: poolId,
        number: index + 1,
        fencers: poolFencers,
        matches,
        referees: [],
        isComplete: false,
        hasError: false,
        ranking: [],
        phaseId: `phase-pools-r${currentPoolRound + 1}`,
        createdAt: now,
        updatedAt: now,
      };
    });

    setPools(newPools);
    setCurrentPoolRound(prev => prev + 1);
  };

  const questConfig = competition.settings?.questConfig;
  const questEnabled = isLaserSabre && questConfig?.enabled === true;
  const questNoPool = questEnabled && !questConfig?.hasPreliminaryPools;

  const phaseOrder = useMemo<Phase[]>(() => {
    if (!questEnabled) return ['checkin', 'poolprep', 'pools', 'ranking', 'tableau', 'results'];
    if (questConfig?.hasPreliminaryPools)
      return ['checkin', 'poolprep', 'pools', 'quest', 'ranking', 'tableau', 'results'];
    return ['checkin', 'quest', 'ranking', 'tableau', 'results'];
  }, [questEnabled, questConfig?.hasPreliminaryPools]);

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
  const canAdvanceFromPools = skipPoolPhase || (pools.length > 0 && areAllPoolsComplete());
  const isLastPoolRound = currentPoolRound >= poolRounds;
  const isResultsLocked = hasDirectElimination && finalResults.length === 0;
  // En mode quest-sans-poules, le tableau se débloque par la complétion de la quête (rankingValidated)
  const isTableauUnlocked = questNoPool
    ? rankingValidated
    : canAdvanceFromPools && rankingValidated;

  // Réinitialiser la validation du classement si les poules ne sont plus toutes terminées
  // (sauf en mode quest-sans-poules ou si on est déjà en phase tableau/résultats)
  useEffect(() => {
    const postPoolPhase = ['tableau', 'results', 'remote'].includes(currentPhase);
    if (!canAdvanceFromPools && !questNoPool && !postPoolPhase) {
      setRankingValidated(false);
    }
  }, [canAdvanceFromPools, questNoPool, currentPhase]);

  const phases = [
    {
      id: 'checkin',
      label: t('phases.checkin'),
      icon: '📋',
      disabled: false,
      title: undefined as string | undefined,
    },
    // Phases de poules : masquées en mode Quest sans poules préliminaires
    ...(!questEnabled || questConfig?.hasPreliminaryPools
      ? [
          {
            id: 'poolprep',
            label: t('phases.poolprep'),
            icon: '⚙️',
            disabled: false,
            title: undefined as string | undefined,
          },
          {
            id: 'pools',
            label: skipPoolPhase
              ? t('phases.pools_skip')
              : poolRounds > 1
                ? t('phases.pools_round', { current: currentPoolRound, total: poolRounds })
                : t('phases.pools'),
            icon: skipPoolPhase ? '⏭' : '🎯',
            disabled: skipPoolPhase || pools.length === 0,
            title: skipPoolPhase
              ? t('phases.pools_skip_tooltip')
              : pools.length === 0
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
            icon: '⚔️',
            disabled: false,
            title: undefined as string | undefined,
          },
        ]
      : []),
    // Classement : toujours présent (désactivé en mode quest-sans-poules jusqu'à fin de quête)
    {
      id: 'ranking',
      label: t('phases.ranking'),
      icon: '📊',
      disabled: questNoPool && !rankingValidated,
      title: questNoPool && !rankingValidated
        ? t('phases.tableau_locked_tooltip')
        : (undefined as string | undefined),
    },
    ...(hasDirectElimination
      ? [
          {
            id: 'tableau',
            label: t('phases.tableau'),
            icon: '🏆',
            disabled: !isTableauUnlocked,
            title: !isTableauUnlocked
              ? t('phases.tableau_locked_tooltip')
              : (undefined as string | undefined),
          },
        ]
      : []),
    {
      id: 'results',
      label: t('phases.results'),
      icon: '🏁',
      disabled: isResultsLocked,
      title: undefined as string | undefined,
    },
    {
      id: 'remote',
      label: `📡 ${t('phases.remote')}`,
      icon: '📡',
      disabled: false,
      title: undefined as string | undefined,
    },
  ];

  const getPoolsNextAction = () => {
    if (!canAdvanceFromPools) return null;

    if (!isLastPoolRound) {
      return {
        label: t('pools.next_round_n', { n: currentPoolRound + 1 }),
        action: handleNextPoolRound,
      };
    }

    return {
      label: t('pools.view_ranking_action'),
      action: handleGoToRanking,
    };
  };

  const poolsNextAction = getPoolsNextAction();

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '1rem',
          background: competition.color,
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.25rem' }}>
            {competition.title}
          </h1>
          <p style={{ opacity: 0.9, fontSize: '0.875rem' }}>
            {new Date(competition.date).toLocaleDateString(language === 'zh-HK' ? 'zh-HK' : language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {competition.location && ` • ${competition.location}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.2)' }}>
            {fencers.length} {t('fencer.label')}
          </span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.2)' }}>
            {getCheckedInFencers().length} {t('fencer.present_label')}
          </span>
          <button
            onClick={() => setShowFencerComparison(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ⚔️ {t('competition.comparisons')}
          </button>
          <button
            onClick={() => setShowAnalytics(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            📊 {t('competition.analytics')}
          </button>
          <button
            onClick={() => setShowQRCode(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            📱 Partager
          </button>
          {currentPhase === 'pools' && pools.length > 0 && (
            <>
              <button
                onClick={() => setShowPresentation(true)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                🖥️ Mode Présentation
              </button>
              <button
                onClick={() => setShowKiosk(true)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                📱 Mode Kiosk
              </button>
            </>
          )}
          {(pools.length > 0 || tableauMatches.length > 0) && (
            <button
              onClick={() => setShowKioskDisplay(true)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              🖥️ Kiosk Public
            </button>
          )}
          <button
            onClick={() => setShowPropertiesModal(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ⚙️ Propriétés
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="phase-nav">
        {phases.map((phase, index) => (
          <React.Fragment key={phase.id}>
            <div
              className={`phase-step ${currentPhase === phase.id ? 'phase-step-active' : ''} ${phase.disabled ? 'phase-step-disabled' : ''}`}
              onClick={() => !phase.disabled && setCurrentPhase(phase.id as Phase)}
              title={phase.title ?? (phase.disabled ? 'Section non disponible' : undefined)}
            >
              <span className="phase-step-number">{phase.icon}</span>
              <span>{phase.label}</span>
            </div>
            {index < phases.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', color: '#9CA3AF' }}>→</div>
            )}
          </React.Fragment>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {currentPhase !== 'checkin' && (
            <button className="btn btn-secondary" onClick={handleGoBack}>
              ← Retour
            </button>
          )}
          {currentPhase === 'checkin' && questEnabled && !questConfig?.hasPreliminaryPools && (
            <button
              className="btn btn-primary"
              onClick={() => setCurrentPhase('quest')}
              disabled={getCheckedInFencers().length < 2}
            >
              Tour Quest →
            </button>
          )}
          {currentPhase === 'checkin' && (!questEnabled || questConfig?.hasPreliminaryPools) && (
            <button
              className="btn btn-primary"
              onClick={handleGeneratePools}
              disabled={getCheckedInFencers().length < 4}
            >
              Générer les poules →
            </button>
          )}
          {currentPhase === 'pools' && poolsNextAction && (
            <button className="btn btn-primary" onClick={poolsNextAction.action}>
              {poolsNextAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {currentPhase === 'checkin' && (
          <FencerList
            fencers={fencers}
            competitionId={competition.id}
            onCheckIn={handleCheckInFencer}
            onAddFencer={() => setShowAddFencerModal(true)}
            onEditFencer={updateFencer}
            onDeleteFencer={deleteFencer}
            onDeleteAllFencers={deleteAllFencers}
            onCheckInAll={checkInAll}
            onUncheckAll={uncheckAll}
            onImport={(type) => handleOpenImportDialog(type)}
            onFencersImported={loadFencers}
            onSetFencerStatus={(id, status) => {
              // Si forfait, abandon ou exclusion, mettre à jour tous les matchs du tireur
              if (status === FencerStatus.FORFAIT) {
                handleFencerForfeit(id, 'forfait');
              } else if (status === FencerStatus.ABANDONED) {
                handleFencerForfeit(id, 'abandon');
              } else if (status === FencerStatus.EXCLUDED) {
                handleFencerForfeit(id, 'exclusion');
              } else if (status === FencerStatus.CHECKED_IN) {
                // Si réactivation depuis un statut spécial, restaurer les matchs affectés
                const currentFencer = fencers.find(f => f.id === id);
                const wasInSpecialStatus =
                  currentFencer?.status === FencerStatus.ABANDONED ||
                  currentFencer?.status === FencerStatus.FORFAIT ||
                  currentFencer?.status === FencerStatus.EXCLUDED;
                if (wasInSpecialStatus) {
                  handleUndoAbandon(id);
                }
              }
              updateFencer(id, { status });
            }}
          />
        )}

        {currentPhase === 'poolprep' && (
          <PoolPrepView
            fencers={getCheckedInFencers()}
            initialPools={pools.length > 0 ? pools : undefined}
            maxScore={poolMaxScore}
            minFencersPerPool={minFencersPerPool}
            maxFencersPerPool={maxFencersPerPool}
            onPoolsConfirm={confirmedPools => {
              setPools(confirmedPools);
              setSkipPoolPhase(false);
              setCurrentPhase('pools');
            }}
            onSkipPools={handleSkipToRanking}
            onSettingsChange={(min, max) => {
              setMinFencersPerPool(min);
              setMaxFencersPerPool(max);
            }}
          />
        )}

        {currentPhase === 'pools' && (
          <div className="content">
            {pools.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎯</div>
                <h2 className="empty-state-title">Pas de poules</h2>
                <p className="empty-state-description">
                  Retournez à l'appel pour générer les poules
                </p>
                <button className="btn btn-primary" onClick={() => setCurrentPhase('checkin')}>
                  Retour à l'appel
                </button>
              </div>
            ) : (
              <>
                {pools.length > 1 && (
                  <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <button className="btn btn-success" onClick={handleExportAllPoolsPDF}>
                      📄 Exporter toutes les poules en PDF
                    </button>
                  </div>
                )}
                <div
                  style={{
                    display: 'grid',
                    gap: '2rem',
                    width: '100%',
                    boxSizing: 'border-box',
                    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.max(480, 280 + (pools[0]?.fencers?.length ?? 6) * 38)}px), 1fr))`,
                  }}
                >
                  {pools.map((pool, poolIndex) => (
                    <div key={pool.id} style={{ minWidth: 0, overflow: 'auto' }}>
                      <PoolView
                        pool={pool}
                        weapon={competition.weapon}
                        competitionName={competition.title}
                        maxScore={poolMaxScore}
                        onScoreUpdate={(matchIndex, scoreA, scoreB, winner, specialStatus) =>
                          updateScore(poolIndex, matchIndex, scoreA, scoreB, winner, specialStatus)
                        }
                        onFencerStatusChange={(fencerId, status) => {
                          if (
                            status === 'abandon' ||
                            status === 'forfait' ||
                            status === 'exclusion'
                          ) {
                            handleFencerForfeit(fencerId, status);
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {currentPhase === 'ranking' && (
          <PoolRankingView
            pools={pools}
            ranking={overallRanking}
            weapon={competition.weapon}
            hasDirectElimination={hasDirectElimination}
            isInitialRanking={skipPoolPhase}
            onGoToTableau={handleGoToTableau}
            onGoToResults={() => setCurrentPhase('results')}
            onPoolsChange={(updatedPools, hasRankingChanged) => {
              setPools(updatedPools);
              if (hasRankingChanged) {
                setRankingChanged(true);
              }
            }}
            onRankingChange={ranking => setOverallRanking(ranking)}
          />
        )}

        {questEnabled && questConfig && (
          <div style={{ display: currentPhase === 'quest' ? undefined : 'none' }}>
            <QuestPhaseView
              fencers={(() => {
                const checked = getCheckedInFencers();
                if (questConfig.hasPreliminaryPools && questConfig.qualifiersCount) {
                  return overallRanking
                    .slice(0, questConfig.qualifiersCount)
                    .map(r => r.fencer)
                    .filter(Boolean);
                }
                return checked;
              })()}
              questConfig={questConfig}
              competitionWeapon={competition.weapon}
              maxScore={poolMaxScore}
              onQuestComplete={ranking => {
                if (!questConfig.hasPreliminaryPools) {
                  setOverallRanking(ranking);
                } else {
                  // Fusionner qualifiés re-classés par quest + non-qualifiés du classement poules
                  const questFencerIds = new Set(ranking.map(r => r.fencer?.id).filter(Boolean));
                  const nonQualifiers = overallRanking
                    .filter(r => !questFencerIds.has(r.fencer?.id))
                    .map((r, i) => ({ ...r, rank: ranking.length + i + 1 }));
                  setOverallRanking([...ranking, ...nonQualifiers]);
                }
                setRankingValidated(true);
                setCurrentPhase('ranking');
              }}
              onConfigUpdate={handleQuestConfigUpdate}
            />
          </div>
        )}

        {currentPhase === 'tableau' && (
          <TableauView
            ranking={overallRanking}
            matches={tableauMatches}
            onMatchesChange={setTableauMatches}
            maxScore={tableMaxScore === 0 ? 999 : tableMaxScore}
            thirdPlaceMatch={thirdPlaceMatch}
            arenaCount={remoteArenaCount}
            onComplete={results => {
              setFinalResults(results);
              setCurrentPhase('results');
            }}
            onMatchArenaChange={(matchId, oldArena, newArena) => {
              if (isRemoteActive) {
                const match = tableauMatches.find(m => m.id === matchId);
                window.electronAPI.remote.updateMatchArena(
                  competition.id,
                  matchId,
                  oldArena,
                  newArena,
                  match?.fencerA ?? null,
                  match?.fencerB ?? null
                );
              }
            }}
          />
        )}

        {currentPhase === 'results' && (
          <ResultsView
            competition={competition}
            poolRanking={overallRanking}
            finalResults={finalResults}
          />
        )}

        {currentPhase === 'remote' && (
          <RemoteScoreManager
            competition={competition}
            pools={pools}
            tableauMatches={tableauMatches}
            initialStripCount={remoteArenaCount}
            onArenaCountChange={setRemoteArenaCount}
            onStartRemote={() => setIsRemoteActive(true)}
            onStopRemote={() => setIsRemoteActive(false)}
            isRemoteActive={isRemoteActive}
          />
        )}
      </div>

      {/* Modals */}
      {showAddFencerModal && (
        <AddFencerModal
          onClose={() => setShowAddFencerModal(false)}
          onAdd={fencer => addFencer(fencer as any)}
        />
      )}

      {showPropertiesModal && (
        <CompetitionPropertiesModal
          competition={competition}
          onSave={async updates => {
            const updatedCompetition = { ...competition, ...updates };
            // Mettre à jour l'UI immédiatement avant l'écriture DB pour éviter le flash
            onUpdate(updatedCompetition);
            if (window.electronAPI) {
              await window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
            }
          }}
          onClose={() => setShowPropertiesModal(false)}
        />
      )}

      {importData && (
        <ImportModal
          format={importData.format}
          filepath={importData.filepath}
          content={importData.content}
          fencers={fencers}
          onImport={handleImportFencers}
          onImportRanking={handleImportRanking}
          onClose={() => setImportData(null)}
        />
      )}

      {showThirdPlaceDialog && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
              maxWidth: '500px',
              width: '90%',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#1f2937' }}>
              {t('competition.third_place_match_dialog')}
            </h3>
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
              <button className="btn btn-secondary" onClick={() => handleThirdPlaceDecision(false)}>
                Non
              </button>
              <button className="btn btn-primary" onClick={() => handleThirdPlaceDecision(true)}>
                Oui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nouveaux modals */}
      {showFencerComparison && (
        <FencerComparison
          fencers={fencers}
          pools={pools}
          tableauMatches={tableauMatches}
          onClose={() => setShowFencerComparison(false)}
        />
      )}

      {showAnalytics && (
        <AnalyticsDashboard
          competition={competition}
          pools={pools}
          matches={pools.flatMap(p => p.matches ?? [])}
          fencers={fencers}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showQRCode && <QRCodeShare competition={competition} onClose={() => setShowQRCode(false)} />}

      {/* Mode Présentation */}
      {showPresentation && (
        <PresentationMode
          competition={competition}
          pools={pools}
          onClose={() => setShowPresentation(false)}
        />
      )}

      {/* Mode Kiosk Public - Affichage grand écran */}
      {showKioskDisplay && (
        <KioskDisplay
          competition={competition}
          pools={pools}
          weapon={competition.weapon}
          tableauMatches={tableauMatches}
          onClose={() => setShowKioskDisplay(false)}
        />
      )}

      {/* Mode Kiosk - Interface tablette arbitre */}
      {showKiosk && pools.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: '#f3f4f6',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              position: 'sticky',
              top: '1rem',
              right: '1rem',
              float: 'right',
              zIndex: 10000,
              margin: '1rem',
            }}
          >
            <button
              onClick={() => setShowKiosk(false)}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              ✕ Quitter Mode Kiosk
            </button>
          </div>
          <div style={{ padding: '2rem' }}>
            <h2 style={{ marginBottom: '2rem', color: '#1f2937' }}>
              Mode Kiosk - Saisie des scores
            </h2>
            {pools.map((pool, poolIndex) => (
              <div
                key={pool.id}
                style={{
                  marginBottom: '3rem',
                  background: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              >
                <h3
                  style={{
                    marginBottom: '1rem',
                    color: '#374151',
                    borderBottom: '2px solid #e5e7eb',
                    paddingBottom: '0.5rem',
                  }}
                >
                  Poule {pool.number}
                </h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {pool.matches.map(
                    (match, matchIndex) =>
                      match.status !== 'finished' && (
                        <div
                          key={match.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '1rem',
                            background: match.status === 'in_progress' ? '#fef3c7' : '#f9fafb',
                            borderRadius: '8px',
                            border:
                              match.status === 'in_progress'
                                ? '2px solid #f59e0b'
                                : '1px solid #e5e7eb',
                          }}
                        >
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}
                          >
                            <FencerPhoto
                              photo={match.fencerA?.photo}
                              firstName={match.fencerA?.firstName || ''}
                              lastName={match.fencerA?.lastName || ''}
                              size="medium"
                              editable={false}
                            />
                            <span style={{ fontWeight: 'bold' }}>
                              {match.fencerA?.firstName} {match.fencerA?.lastName}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                              type="number"
                              min="0"
                              max={poolMaxScore}
                              defaultValue={match.scoreA?.value || 0}
                              style={{
                                width: '60px',
                                padding: '0.5rem',
                                fontSize: '1.25rem',
                                textAlign: 'center',
                                border: '2px solid #d1d5db',
                                borderRadius: '6px',
                              }}
                              onChange={e => {
                                const scoreA = parseInt(e.target.value) || 0;
                                const scoreB = match.scoreB?.value || 0;
                                if (scoreA >= 0 && scoreA <= poolMaxScore) {
                                  updateScore(poolIndex, matchIndex, scoreA, scoreB);
                                }
                              }}
                            />
                            <span
                              style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6b7280' }}
                            >
                              -
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={poolMaxScore}
                              defaultValue={match.scoreB?.value || 0}
                              style={{
                                width: '60px',
                                padding: '0.5rem',
                                fontSize: '1.25rem',
                                textAlign: 'center',
                                border: '2px solid #d1d5db',
                                borderRadius: '6px',
                              }}
                              onChange={e => {
                                const scoreB = parseInt(e.target.value) || 0;
                                const scoreA = match.scoreA?.value || 0;
                                if (scoreB >= 0 && scoreB <= poolMaxScore) {
                                  updateScore(poolIndex, matchIndex, scoreA, scoreB);
                                }
                              }}
                            />
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1rem',
                              flex: 1,
                              justifyContent: 'flex-end',
                            }}
                          >
                            <span style={{ fontWeight: 'bold' }}>
                              {match.fencerB?.firstName} {match.fencerB?.lastName}
                            </span>
                            <FencerPhoto
                              photo={match.fencerB?.photo}
                              firstName={match.fencerB?.firstName || ''}
                              lastName={match.fencerB?.lastName || ''}
                              size="medium"
                              editable={false}
                            />
                          </div>
                        </div>
                      )
                  )}
                </div>
              </div>
            ))}
            {areAllPoolsComplete() && (
              <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                <button
                  onClick={() => {
                    setShowKiosk(false);
                    handleGoToRanking();
                  }}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                  }}
                >
                  ✓ Tous les matchs sont terminés - Voir le classement
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CompetitionView);

