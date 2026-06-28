/**
 * BellePoule Modern - Competition View Component (Refactored)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { Competition, Fencer, FencerStatus, Match, MatchStatus, Weapon, QuestPhaseConfig, Referee, Gender } from '../../shared/types';
import { Arena } from '../../shared/types/remote';
import { logger, LogCategory } from '@shared/services/logger';
import { NotificationService } from '../../shared/services/notificationService';
import { RankingImportResult } from '../../shared/utils/fileParser';
import FencerList from './FencerList';
import { TableauMatch, FinalResult, propagateWinners, ConsolationBracket } from './tableau/tableauTypes';
import PoolRankingView from './PoolRankingView';
import ResultsView from './ResultsView';
import AddFencerModal from './AddFencerModal';
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import ImportModal from './ImportModal';
import PoolPrepView from './PoolPrepView';
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
  filterPoolWinners,
} from '../../shared/utils/poolCalculations';
import { QRCodeShare } from './QRCodeShare';
import { TouchOptimizedReferee } from './TouchOptimizedReferee';
import KioskScoreEntry from './competition/KioskScoreEntry';
import { ScoreAuditLog } from './ScoreAuditLog';
import { RefereeManagerComponent } from './RefereeManager';
import CompetitionHeader from './competition/CompetitionHeader';
import CompetitionNav from './competition/CompetitionNav';
import GlobalPoolColumnsMenu from './pool/GlobalPoolColumnsMenu';
import WindowSizePresets from './pool/WindowSizePresets';

const PoolView = React.lazy(() => import('./PoolView'));
const TableauView = React.lazy(() => import('./TableauView'));
const RemoteScoreManager = React.lazy(() => import('./RemoteScoreManager'));
const KioskDisplay = React.lazy(() => import('./KioskDisplay'));
const FencerComparison = React.lazy(() => import('./FencerComparison').then(m => ({ default: m.FencerComparison })));
const MatchAuditLog = React.lazy(() => import('./MatchAuditLog').then(m => ({ default: m.MatchAuditLog })));
const AnalyticsDashboard = React.lazy(() => import('./AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const SeasonRankingView = React.lazy(() => import('./SeasonRankingView').then(m => ({ default: m.SeasonRankingView })));
const TeamManagerView = React.lazy(() => import('./TeamManagerView').then(m => ({ default: m.TeamManagerView })));
const FFEConnectModal = React.lazy(() => import('./FFEConnectModal'));
const PresentationMode = React.lazy(() => import('./PresentationMode').then(m => ({ default: m.PresentationMode })));
const QuestPhaseView = React.lazy(() => import('./QuestPhaseView'));

interface CompetitionViewProps {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  requestPhase?: string;
  onPhaseApplied?: () => void;
  onRemoteServerChange?: (url: string | null, arenaCount: number) => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const CV_STYLES = {
  root: { display: 'flex', flex: 1, flexDirection: 'column' as const, overflow: 'hidden' } satisfies React.CSSProperties,
  thirdPlaceOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } satisfies React.CSSProperties,
  thirdPlaceModal: { backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)', maxWidth: '500px', width: '90%' } satisfies React.CSSProperties,
  thirdPlaceTitle: { margin: '0 0 1rem 0', color: '#1f2937' } satisfies React.CSSProperties,
  thirdPlaceBtnRow: { display: 'flex', gap: '1rem', justifyContent: 'flex-end' as const, marginTop: '1.5rem' } satisfies React.CSSProperties,
  poolsExportRow: { textAlign: 'center' as const, marginBottom: '2rem' } satisfies React.CSSProperties,
  questWrapper: { display: 'none' } satisfies React.CSSProperties,
  phaseContent: { flex: 1, overflow: 'auto' as const } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const CompetitionView: React.FC<CompetitionViewProps> = ({ competition, onUpdate, requestPhase, onPhaseApplied, onRemoteServerChange }) => {
  const { showToast } = useToast();
  const { t, language } = useTranslation();

  // Settings avec valeurs par défaut
  const poolRounds = competition.settings?.poolRounds ?? 1;
  const hasDirectElimination = competition.settings?.hasDirectElimination ?? true;
  const thirdPlaceMatch = competition.settings?.thirdPlaceMatch ?? false;
  const playAllPositions = competition.settings?.playAllPositions ?? false;
  const poolMaxScore = competition.settings?.defaultPoolMaxScore ?? 21;
  const tableMaxScore = competition.settings?.defaultTableMaxScore ?? 0;
  const isLaserSabre = competition.weapon === Weapon.LASER;
  const expertMode = competition.settings?.expertMode ?? false;
  const poolWinnersOnly = competition.settings?.poolWinnersOnly ?? false;
  const postPoolSplitCriteria = competition.settings?.postPoolSplitCriteria;

  const auditLogEnabled = localStorage.getItem('bellepoule-audit-log-enabled') === 'true';

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
  const [remoteServerUrl, setRemoteServerUrl] = useState<string | null>(null);
  const [remoteArenaCount, setRemoteArenaCount] = useState<number>(1);
  useEffect(() => { onRemoteServerChange?.(remoteServerUrl, remoteArenaCount); }, [remoteServerUrl, remoteArenaCount]);
  const [arenaStates, setArenaStates] = useState<Arena[]>([]);
  const [showThirdPlaceDialog, setShowThirdPlaceDialog] = useState(false);
  const [tableauMatches, setTableauMatches] = useState<TableauMatch[]>([]);
  const [consolationBrackets, setConsolationBrackets] = useState<ConsolationBracket[]>([]);
  // Refs pour connaître la présence d'un match dans le tableau/consolante de façon synchrone
  // (mises à jour distantes : éviter le warning "Match non trouvé" côté poule pour les matchs DE)
  const tableauMatchesRef = useRef<TableauMatch[]>([]);
  const consolationBracketsRef = useRef<ConsolationBracket[]>([]);
  tableauMatchesRef.current = tableauMatches;
  consolationBracketsRef.current = consolationBrackets;
  const [finalResults, setFinalResults] = useState<FinalResult[]>([]);
  const [appelFencers, setAppelFencers] = useState<Fencer[]>([]);
  const [appelVisibleColumns, setAppelVisibleColumns] = useState<string[]>([]);
  const handleAppelStateChange = useCallback((f: Fencer[], cols: string[]) => {
    setAppelFencers(f);
    setAppelVisibleColumns(cols);
  }, []);
  const [tableauEditUnlocked, setTableauEditUnlocked] = useState(false);
  const [showFencerComparison, setShowFencerComparison] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSeasonRanking, setShowSeasonRanking] = useState(false);
  const [showTeamManager, setShowTeamManager] = useState(false);
  const [showFFEConnect, setShowFFEConnect] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showKiosk, setShowKiosk] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showKioskDisplay, setShowKioskDisplay] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [referees, setReferees] = useState<Referee[]>([]);

  // Paramètres de préparation des poules (persistés entre les phases)
  const [minFencersPerPool, setMinFencersPerPool] = useState<number>(5);
  const [maxFencersPerPool, setMaxFencersPerPool] = useState<number>(7);

  // Flag pour indiquer si le classement a changé (nécessite régénération du tableau)
  const [rankingChanged, setRankingChanged] = useState(false);

  // Flag pour indiquer si le classement a été validé (débloque l'onglet Tableau)
  const [rankingValidated, setRankingValidated] = useState(false);

  // Flag pour indiquer que la phase de poules est sautée (0 poules configurées)
  const [skipPoolPhase, setSkipPoolPhase] = useState(false);

  // Mode compétition couplée : groupe actif ('M' | 'F' | null)
  const [activeSplitGroup, setActiveSplitGroup] = useState<string | null>(null);
  // État des tableaux par groupe (pour conserver les matchs quand on bascule)
  const [splitTableauStates, setSplitTableauStates] = useState<
    Record<string, { matches: TableauMatch[]; consolation: ConsolationBracket[]; results: FinalResult[] }>
  >({});

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
    resetMatch,
    cancelMatch,
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
    consolationBrackets,
    skipPoolPhase,
    remoteArenaCount,
    poolPrepParams,
  });

  // Synchroniser le nombre d'arènes avec le nombre de poules
  useEffect(() => {
    if (!isLoaded) return;
    if (pools.length > 0) {
      if (!restoredState?.remoteArenaCount) {
        setRemoteArenaCount(pools.length);
      } else if (remoteArenaCount > pools.length) {
        // Les poules ont rétréci depuis le dernier run : clamp pour éviter des arènes fantômes.
        setRemoteArenaCount(pools.length);
      }
    }
  }, [isLoaded, pools.length, remoteArenaCount]);

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
      if (
        ['tableau', 'results', 'remote', 'ranking'].includes(restoredPhase) ||
        (restoredState.tableauMatches && restoredState.tableauMatches.length > 0)
      ) {
        setRankingValidated(true);
      }
      if (restoredState.currentPoolRound) setCurrentPoolRound(restoredState.currentPoolRound);
      if (restoredState.pools) setPools(restoredState.pools);
      if (restoredState.poolHistory) setPoolHistory(restoredState.poolHistory || []);
      if (restoredState.overallRanking) setOverallRanking(restoredState.overallRanking);
      if (restoredState.tableauMatches) setTableauMatches(restoredState.tableauMatches);
      if (restoredState.finalResults) setFinalResults(restoredState.finalResults);
      if (restoredState.consolationBrackets?.length) setConsolationBrackets(restoredState.consolationBrackets);
      if (restoredState.poolPrepParams) {
        setMinFencersPerPool(restoredState.poolPrepParams.minFencersPerPool);
        setMaxFencersPerPool(restoredState.poolPrepParams.maxFencersPerPool);
      }
      if (restoredState.skipPoolPhase) setSkipPoolPhase(restoredState.skipPoolPhase);
      if (restoredState.remoteArenaCount != null) setRemoteArenaCount(restoredState.remoteArenaCount);
    }
  }, [restoredState, isLoaded]);

  // Fallback DB : si session state n'a pas de poules, essayer de les charger depuis la DB.
  // Guard: ne pas déclencher si restoredState a déjà des poules (elles seront appliquées par
  // l'effet [restoredState, isLoaded] dans le même cycle de rendu, évitant la race condition
  // où l'IPC SQLite répond avant le prochain rendu React et écrase la session state).
  useEffect(() => {
    if (!isLoaded || pools.length > 0) return;
    if (restoredState?.pools && restoredState.pools.length > 0) return;
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
  }, [isLoaded, pools.length, competition.id, restoredState]);

  // Rétablir isRemoteActive si une session est déjà en cours (ex: rechargement après phase poules)
  useEffect(() => {
    window.electronAPI.remote.getSession(competition.id)
      .then((result: any) => {
        if (result?.success && result?.session) setIsRemoteActive(true);
      })
      .catch(() => {});
  }, [competition.id]);

  // Charger les tireurs au montage
  useEffect(() => {
    loadFencers();
  }, [loadFencers]);

  // Charger les arbitres si la fonction est activée
  useEffect(() => {
    if (!competition.settings?.refereeFeatureEnabled) return;
    window.electronAPI.db.getRefereesByCompetition(competition.id)
      .then((rows: Referee[]) => setReferees(rows))
      .catch(() => {});
  }, [competition.id, competition.settings?.refereeFeatureEnabled]);

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
        setRemoteServerUrl(res.serverInfo.url);
      }
    });
  }, [competition.id]);

  // Mettre à jour l'URL du serveur distant quand il devient actif
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote) return;
    // Petit délai pour laisser le serveur démarrer si besoin
    const timer = setTimeout(() => {
      window.electronAPI.remote.getServerInfo(competition.id).then((res: any) => {
        if (res?.success && res.serverInfo) setRemoteServerUrl(res.serverInfo.url);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [isRemoteActive, competition.id]);

  // Appliquer un score distant au bon conteneur : tableau DE, consolante, ou poule.
  // Évite le warning "Match non trouvé" côté poule pour les matchs du tableau.
  const applyRemoteScore = useCallback(
    (matchIdRaw: string, scoreARaw: number, scoreBRaw: number, finished: boolean, winnerOverride?: 'A' | 'B') => {
      const matchId = matchIdRaw;
      // Le score peut arriver sous forme d'objet Score ({ value }) ou de chaîne
      // selon le chemin (IPC tablette, sync DB). On normalise en nombre, sinon les
      // comparaisons scoreA > scoreB échouent (NaN) → aucun vainqueur, aucune
      // propagation au tour suivant.
      const toNum = (s: unknown): number =>
        typeof s === 'object' && s !== null ? Number((s as { value?: number }).value ?? 0) : Number(s ?? 0);
      const scoreA = toNum(scoreARaw);
      const scoreB = toNum(scoreBRaw);
      const status = finished ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS;
      // Le vainqueur transmis par le serveur (winnerOverride) fait foi : il gère les
      // cas d'égalité (tirage au sort) et reste correct même si le score transporté
      // est ambigu. On retombe sur la comparaison des scores en dernier recours.
      const resolveWinner = (match: TableauMatch) =>
        !finished ? (match.winner ?? null) :
        winnerOverride === 'A' ? match.fencerA :
        winnerOverride === 'B' ? match.fencerB :
        scoreA > scoreB ? match.fencerA :
        scoreB > scoreA ? match.fencerB :
        null;

      // La tablette/serveur peut renvoyer l'ID brut du match ('16-0') ou l'ID
      // composite stocké en base ('${competitionId}-16-0'). On apparie les deux
      // sens pour ne pas rater un match du tableau (sinon : pas de propagation).
      const idMatches = (m: { id: string }) =>
        m.id === matchId ||
        matchId === `${competition.id}-${m.id}` ||
        `${competition.id}-${matchId}` === m.id;

      const inTableau = tableauMatchesRef.current.some(idMatches);
      const inConsolation = consolationBracketsRef.current.some(b =>
        b.matches.some(idMatches)
      );

      // DIAGNOSTIC (visible en prod, niveau WARN) : tracer le routage du score distant.
      logger.warn(
        LogCategory.UI,
        `[applyRemoteScore] match=${matchId} score=${scoreA}-${scoreB} fini=${finished} ` +
          `→ tableau=${inTableau} consolante=${inConsolation} | ` +
          `ids tableau=[${tableauMatchesRef.current.map(m => m.id).join(',')}]`
      );

      if (inTableau) {
        setTableauMatches(prev => {
          const idx = prev.findIndex(idMatches);
          if (idx === -1) return prev;
          const updated = prev.map((m, i) =>
            i === idx ? { ...m, scoreA, scoreB, winner: resolveWinner(m) } : m
          );
          if (finished) {
            const size = prev.length > 0 ? Math.max(...prev.map(m => m.round)) : 0;
            propagateWinners(updated, size);
          }
          return [...updated];
        });
      }

      if (inConsolation) {
        setConsolationBrackets(prev =>
          prev.map(bracket => {
            const idx = bracket.matches.findIndex(idMatches);
            if (idx === -1) return bracket;
            const updated = bracket.matches.map((m, i) =>
              i === idx ? { ...m, scoreA, scoreB, winner: resolveWinner(m) } : m
            );
            if (finished) {
              const size = updated.length > 0 ? Math.max(...updated.map(m => m.round)) : 0;
              propagateWinners(updated, size);
            }
            return { ...bracket, matches: updated };
          })
        );
      }

      // Match de poule uniquement s'il n'est pas dans le tableau/consolante
      if (!inTableau && !inConsolation) {
        logger.warn(
          LogCategory.UI,
          `[applyRemoteScore] match=${matchId} routé vers POULES (non trouvé en tableau/consolante)`
        );
        updateMatchFromRemote(matchId, scoreA, scoreB, status, winnerOverride);
      }
    },
    [updateMatchFromRemote, competition.id]
  );

  // Charger les arènes quand le serveur distant devient actif et s'abonner aux updates
  useEffect(() => {
    if (!isRemoteActive || !competition?.id || !window.electronAPI?.remote) return;
    window.electronAPI.remote.getArenas(competition.id).then((res: any) => {
      if (res?.success && res.arenas) setArenaStates(res.arenas);
    }).catch(() => {});
    let unlisten: (() => void) | undefined;
    if (window.electronAPI.onRemoteArenaUpdate) {
      unlisten = window.electronAPI.onRemoteArenaUpdate((data: any) => {
        setArenaStates(prev => {
          const idx = prev.findIndex((a: Arena) => a.id === data.arenaId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            currentMatch: data.update?.match ?? updated[idx].currentMatch,
            status: data.update?.status ?? updated[idx].status,
          };
          return updated;
        });

        // NB : on ne propage PAS le score touche-par-touche vers les données du
        // match (poule/tableau). Le score n'est appliqué que lorsque l'arbitre
        // valide « match terminé » (event match:finished). Ici on ne met à jour
        // que l'affichage live de la piste (arenaStates, ci-dessus).
      });
    }
    return () => unlisten?.();
  }, [isRemoteActive, competition.id]);

  const fireWebhookNotif = useCallback((title: string, body: string) => {
    try {
      const webhookUrl = localStorage.getItem('bellepoule-webhook-url');
      if (!webhookUrl) return;
      const svc = new NotificationService({ browser: false, webhook: { url: webhookUrl }, events: { matchCompleted: true, matchStarting: false, competitionStarted: false, competitionEnded: false, fencerLate: false } });
      svc.notify({ title, body }).catch(() => {});
    } catch { /* non bloquant */ }
  }, []);

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
      const { matchId, scoreA, scoreB, winner: winnerOverride, isTableau } = data;
      logger.warn(
        LogCategory.UI,
        `[CompetitionView] match:finished REÇU matchId=${matchId} score=${scoreA}-${scoreB} tableau=${!!isTableau}`
      );
      applyRemoteScore(matchId, scoreA, scoreB, true, winnerOverride);
      fireWebhookNotif(
        `✅ Match terminé — ${competition.title}`,
        `Score : ${scoreA} – ${scoreB}${isTableau ? ' (tableau)' : ''}`
      );
    };

    const offMatchFinished = window.electronAPI.onRemoteMatchFinished(handleMatchFinished);

    // Carton noir distant : exclure le combattant fautif dans le store
    const offExcluded = window.electronAPI.onRemoteFencerExcluded?.(({ fencerId }) => {
      logger.debug(LogCategory.UI, `[CompetitionView] Combattant exclu (carton noir): ${fencerId}`);
      updateFencer(fencerId, { status: FencerStatus.EXCLUDED });
    });

    return () => {
      offMatchFinished?.();
      offExcluded?.();
    };
  }, [applyRemoteScore, updateFencer, fireWebhookNotif, competition.title]);

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
          try {
            window.electronAPI!.db!.updateMatch(match.id, {
              scoreA: match.scoreA ?? undefined,
              scoreB: match.scoreB ?? undefined,
              status: match.status,
            }).catch((e: unknown) => logger.warn(LogCategory.DATABASE, 'updateMatch pool failed', e instanceof Error ? e : undefined));
          } catch (e: unknown) {
            logger.warn(LogCategory.DATABASE, 'updateMatch pool failed', e instanceof Error ? e : undefined);
          }
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
      // Fermer l'inscription distante dès que les poules sont générées
      if (isRemoteActive && window.electronAPI?.remote?.setRegistrationEnabled) {
        window.electronAPI.remote.setRegistrationEnabled(competition.id, false).catch(() => {});
      }
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
        title: 'Importer une liste FFE (.fff, .csv, .txt)',
        filters: [{ name: 'Fichiers FFE / TXT', extensions: ['fff', 'csv', 'txt'] }],
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
          [activeSplitGroup]: { matches: tableauMatches, consolation: consolationBrackets, results: finalResults },
        }));
      }
      // Charger l'état sauvegardé du nouveau groupe (ou partir de zéro)
      const saved = splitTableauStates[splitGroup];
      setTableauMatches(saved?.matches ?? []);
      setConsolationBrackets(saved?.consolation ?? []);
      setFinalResults(saved?.results ?? []);
      setActiveSplitGroup(splitGroup);
    }

    // Si le classement a changé, réinitialiser les matches du tableau
    if (rankingChanged) {
      setTableauMatches([]);
      setConsolationBrackets([]);
      setRankingChanged(false);
      showToast("Le classement a changé. Le tableau d'élimination va être régénéré.", 'warning');
    }

    setShowThirdPlaceDialog(true);
  };

  // Basculer vers un autre groupe dans un tableau déjà ouvert
  const handleSwitchSplitGroup = (newGroup: string) => {
    if (newGroup === activeSplitGroup) return;
    // Sauvegarder l'état courant
    if (activeSplitGroup) {
      setSplitTableauStates(prev => ({
        ...prev,
        [activeSplitGroup]: { matches: tableauMatches, consolation: consolationBrackets, results: finalResults },
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
    setConsolationBrackets([]);
    setCurrentPhase('tableau');
    setShowThirdPlaceDialog(false);
  };

  const handleNextPoolRound = () => {
    const checkedIn = getCheckedInFencers();
    const ranking = computeOverallRanking(pools);
    const rankedFencers = ranking.map(r => r.fencer);

    const poolCount = calculateOptimalPoolCount(rankedFencers.length, 5, 7);
    const distribution = distributeFencersToPoolsSerpentine(rankedFencers, poolCount, ['byClub', 'byRegion']);

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

    setPoolHistory(prev => [...prev, pools]);
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

  // Synchroniser l'état d'inscription distante avec la phase courante
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote?.setRegistrationEnabled) return;
    const enabled = currentPhase === 'checkin';
    window.electronAPI.remote.setRegistrationEnabled(competition.id, enabled).catch(() => {});
  }, [currentPhase, isRemoteActive, competition.id]);

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
  // Le tableau reste accessible en lecture seule si les résultats finaux existent déjà
  // ou si des matchs de tableau ont déjà été générés (session restaurée même sans poules chargées)
  const isTableauUnlocked = finalResults.length > 0 || tableauMatches.length > 0 || (questNoPool
    ? rankingValidated
    : canAdvanceFromPools && rankingValidated);

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
            disabled: !isTableauUnlocked && finalResults.length === 0,
            title: (!isTableauUnlocked && finalResults.length === 0)
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
    ...(auditLogEnabled ? [{
      id: 'logs',
      label: t('phases.logs'),
      icon: '📜',
      disabled: false,
      title: undefined as string | undefined,
    }] : []),
    ...(competition.settings?.refereeFeatureEnabled
      ? [
          {
            id: 'referees',
            label: t('phases.referees') || 'Arbitres',
            icon: '🧑‍⚖️',
            disabled: false,
            title: undefined as string | undefined,
          },
        ]
      : []),
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

  // Confetti + menu état
  const [showConfetti, setShowConfetti] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const prevAllPoolsComplete = useRef(false);
  const prevChampion = useRef<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Détecter complétion des poules → confetti
  useEffect(() => {
    const allDone = canAdvanceFromPools && pools.length > 0;
    if (allDone && !prevAllPoolsComplete.current) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3200);
    }
    prevAllPoolsComplete.current = allDone;
  }, [canAdvanceFromPools, pools.length]);

  // Fermer le menu actions au clic extérieur
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionsMenu]);

  // Groupes disponibles pour la séparation (pour les onglets du tableau)
  const splitGroups = useMemo((): string[] => {
    if (postPoolSplitCriteria !== 'gender') return [];
    const genders = new Set<string>();
    for (const r of overallRanking) {
      if ((r.fencer.gender as string) !== Gender.MIXED) genders.add(r.fencer.gender as string);
    }
    return Array.from(genders).sort();
  }, [postPoolSplitCriteria, overallRanking]);

  // Classement effectif pour le tableau (filtré par vainqueurs de poule et/ou groupe actif)
  const effectiveTableauRanking = useMemo(() => {
    let ranking = overallRanking;
    if (poolWinnersOnly && pools.length > 0) {
      ranking = filterPoolWinners(pools, ranking);
    }
    if (postPoolSplitCriteria === 'gender' && activeSplitGroup) {
      ranking = ranking
        .filter(r => (r.fencer.gender as string) === activeSplitGroup)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }
    return ranking;
  }, [overallRanking, pools, poolWinnersOnly, postPoolSplitCriteria, activeSplitGroup]);

  // Calcul progression matchs
  const matchProgress = useMemo(() => {
    if (pools.length === 0 && tableauMatches.length === 0) return null;
    if (pools.length > 0) {
      const total = pools.reduce((s, p) => s + p.matches.length, 0);
      const done = pools.reduce((s, p) => s + p.matches.filter(m => m.status === MatchStatus.FINISHED).length, 0);
      return { done, total, label: 'poules' };
    }
    if (tableauMatches.length > 0) {
      const total = tableauMatches.filter(m => m.fencerA && m.fencerB).length;
      const done = tableauMatches.filter(m => m.winner !== null).length;
      return { done, total, label: 'tableau' };
    }
    return null;
  }, [pools, tableauMatches]);

  return (
    <div style={CV_STYLES.root}>
      <CompetitionHeader
        competition={competition}
        language={language}
        t={t}
        matchProgress={matchProgress}
        showConfetti={showConfetti}
        showActionsMenu={showActionsMenu}
        setShowActionsMenu={setShowActionsMenu}
        actionsMenuRef={actionsMenuRef}
        currentPhase={currentPhase}
        pools={pools}
        tableauMatches={tableauMatches}
        fencersCount={fencers.length}
        checkedInCount={getCheckedInFencers().length}
        setShowFencerComparison={setShowFencerComparison}
        setShowAnalytics={setShowAnalytics}
        setShowSeasonRanking={setShowSeasonRanking}
        setShowTeamManager={setShowTeamManager}
        setShowQRCode={setShowQRCode}
        setShowPresentation={setShowPresentation}
        setShowKiosk={setShowKiosk}
        setShowKioskDisplay={setShowKioskDisplay}
        setShowPropertiesModal={setShowPropertiesModal}
      />
      <CompetitionNav
        competition={competition}
        phases={phases}
        currentPhase={currentPhase}
        setCurrentPhase={setCurrentPhase}
        language={language}
        t={t}
        handleGoBack={handleGoBack}
        handleGeneratePools={handleGeneratePools}
        poolsNextAction={poolsNextAction}
        questEnabled={questEnabled}
        questConfig={questConfig}
        fencers={fencers}
        getCheckedInFencers={getCheckedInFencers}
        pools={pools}
        tableauMatches={tableauMatches}
      />

      {/* Content — keyed pour animation de transition */}
      <div key={currentPhase} className="phase-content" style={CV_STYLES.phaseContent}>
        {currentPhase === 'checkin' && (
          <FencerList
            fencers={fencers}
            competitionId={competition.id}
            onCheckIn={handleCheckInFencer}
            onAddFencer={() => setShowAddFencerModal(true)}
            registerUrl={isRemoteActive && remoteServerUrl ? `${remoteServerUrl}/register` : undefined}
            onFencersChanged={loadFencers}
            onEditFencer={updateFencer}
            onDeleteFencer={deleteFencer}
            onDeleteAllFencers={deleteAllFencers}
            onCheckInAll={checkInAll}
            onUncheckAll={uncheckAll}
            onImport={(type) => handleOpenImportDialog(type)}
            onImportFFEConnect={() => setShowFFEConnect(true)}
            onFencersImported={loadFencers}
            onAppelStateChange={handleAppelStateChange}
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
            expertMode={expertMode}
            onPoolsConfirm={confirmedPools => {
              setPools(confirmedPools);
              setSkipPoolPhase(false);
              setCurrentPhase('pools');
              confirmedPools.forEach(pool => {
                if (pool.strip != null) window.electronAPI?.db?.updatePool(pool);
              });
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '2rem',
                  }}
                >
                  <GlobalPoolColumnsMenu isLaserSabre={isLaserSabre} />
                  <WindowSizePresets />
                  {pools.length > 1 && (
                    <button className="btn btn-success" onClick={handleExportAllPoolsPDF}>
                      📄 Exporter toutes les poules en PDF
                    </button>
                  )}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gap: '2rem',
                    width: '100%',
                    boxSizing: 'border-box',
                    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.max(480, 280 + (pools[0]?.fencers?.length ?? 6) * 38)}px), 1fr))`,
                  }}
                >
                  <Suspense fallback={null}>
                  {pools.map((pool, poolIndex) => (
                    <div key={pool.id} style={{ minWidth: 0, overflow: 'auto' }}>
                      <PoolView
                        pool={pool}
                        weapon={competition.weapon}
                        competitionName={competition.title}
                        maxScore={poolMaxScore}
                        competitionId={competition.id}
                        onScoreUpdate={(matchIndex, scoreA, scoreB, winner, specialStatus) => {
                          updateScore(poolIndex, matchIndex, scoreA, scoreB, winner, specialStatus);
                          if (winner) {
                            const m = pool.matches[matchIndex];
                            const nameA = m?.fencerA ? `${m.fencerA.lastName}` : 'A';
                            const nameB = m?.fencerB ? `${m.fencerB.lastName}` : 'B';
                            fireWebhookNotif(
                              `✅ Match terminé — ${competition.title}`,
                              `${nameA} ${scoreA} – ${scoreB} ${nameB} (Poule ${pool.number})`
                            );
                          }
                          if (isRemoteActive && competition?.id) {
                            const match = pool.matches[matchIndex];
                            if (match) {
                              window.electronAPI.remote.finishPoolMatch(
                                competition.id, match.id, scoreA, scoreB
                              ).catch(() => {});
                            }
                          }
                        }}
                        onMatchReset={(matchIndex) => {
                          const match = pool.matches[matchIndex];
                          if (!match) return;
                          resetMatch(poolIndex, matchIndex);
                          if (competition?.id) {
                            window.electronAPI.remote.resetPoolMatch(competition.id, match.id).catch(() => {});
                          }
                        }}
                        onMatchCancel={(matchIndex) => {
                          const match = pool.matches[matchIndex];
                          if (!match) return;
                          cancelMatch(poolIndex, matchIndex);
                          if (competition?.id) {
                            window.electronAPI.remote.resetPoolMatch(competition.id, match.id).catch(() => {});
                          }
                        }}
                        onFencerStatusChange={(fencerId, status) => {
                          if (
                            status === 'abandon' ||
                            status === 'forfait' ||
                            status === 'exclusion'
                          ) {
                            handleFencerForfeit(fencerId, status);
                          }
                        }}
                        onFencerAdded={updatedPool => {
                          updatedPool.ranking = computePoolRanking(updatedPool);
                          setPools(prev =>
                            prev.map(p => (p.id === updatedPool.id ? updatedPool : p))
                          );
                        }}
                        arenaCount={remoteArenaCount}
                        arenas={arenaStates}
                        isRemoteActive={isRemoteActive}
                        remoteServerUrl={remoteServerUrl ?? undefined}
                        onMatchArenaChange={(matchId, oldArena, newArena, fencerA, fencerB) => {
                          if (!isRemoteActive || !competition?.id) return;
                          window.electronAPI.remote.updateMatchArena(
                            competition.id,
                            matchId,
                            oldArena,
                            newArena,
                            fencerA ?? undefined,
                            fencerB ?? undefined
                          ).catch(() => {});
                        }}
                        onRefereeAssigned={(poolId, referee) => {
                          setPools(prev => prev.map(p =>
                            p.id === poolId
                              ? { ...p, referees: referee ? [referee] : [] }
                              : p
                          ));
                        }}
                      />
                    </div>
                  ))}
                  </Suspense>
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
            poolWinnersOnly={poolWinnersOnly}
            splitCriteria={postPoolSplitCriteria}
          />
        )}

        {questEnabled && questConfig && (
          <div style={currentPhase === 'quest' ? undefined : CV_STYLES.questWrapper}>
            <Suspense fallback={null}>
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
            </Suspense>
          </div>
        )}

        {currentPhase === 'tableau' && (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Chargement tableau…</div>}>
          {/* Sélecteur de groupe pour compétition couplée */}
          {postPoolSplitCriteria && activeSplitGroup && splitGroups.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {splitGroups.map(g => (
                <button
                  key={g}
                  onClick={() => handleSwitchSplitGroup(g)}
                  style={{
                    padding: '0.375rem 0.875rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: g === activeSplitGroup ? '700' : '400',
                    background: g === activeSplitGroup ? '#2563eb' : '#e5e7eb',
                    color: g === activeSplitGroup ? 'white' : '#374151',
                    fontSize: '0.875rem',
                  }}
                >
                  {g === Gender.MALE ? '♂ Hommes' : g === Gender.FEMALE ? '♀ Femmes' : g}
                </button>
              ))}
            </div>
          )}
          {finalResults.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.625rem 1rem',
              marginBottom: '0.75rem',
              background: '#fef9c3',
              border: '1px solid #fde047',
              borderRadius: '6px',
              fontSize: '0.875rem',
              color: '#713f12',
            }}>
              <span>🔒 Tableau en lecture seule — résultats finaux générés.</span>
              <button
                onClick={() => {
                  if (window.confirm('Modifier le tableau effacera les résultats finaux. Continuer ?')) {
                    setFinalResults([]);
                  }
                }}
                style={{
                  marginLeft: 'auto',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                }}
              >
                ✏️ Modifier le tableau
              </button>
            </div>
          )}
          <TableauView
            ranking={effectiveTableauRanking}
            matches={tableauMatches}
            onMatchesChange={setTableauMatches}
            consolationBrackets={consolationBrackets}
            onConsolationBracketsChange={setConsolationBrackets}
            maxScore={tableMaxScore === 0 ? 999 : tableMaxScore}
            thirdPlaceMatch={thirdPlaceMatch}
            playAllPositions={playAllPositions}
            arenaCount={remoteArenaCount}
            readOnly={finalResults.length > 0}
            competitionId={competition.id}
            onComplete={results => {
              setFinalResults(results);
              setTableauEditUnlocked(false);
              setCurrentPhase('results');
            }}
            onMatchArenaChange={(matchId, oldArena, newArena, fencerAParam, fencerBParam) => {
              if (isRemoteActive) {
                const match = tableauMatches.find(m => m.id === matchId);
                window.electronAPI.remote.updateMatchArena(
                  competition.id,
                  matchId,
                  oldArena,
                  newArena,
                  fencerAParam ?? match?.fencerA ?? null,
                  fencerBParam ?? match?.fencerB ?? null
                );
              }
            }}
            onMatchRefereeChange={(matchId, refereeId) => {
              window.electronAPI.db.updateMatch(matchId, { refereeId: refereeId ?? undefined });
            }}
          />
          </Suspense>
        )}

        {currentPhase === 'results' && (
          <ResultsView
            competition={competition}
            poolRanking={effectiveTableauRanking}
            finalResults={finalResults}
            fencers={fencers}
            pools={[...poolHistory.flat(), ...pools]}
            tableauMatches={tableauMatches}
            consolationBrackets={consolationBrackets}
            isLaserSabre={isLaserSabre}
            appelFencers={appelFencers.length > 0 ? appelFencers : undefined}
            appelVisibleColumns={appelVisibleColumns.length > 0 ? appelVisibleColumns : undefined}
          />
        )}

        <Suspense fallback={null}>
          <RemoteScoreManager
            competition={competition}
            pools={pools}
            tableauMatches={tableauMatches}
            consolationBrackets={consolationBrackets}
            initialStripCount={remoteArenaCount}
            onArenaCountChange={setRemoteArenaCount}
            onStartRemote={() => setIsRemoteActive(true)}
            onStopRemote={() => { setIsRemoteActive(false); setArenaStates([]); }}
            isRemoteActive={isRemoteActive}
            isVisible={currentPhase === 'remote'}
          />
        </Suspense>

        {currentPhase === 'logs' && (
          <>
            <ScoreAuditLog competitionId={competition.id} />
            <Suspense fallback={null}>
              <MatchAuditLog
                competitionId={competition.id}
                competitionName={competition.title}
              />
            </Suspense>
          </>
        )}

        {currentPhase === 'referees' && competition.settings?.refereeFeatureEnabled && (
          <RefereeManagerComponent
            competition={competition}
            referees={referees}
            pools={pools}
            matches={pools.flatMap(p => p.matches ?? [])}
            onRefereesChange={setReferees}
            onAssignmentsChange={(assignments) => {
              setPools(prev => prev.map(pool => ({
                ...pool,
                matches: (pool.matches ?? []).map(m => {
                  const ref = assignments.get(m.id);
                  return ref !== undefined ? { ...m, referee: ref } : m;
                }),
              })));
            }}
          />
        )}
      </div>

      {/* Modals */}
      {showAddFencerModal && (
        <AddFencerModal
          onClose={() => setShowAddFencerModal(false)}
          onAdd={fencer => addFencer(fencer as any)}
          competitionGender={competition.gender}
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
        <div className="modal-overlay" style={CV_STYLES.thirdPlaceOverlay}>
          <div style={CV_STYLES.thirdPlaceModal}>
            <h3 style={CV_STYLES.thirdPlaceTitle}>
              {t('competition.third_place_match_dialog')}
            </h3>
            <div style={CV_STYLES.thirdPlaceBtnRow}>
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
        <Suspense fallback={null}>
          <FencerComparison
            fencers={fencers}
            pools={pools}
            tableauMatches={tableauMatches}
            onClose={() => setShowFencerComparison(false)}
          />
        </Suspense>
      )}

      {showAnalytics && (
        <Suspense fallback={null}>
          <AnalyticsDashboard
            competition={competition}
            pools={pools}
            matches={pools.flatMap(p => p.matches ?? [])}
            fencers={fencers}
            onClose={() => setShowAnalytics(false)}
          />
        </Suspense>
      )}

      {showQRCode && <QRCodeShare competition={competition} onClose={() => setShowQRCode(false)} />}

      {showSeasonRanking && (
        <Suspense fallback={null}>
          <SeasonRankingView
            onClose={() => setShowSeasonRanking(false)}
            availableCompetitions={[competition]}
            availablePoolsByComp={{ [competition.id]: pools }}
          />
        </Suspense>
      )}

      {showTeamManager && (
        <Suspense fallback={null}>
          <TeamManagerView
            competition={competition}
            fencers={fencers}
            onClose={() => setShowTeamManager(false)}
          />
        </Suspense>
      )}

      {showFFEConnect && (
        <Suspense fallback={null}>
          <FFEConnectModal
            onImport={async (imported) => { await handleImportFencers(imported); setShowFFEConnect(false); }}
            onClose={() => setShowFFEConnect(false)}
          />
        </Suspense>
      )}

      {/* Mode Présentation */}
      {showPresentation && (
        <Suspense fallback={null}>
          <PresentationMode
            competition={competition}
            pools={pools}
            onClose={() => setShowPresentation(false)}
          />
        </Suspense>
      )}

      {/* Mode Kiosk Public - Affichage grand écran */}
      {showKioskDisplay && (
        <Suspense fallback={null}>
          <KioskDisplay
            competition={competition}
            pools={pools}
            weapon={competition.weapon}
            tableauMatches={tableauMatches}
            onClose={() => setShowKioskDisplay(false)}
          />
        </Suspense>
      )}

      {/* Mode Kiosk - Interface tablette arbitre */}
      {showKiosk && pools.length > 0 && (
        <KioskScoreEntry
          pools={pools}
          poolMaxScore={poolMaxScore}
          allPoolsComplete={areAllPoolsComplete()}
          updateScore={updateScore}
          onClose={() => setShowKiosk(false)}
          onFinish={() => {
            setShowKiosk(false);
            handleGoToRanking();
          }}
        />
      )}
    </div>
  );
};

export default React.memo(CompetitionView);

