/**
 * BellePoule Modern - État du tableau d'élimination : taille, annulation, colonnes, arbitres, connecteurs
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
export {
  TableauMatch,
  ConsolationBracket,
  propagateWinners,
} from '../../components/tableau/tableauTypes';
import { TableauMatch, ConsolationBracket } from '../../components/tableau/tableauTypes';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { useModalResize } from '../useModalResize';
import { useStateGroup } from '../useStateGroup';
import { useTableauUndo } from '../useTableauUndo';
import { useBracketZoomPan } from '../../components/tableau/useBracketZoomPan';
import { useColumnMeasures } from '../useColumnMeasures';
import {
  SCORE_EDIT_INIT,
  ASSIGN_MODALS_INIT,
  PDF_DIALOG_INIT,
} from '../../components/tableau/tableauDialogState';
// pdfExport (jsPDF) chargé à la demande ; seule la constante reste en import statique léger
import { usePdfTemplateStore } from '../../../features/pdfTemplates/hooks/usePdfTemplateStore';
import {
  BASE_MATCH_HEIGHT,
  SLOT_HEIGHT,
  calculateMatchVerticalPosition,
} from '../../components/tableau/tableauCalculations';
import { useTranslation } from '../useTranslation';
import { stripAtIndex } from '../../../shared/utils/stripRange';
import { useStripAvailability } from '../useStripAvailability';
import { TableauViewProps } from '../../components/tableau/tableauViewShared';

type Ctx = TableauViewProps;

/** État du tableau d'élimination : taille, annulation, colonnes, arbitres, connecteurs (extrait de TableauViewComponent, #1599) */
export function useTableauViewState(ctx: Ctx) {
  const {
    ranking,
    matches,
    onMatchesChange,
    maxScore = 15,
    onComplete: onCompleteProp,
    onBlackCard,
    thirdPlaceMatch = false,
    playAllPositions = false,
    arenaCount = 4,
    stripStart = 1,
    onMatchArenaChange: onMatchArenaChangeProp,
    onMatchRefereeChange: onMatchRefereeChangeProp,
    competitionId,
    consolationBrackets: consolationBracketsprop = [],
    onConsolationBracketsChange,
    readOnly = false,
    maxRefereesPerMatch = 1,
    autoFillReferees,
    tieBreakByVictory = false,
  } = ctx;

  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const tableauTemplate = usePdfTemplateStore(s => s.templates.tableau);
  const [tableauSize, setTableauSize] = useState<number>(0);

  const notifyArenaDiff = (updated: TableauMatch[]) =>
    updated.forEach(m => {
      const orig = matches.find(o => o.id === m.id);
      if (orig && orig.arena !== m.arena)
        onMatchArenaChange?.(m.id, orig.arena ?? null, m.arena ?? null);
    });
  // Annulation des placements à risque (#1301), verrouillée après transmission
  const undo = useTableauUndo({
    scopeKey: competitionId,
    onMatchesChange,
    onComplete: onCompleteProp,
    onMatchArenaChange: onMatchArenaChangeProp,
    onMatchRefereeChange: onMatchRefereeChangeProp,
  });
  const { onComplete, onMatchArenaChange, onMatchRefereeChange } = undo;
  // États de la modale de score regroupés (#1241)
  const {
    editingMatch,
    setEditingMatch,
    editingConsolationId,
    setEditingConsolationId,
    showScoreModal,
    setShowScoreModal,
    editScoreA,
    setEditScoreA,
    editScoreB,
    setEditScoreB,
    victoryA,
    setVictoryA,
    victoryB,
    setVictoryB,
  } = useStateGroup(SCORE_EDIT_INIT);
  // Vue du tableau (mode, ordre, tours repliés, zoom/pan, arbitres de compétition) regroupée (#1241)
  const {
    viewMode,
    setViewMode,
    pendingOrder,
    setPendingOrder,
    expandedRounds,
    setExpandedRounds,
    // Vue arbre : tours compactés un par un, sans effet sur les autres (#1133)
    collapsedRounds,
    setCollapsedRounds,
    competitionReferees,
    setCompetitionReferees,
    pyramidViewMode,
    setPyramidViewMode,
    autoAssignArenas,
    setAutoAssignArenas,
  } = useStateGroup({
    viewMode: 'full' as 'full' | 'pending',
    pendingOrder: 'desc' as 'asc' | 'desc',
    expandedRounds: new Set<number>(),
    collapsedRounds: new Set<number>(),
    competitionReferees: [] as Array<{
      id: string;
      firstName: string;
      lastName: string;
      club?: string;
      status?: string;
    }>,
    pyramidViewMode: false,
    autoAssignArenas: false,
  });
  // Modales arène / arbitre / signatures regroupées (#1241)
  const {
    showArenaModal,
    setShowArenaModal,
    selectedMatchForArena,
    setSelectedMatchForArena,
    showRefereeModal,
    setShowRefereeModal,
    signaturesMatch,
    setSignaturesMatch,
    selectedMatchForReferee,
    setSelectedMatchForReferee,
    selectedMatchConsolationBracketId,
    setSelectedMatchConsolationBracketId,
  } = useStateGroup(ASSIGN_MODALS_INIT);
  // Mesures des colonnes pour les connecteurs SVG (#1241)
  const { colRefs, bracketWrapRef, colMeasures } = useColumnMeasures(
    viewMode === 'full' && !pyramidViewMode,
    [tableauSize, collapsedRounds]
  );
  // Options de la modale PDF/impression regroupées (#1241)
  const {
    showPdfModal,
    setShowPdfModal,
    pdfMode,
    setPdfMode,
    pdfMatchesPerPage,
    setPdfMatchesPerPage,
    selectedRounds,
    setSelectedRounds,
  } = useStateGroup(PDF_DIALOG_INIT);
  const bracketContentRef = useRef<HTMLDivElement | null>(null);
  // Zoom et déplacement de la vue bracket (#1241)
  const {
    zoom,
    setZoom,
    pan,
    setPan,
    isPanningRef,
    scrollAreaRef,
    handleBracketMouseDown,
    handleBracketMouseMove,
    handleBracketMouseUp,
  } = useBracketZoomPan({ competitionId, viewMode, pyramidViewMode });

  // Charge les arbitres de la compétition (montage + ouverture de la modale)
  const openRefereeModal = useCallback(
    (matchId: string) => {
      if (competitionId) {
        Promise.resolve()
          .then(() => window.electronAPI.db.getRefereesByCompetition(competitionId))
          .then(refs => {
            setCompetitionReferees(
              (refs ?? []).map(r => ({
                id: r.id,
                firstName: r.firstName,
                lastName: r.lastName,
                club: r.club,
                status: r.status,
              }))
            );
          })
          .catch(() => {});
      }
      setSelectedMatchForReferee(matchId);
      setShowRefereeModal(true);
    },
    [competitionId]
  );

  // Tours repliés (#1115) : le plus grand tour déplié sert de première colonne
  // visuelle ; les cases se resserrent et les liaisons des tours repliés disparaissent.
  const isRoundExpanded = useCallback(
    (round: number) => !collapsedRounds.has(round),
    [collapsedRounds]
  );
  const visualBaseRound = useMemo(() => {
    let base = 0;
    for (let r = tableauSize; r >= 2; r /= 2) {
      if (isRoundExpanded(r)) {
        base = r;
        break;
      }
    }
    return base || tableauSize;
  }, [tableauSize, isRoundExpanded]);

  // Connecteurs SVG entre les MatchCards
  const svgConnectors = useMemo(() => {
    if (viewMode !== 'full' || pyramidViewMode || colMeasures.size === 0 || tableauSize === 0)
      return null;
    const totalH = (visualBaseRound / 2) * SLOT_HEIGHT;
    const paths: React.ReactNode[] = [];

    for (const match of matches) {
      if (match.round <= 2 || match.round === 3) continue; // pas de parent pour la finale/petite-finale
      const parentRound = match.round / 2;
      const parentPos = Math.floor(match.position / 2);
      if (match.round > visualBaseRound || !isRoundExpanded(match.round)) continue;
      if (!isRoundExpanded(parentRound)) continue;

      const childMeasure = colMeasures.get(match.round);
      const parentMeasure = colMeasures.get(parentRound);
      if (!childMeasure || !parentMeasure) continue;

      const childRight = childMeasure.left + childMeasure.width;
      const parentLeft = parentMeasure.left;
      const midX = (childRight + parentLeft) / 2;

      const childY =
        calculateMatchVerticalPosition(match.round, match.position, visualBaseRound) +
        BASE_MATCH_HEIGHT / 2;
      const parentY =
        calculateMatchVerticalPosition(parentRound, parentPos, visualBaseRound) +
        BASE_MATCH_HEIGHT / 2;

      const hasWinner = !!match.winner;
      paths.push(
        <path
          key={`conn-${match.id}`}
          d={`M ${childRight} ${childY} H ${midX} V ${parentY} H ${parentLeft}`}
          stroke={hasWinner ? '#10b981' : '#d1d5db'}
          strokeWidth={hasWinner ? 2 : 1.5}
          strokeDasharray={hasWinner ? undefined : '5,3'}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    return (
      <svg
        className="bracket-svg-overlay"
        width="100%"
        height={totalH}
        style={{ width: '100%', height: totalH }}
      >
        {paths}
      </svg>
    );
  }, [
    viewMode,
    pyramidViewMode,
    colMeasures,
    matches,
    tableauSize,
    visualBaseRound,
    isRoundExpanded,
  ]);

  const isUnlimitedScore = maxScore === 999;
  const prevMatchesLengthRef = useRef(0);
  const mountMatchesRef = useRef(matches);
  const consolationBrackets = consolationBracketsprop;
  const setConsolationBrackets = (
    updater: ConsolationBracket[] | ((prev: ConsolationBracket[]) => ConsolationBracket[])
  ) => {
    const next = typeof updater === 'function' ? updater(consolationBrackets) : updater;
    onConsolationBracketsChange?.(next);
  };

  const { modalRef } = useModalResize({
    defaultWidth: 600,
    defaultHeight: 400,
    minWidth: 400,
    minHeight: 300,
  });

  const unavailableStrips = useStripAvailability(s => s.unavailable);
  const distributeArenasRoundRobin = useCallback(
    (matchList: TableauMatch[], only?: (m: TableauMatch) => boolean): TableauMatch[] => {
      if (arenaCount <= 0) return matchList;
      let arenaIdx = 0;
      return matchList.map(m => {
        if (m.fencerA && m.fencerB && !m.isBye && !m.winner && (!only || only(m))) {
          const arena = stripAtIndex(stripStart, arenaCount, arenaIdx, unavailableStrips);
          arenaIdx++;
          return { ...m, arena };
        }
        return m;
      });
    },
    [arenaCount, stripStart, unavailableStrips]
  );

  // Nombre de matchs jouables (les deux tireurs connus) — utilisé comme signal de déclenchement
  // pour l'auto-assign : augmente à chaque fois qu'un nouveau tour devient jouable après
  // propagation des vainqueurs (QF → SF → Finale).
  const playableMatchCount = matches.filter(m => m.fencerA && m.fencerB && !m.isBye).length;

  // Auto-assign arenas when matches are (re)generated and autoAssignArenas is on
  useEffect(() => {
    const playable = matches.filter(m => m.fencerA && m.fencerB && !m.isBye);
    const prev = prevMatchesLengthRef.current;
    prevMatchesLengthRef.current = playable.length;
    if (!autoAssignArenas || arenaCount <= 0 || playable.length === 0) return;
    // Skip if a champion already exists: returning from results view would otherwise trigger
    // onMatchesChange → matches ref changes → safety-net effect fires → onComplete called
    // → forced redirect back to results.
    const champion = matches.find(m => m.round === 2)?.winner;
    if (champion) return;

    if (prev === 0 && playable.length > 0) {
      // Génération initiale : distribution complète.
      const updated = distributeArenasRoundRobin(matches);
      onMatchesChange(updated);
      notifyArenaDiff(updated);
    } else if (playable.length > prev) {
      // Nouveau tour débloqué (ex. SF après QF) : assigner les pistes uniquement aux
      // matchs qui n'en ont pas encore, sans écraser les affectations manuelles.
      const hasUnassigned = matches.some(
        m => m.fencerA && m.fencerB && !m.isBye && !m.winner && !m.arena
      );
      if (hasUnassigned) {
        const updated = distributeArenasRoundRobin(matches, m => !m.arena);
        onMatchesChange(updated);
        notifyArenaDiff(updated);
      }
    }
  }, [playableMatchCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoAssignToggle = useCallback(
    (enabled: boolean) => {
      setAutoAssignArenas(enabled);
      if (enabled && arenaCount > 0) {
        const updated = distributeArenasRoundRobin(matches);
        onMatchesChange(updated);
        notifyArenaDiff(updated);
      } else if (!enabled) {
        // Désactivation : vider les assignations des matchs non encore joués
        const updated = matches.map(m => (!m.winner ? { ...m, arena: null as number | null } : m));
        onMatchesChange(updated);
        matches.forEach(m => {
          if (m.arena != null && !m.winner) onMatchArenaChange?.(m.id, m.arena, null);
        });
      }
    },
    [arenaCount, distributeArenasRoundRobin, matches, onMatchesChange, onMatchArenaChange]
  );

  const handleBulkDeassign = useCallback(() => {
    const updated = matches.map(m => ({ ...m, arena: null as number | null }));
    onMatchesChange(updated);
    notifyArenaDiff(updated);
  }, [matches, onMatchesChange, onMatchArenaChange]);

  return {
    ranking,
    matches,
    onMatchesChange,
    maxScore,
    onBlackCard,
    thirdPlaceMatch,
    playAllPositions,
    arenaCount,
    stripStart,
    competitionId,
    onConsolationBracketsChange,
    readOnly,
    maxRefereesPerMatch,
    autoFillReferees,
    tieBreakByVictory,
    t,
    showToast,
    confirm,
    tableauTemplate,
    tableauSize,
    setTableauSize,
    undo,
    onComplete,
    onMatchArenaChange,
    onMatchRefereeChange,
    editingMatch,
    setEditingMatch,
    editingConsolationId,
    setEditingConsolationId,
    showScoreModal,
    setShowScoreModal,
    editScoreA,
    setEditScoreA,
    editScoreB,
    setEditScoreB,
    victoryA,
    setVictoryA,
    victoryB,
    setVictoryB,
    viewMode,
    setViewMode,
    pendingOrder,
    setPendingOrder,
    expandedRounds,
    setExpandedRounds,
    setCollapsedRounds,
    competitionReferees,
    pyramidViewMode,
    setPyramidViewMode,
    autoAssignArenas,
    showArenaModal,
    setShowArenaModal,
    selectedMatchForArena,
    setSelectedMatchForArena,
    showRefereeModal,
    setShowRefereeModal,
    signaturesMatch,
    setSignaturesMatch,
    selectedMatchForReferee,
    setSelectedMatchForReferee,
    selectedMatchConsolationBracketId,
    setSelectedMatchConsolationBracketId,
    colRefs,
    bracketWrapRef,
    showPdfModal,
    setShowPdfModal,
    pdfMode,
    setPdfMode,
    pdfMatchesPerPage,
    setPdfMatchesPerPage,
    selectedRounds,
    setSelectedRounds,
    bracketContentRef,
    zoom,
    setZoom,
    pan,
    setPan,
    isPanningRef,
    scrollAreaRef,
    handleBracketMouseDown,
    handleBracketMouseMove,
    handleBracketMouseUp,
    openRefereeModal,
    isRoundExpanded,
    visualBaseRound,
    svgConnectors,
    isUnlimitedScore,
    mountMatchesRef,
    consolationBrackets,
    setConsolationBrackets,
    modalRef,
    handleAutoAssignToggle,
    handleBulkDeassign,
  };
}
