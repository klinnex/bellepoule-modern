/**
 * BellePoule Modern - État de la vue de poule : affichage, colonnes, arbitres, annulation, ordre des matchs
 * Licensed under GPL-3.0
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStateGroup } from '../useStateGroup';
import { POOL_SCORE_INPUT_INIT, POOL_DIALOGS_INIT } from '../../components/pool/poolViewState';
import { usePoolReferees } from '../../components/pool/usePoolReferees';
import { Fencer, MatchStatus, Weapon } from '../../../shared/types';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { useColumnVisibility, POOL_COLUMNS, ColumnId } from '../useColumnVisibility';
import { usePdfTemplateStore } from '../../../features/pdfTemplates/hooks/usePdfTemplateStore';
import { useHistory } from '../useHistory';
import type { PoolViewProps, ViewMode } from '../../components/pool/poolViewTypes';
import { useTranslation } from '../useTranslation';

type Ctx = PoolViewProps;

/** État de la vue de poule : affichage, colonnes, arbitres, annulation, ordre des matchs (extrait de PoolViewComponent, #1599) */
export function usePoolViewState(ctx: Ctx) {
  const {
    pool,
    maxScore = 5,
    weapon,
    tieBreakByVictory,
    competitionName,
    competitionId,
    onScoreUpdate,
    onMatchReset,
    onMatchCancel,
    onFencerChangePool,
    onFencerStatusChange,
    onFencerAdded,
    assignedFencerIds,
    stripRange,
    onStripChange,
    arenas,
    isRemoteActive,
    remoteServerUrl,
    stripQr,
    cardScale = 1,
    onMatchArenaChange,
    onRefereeAssigned,
    maxRefereesPerPool = 1,
    autoFillReferees,
    onAutoFillReferees,
    waveMatchIds,
  } = ctx;

  const { t } = useTranslation();
  const { showToast, showUndoToast } = useToast();
  // Paires de la vague en cours, repérées par tireurs (cellules de la matrice)
  const waveHighlightPairs = useMemo(() => {
    if (!waveMatchIds?.size) return undefined;
    const pairs = new Set<string>();
    for (const m of pool.matches) {
      if (!waveMatchIds.has(m.id) || !m.fencerA || !m.fencerB) continue;
      const [a, b] = [m.fencerA.id, m.fencerB.id];
      pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
    return pairs;
  }, [waveMatchIds, pool.matches]);
  const { confirm } = useConfirm();
  const { isColumnVisible, toggleColumn, getVisibleColumns } = useColumnVisibility();
  const poolTemplate = usePdfTemplateStore(s => s.templates.pool);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  // Saisie du score regroupée (modale + cellule inline) (#1241)
  const {
    editingMatch,
    setEditingMatch,
    isMatchInverted,
    setIsMatchInverted,
    editScoreA,
    setEditScoreA,
    editScoreB,
    setEditScoreB,
    victoryA,
    setVictoryA,
    victoryB,
    setVictoryB,
    setMatchesUpdateTrigger,
    keyboardFocusField,
    setKeyboardFocusField,
    inlineEditCell,
    setInlineEditCell,
    inlineSingleScore,
    setInlineSingleScore,
    cellScoreBuffer,
    setCellScoreBuffer,
  } = useStateGroup(POOL_SCORE_INPUT_INIT);
  // Modales et statut spécial en attente de désignation (abandon/forfait/exclusion) (#1241)
  const {
    showColumnMenu,
    setShowColumnMenu,
    showPoolConfetti,
    setShowPoolConfetti,
    showAddFencerModal,
    setShowAddFencerModal,
    auditMatchId,
    setAuditMatchId,
    showFinishedLog,
    setShowFinishedLog,
    pendingSpecialStatus,
    setPendingSpecialStatus,
  } = useStateGroup(POOL_DIALOGS_INIT);
  // Options d'export PDF / impression de la feuille de poule (persistées localement)
  const { pdfHideStatColumns, setPdfHideStatColumns, pdfLandscape, setPdfLandscape } =
    useStateGroup({
      pdfHideStatColumns: localStorage.getItem('bellepoule-pool-pdf-hide-stats') === 'true',
      pdfLandscape: localStorage.getItem('bellepoule-pool-pdf-landscape') === 'true',
    });
  const togglePdfHideStatColumns = () => {
    const next = !pdfHideStatColumns;
    setPdfHideStatColumns(next);
    localStorage.setItem('bellepoule-pool-pdf-hide-stats', String(next));
  };
  const togglePdfLandscape = () => {
    const next = !pdfLandscape;
    setPdfLandscape(next);
    localStorage.setItem('bellepoule-pool-pdf-landscape', String(next));
  };

  const [signedFencerIds, setSignedFencerIds] = useState<string[]>([]);
  const [matchArenaOverrides, setMatchArenaOverrides] = useState<Map<string, number>>(new Map());
  // Désignation des arbitres de la poule (modale + affectation) (#1241)
  const {
    showRefereeModal,
    competitionReferees,
    isLoadingReferees,
    pendingRefereeIds,
    assignedReferees,
    openRefereeModal,
    closeRefereeModal,
    handleAssignReferee,
    togglePendingReferee,
    confirmPendingReferees,
  } = usePoolReferees({
    poolId: pool.id,
    initialReferees: pool.referees ?? [],
    competitionId,
    maxRefereesPerPool,
    onRefereeAssigned,
  });
  const isMultiReferee = maxRefereesPerPool > 1;
  const assignedReferee = assignedReferees[0] ?? null;
  const [hoveredFencerIds, setHoveredFencerIds] = useState<Set<string>>(new Set());
  const quickMouseScoring = localStorage.getItem('bellepoule-quick-mouse-scoring') === 'true';
  const simplifiedInputMode = localStorage.getItem('bellepoule-simplified-input-mode') === 'true';

  const defaultArena = (pool.strip != null && pool.strip > 0 ? pool.strip : pool.number) ?? 1;

  const handleMatchArenaChange = useCallback(
    (
      matchId: string,
      oldArena: number,
      newArena: number | null,
      fencerA?: Fencer | null,
      fencerB?: Fencer | null
    ) => {
      setMatchArenaOverrides(prev => {
        const next = new Map(prev);
        if (newArena === null) {
          next.delete(matchId);
        } else {
          next.set(matchId, newArena);
        }
        return next;
      });
      onMatchArenaChange?.(matchId, oldArena, newArena, fencerA, fencerB);
    },
    [onMatchArenaChange]
  );

  const { addAction, undo, redo, canUndo, canRedo } = useHistory();

  // Supprime (réinitialise) un match terminé et rend l'opération annulable via Ctrl+Z
  const handleMatchDelete = useCallback(
    (matchIndex: number) => {
      if (!onMatchReset) return;
      const match = pool.matches[matchIndex];

      if (!match || match.status !== MatchStatus.FINISHED) {
        onMatchReset(matchIndex);
        return;
      }

      const prevScoreA = match.scoreA;
      const prevScoreB = match.scoreB;
      const winner: 'A' | 'B' | undefined = prevScoreA?.isVictory
        ? 'A'
        : prevScoreB?.isVictory
          ? 'B'
          : undefined;
      const specialStatus: 'abandon' | 'forfait' | 'exclusion' | undefined =
        prevScoreA?.isAbstention || prevScoreB?.isAbstention
          ? 'abandon'
          : prevScoreA?.isForfait || prevScoreB?.isForfait
            ? 'forfait'
            : prevScoreA?.isExclusion || prevScoreB?.isExclusion
              ? 'exclusion'
              : undefined;

      const restore = () =>
        prevScoreA?.value != null &&
        prevScoreB?.value != null &&
        onScoreUpdate(matchIndex, prevScoreA.value, prevScoreB.value, winner, specialStatus);
      addAction({
        type: 'DELETE_MATCH',
        description: `Suppression score poule ${pool.number} match ${matchIndex + 1}`,
        undo: restore,
        redo: () => onMatchReset(matchIndex),
      });
      onMatchReset(matchIndex);
      showUndoToast(t('poolView.score_cleared'), restore); // annulable sans modale (#1535)
    },
    [pool, onMatchReset, onScoreUpdate, addAction, showUndoToast, t]
  );

  const prevIsComplete = useRef(pool.isComplete);

  useEffect(() => {
    if (pool.isComplete && !prevIsComplete.current) {
      setShowPoolConfetti(true);
      setTimeout(() => setShowPoolConfetti(false), 3000);
    }
    prevIsComplete.current = pool.isComplete;
  }, [pool.isComplete]);

  const isLaserSabre = weapon === Weapon.LASER;
  const tieByVictory = tieBreakByVictory ?? isLaserSabre;
  const isLocked =
    pool.fencers.length > 0 &&
    signedFencerIds.filter(id => pool.fencers.some(f => f.id === id)).length >= pool.fencers.length;
  const fencers = pool.fencers;

  const isVisible = useCallback(
    (columnId: ColumnId): boolean => {
      if (columnId === 'quest' && !isLaserSabre) return false;
      return isColumnVisible('pool', columnId, pool.id);
    },
    [isLaserSabre, isColumnVisible, pool.id]
  );

  // Filtre de colonnes modifié (colonne masquée ou option PDF) → bordure orange (#1032)
  const columnFilterEdited =
    POOL_COLUMNS.some(col => (col.id !== 'quest' || isLaserSabre) && !isVisible(col.id)) ||
    pdfHideStatColumns ||
    pdfLandscape;

  const columnMenuRef = useRef<HTMLDivElement>(null);
  const handleScoreSubmitRef = useRef<() => void>(() => {});
  // Saisie simplifiée : cases où « W+chiffre » a désigné le vainqueur d'une égalité
  const tieWinnerCellsRef = useRef<Set<string>>(new Set());
  // Égalité (armes olympiques, rapières) : minute prioritaire tirée et saisie rapide V (#1442)
  const [priorityPick, setPriorityPick] = useState<'A' | 'B' | null>(null);
  const [showTieChooser, setShowTieChooser] = useState(false);
  const [showPriorityDraw, setShowPriorityDraw] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    if (showColumnMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnMenu]);

  // Charger les signatures au montage et écouter les mises à jour en temps réel
  useEffect(() => {
    window.electronAPI.db.getPoolSignatures(pool.id).then(sigs => {
      setSignedFencerIds(sigs.map(s => s.fencerId));
    });
    const unsub = window.electronAPI.onPoolSignatureUpdated(data => {
      if (data.poolId === pool.id) {
        setSignedFencerIds(data.signedFencerIds);
      }
    });
    return unsub;
  }, [pool.id]);

  // Raccourcis clavier

  // Clé de statut stable : recalculée seulement quand un statut change réellement
  const matchesStatusKey = useMemo(() => pool.matches.map(m => m.status).join(','), [pool.matches]);

  return {
    pool,
    maxScore,
    competitionName,
    competitionId,
    onScoreUpdate,
    onMatchReset,
    onMatchCancel,
    onFencerChangePool,
    onFencerStatusChange,
    onFencerAdded,
    assignedFencerIds,
    stripRange,
    onStripChange,
    arenas,
    isRemoteActive,
    remoteServerUrl,
    stripQr,
    cardScale,
    maxRefereesPerPool,
    autoFillReferees,
    onAutoFillReferees,
    waveMatchIds,
    t,
    showToast,
    waveHighlightPairs,
    confirm,
    toggleColumn,
    getVisibleColumns,
    poolTemplate,
    viewMode,
    setViewMode,
    editingMatch,
    setEditingMatch,
    isMatchInverted,
    setIsMatchInverted,
    editScoreA,
    setEditScoreA,
    editScoreB,
    setEditScoreB,
    victoryA,
    setVictoryA,
    victoryB,
    setVictoryB,
    setMatchesUpdateTrigger,
    keyboardFocusField,
    setKeyboardFocusField,
    inlineEditCell,
    setInlineEditCell,
    inlineSingleScore,
    setInlineSingleScore,
    cellScoreBuffer,
    setCellScoreBuffer,
    showColumnMenu,
    setShowColumnMenu,
    showPoolConfetti,
    showAddFencerModal,
    setShowAddFencerModal,
    auditMatchId,
    setAuditMatchId,
    showFinishedLog,
    setShowFinishedLog,
    pendingSpecialStatus,
    setPendingSpecialStatus,
    pdfHideStatColumns,
    pdfLandscape,
    togglePdfHideStatColumns,
    togglePdfLandscape,
    signedFencerIds,
    matchArenaOverrides,
    showRefereeModal,
    competitionReferees,
    isLoadingReferees,
    pendingRefereeIds,
    assignedReferees,
    openRefereeModal,
    closeRefereeModal,
    handleAssignReferee,
    togglePendingReferee,
    confirmPendingReferees,
    isMultiReferee,
    assignedReferee,
    hoveredFencerIds,
    setHoveredFencerIds,
    quickMouseScoring,
    simplifiedInputMode,
    defaultArena,
    handleMatchArenaChange,
    addAction,
    undo,
    redo,
    canUndo,
    canRedo,
    handleMatchDelete,
    isLaserSabre,
    tieByVictory,
    isLocked,
    fencers,
    isVisible,
    columnFilterEdited,
    columnMenuRef,
    handleScoreSubmitRef,
    tieWinnerCellsRef,
    priorityPick,
    setPriorityPick,
    showTieChooser,
    setShowTieChooser,
    showPriorityDraw,
    setShowPriorityDraw,
    matchesStatusKey,
  };
}
