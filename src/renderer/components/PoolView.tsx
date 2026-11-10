/**
 * BellePoule Modern - Pool View Component
 * With classic grid view and match list view
 * Licensed under GPL-3.0
 */

import { TipButton } from './Tooltip';
import React, { useMemo, useEffect } from 'react';
import {
  ChartColumn,
  ClipboardList,
  Coins,
  Dices,
  Funnel,
  Gavel,
  PenLine,
  Play,
  Plus,
  Printer,
  Redo2,
  Swords,
  Undo2,
} from 'lucide-react';
import { Icon } from './common/Icon';
import { resolveInlineSubmit } from '../../shared/utils/inlineScoreInput';
import { useModalResize } from '../hooks/useModalResize';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Fencer, MatchStatus, FencerStatus } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { POOL_COLUMNS } from '../hooks/useColumnVisibility';
import PoolScoreMatrix from './pool/PoolScoreMatrix';
import PoolMatchList from './pool/PoolMatchList';
import Confetti from './Confetti';
import AddFencerToPoolModal from './AddFencerToPoolModal';
import { PoolStripButton } from './pool/PoolStripButton';
import { PoolRefereeModal } from './pool/PoolRefereeModal';
import { MatchAuditLog } from './MatchAuditLog';
import { MedicalCrossIcon } from './common/MedicalCrossIcon';
import SpecialStatusPanel, {
  type SpecialStatus as PoolSpecialStatus,
} from './common/SpecialStatusPanel';
import { autoAssignReferees } from '../../shared/utils/refereeStats';
import { specialStatusOutcome, specialStatusFencers } from './pool/poolSpecialStatus';
import type { PoolViewProps } from './pool/poolViewTypes';
import { usePoolViewState } from '../hooks/poolView/usePoolViewState';
import {
  SPECIAL_BTN,
  ROW_BETWEEN,
  MATCH_LABEL,
  MATCH_CENTER,
  FENCER_NAME,
  NEXT_MATCH_BOX,
  SCORE_ROW,
  SCORE_MODAL,
  nameCol,
  nameLast,
  nameFirst,
  victoryBtn,
  SCORE_SEP,
  SPECIAL_ROW,
  FOOTER_RIGHT,
  LOG_TOGGLE,
  LOG_WRAP,
  LOG_ITEM,
  LOCKED_BANNER,
  RELATIVE,
  VS,
  COL_MENU,
  COL_MENU_HEADER,
  NEXT_MATCH_SUBMIT,
  abandonName,
  scoreInput,
} from './poolView.styles';
import TiebreakerAnimation from './TiebreakerAnimation';
import { Button } from './common/Button';

const PoolViewComponent: React.FC<PoolViewProps> = (props: PoolViewProps) => {
  const poolViewState = usePoolViewState({ ...props });
  const {
    showPoolConfetti,
    isLocked,
    t,
    pool,
    signedFencerIds,
    openRefereeModal,
    assignedReferees,
    isMultiReferee,
    assignedReferee,
    stripRange,
    onStripChange,
    undo,
    canUndo,
    redo,
    canRedo,
    isRemoteActive,
    remoteServerUrl,
    defaultArena,
    competitionId,
    setShowAddFencerModal,
    columnMenuRef,
    setShowColumnMenu,
    showColumnMenu,
    columnFilterEdited,
    isLaserSabre,
    isVisible,
    toggleColumn,
    pdfHideStatColumns,
    togglePdfHideStatColumns,
    pdfLandscape,
    togglePdfLandscape,
    viewMode,
    setViewMode,
    onMatchReset,
    handleMatchDelete,
    setAuditMatchId,
    arenas,
    matchArenaOverrides,
    cardScale,
    waveMatchIds,
    handleMatchArenaChange,
    showAddFencerModal,
    maxScore,
    assignedFencerIds,
    onFencerAdded,
    auditMatchId,
    showRefereeModal,
    maxRefereesPerPool,
    competitionReferees,
    isLoadingReferees,
    pendingRefereeIds,
    closeRefereeModal,
    handleAssignReferee,
    togglePendingReferee,
    confirmPendingReferees,
    matchesStatusKey,
    editingMatch,
    setEditingMatch,
    setIsMatchInverted,
    setKeyboardFocusField,
    handleScoreSubmitRef,
    tieByVictory,
    keyboardFocusField,
    setVictoryA,
    setVictoryB,
    setEditScoreA,
    setEditScoreB,
    simplifiedInputMode,
    hoveredFencerIds,
    fencers,
    setPriorityPick,
    setShowTieChooser,
    setShowPriorityDraw,
    addAction,
    onScoreUpdate,
    setMatchesUpdateTrigger,
    editScoreA,
    editScoreB,
    isMatchInverted,
    setHoveredFencerIds,
    setInlineEditCell,
    setInlineSingleScore,
    cellScoreBuffer,
    inlineEditCell,
    inlineSingleScore,
    tieWinnerCellsRef,
    showToast,
    setCellScoreBuffer,
    victoryA,
    victoryB,
    priorityPick,
    setPendingSpecialStatus,
    pendingSpecialStatus,
    onFencerStatusChange,
    competitionName,
    getVisibleColumns,
    stripQr,
    poolTemplate,
    confirm,
    autoFillReferees,
    onAutoFillReferees,
    showPriorityDraw,
    onMatchCancel,
    showTieChooser,
    onFencerChangePool,
    quickMouseScoring,
    waveHighlightPairs,
    setShowFinishedLog,
    showFinishedLog,
  } = { ...props, ...poolViewState };

  const orderedMatches = useMemo(() => {
    const cancelled = pool.matches
      .map((m, idx) => ({ match: m, index: idx }))
      .filter(({ match }) => match.status === MatchStatus.CANCELLED);

    const pending = pool.matches
      .map((m, idx) => ({ match: m, index: idx }))
      .filter(
        ({ match }) =>
          match.status !== MatchStatus.FINISHED && match.status !== MatchStatus.CANCELLED
      );

    const finished = pool.matches
      .map((m, idx) => ({ match: m, index: idx }))
      .filter(({ match }) => match.status === MatchStatus.FINISHED);

    if (pending.length === 0) return { pending: [], finished, cancelled };

    // Algorithme pour éviter qu'un tireur combatte 2 fois d'affilée
    const ordered: typeof pending = [];
    const remaining = [...pending];
    let lastFencerIds: Set<string> = new Set();

    // Si des matchs ont déjà été joués, récupérer les derniers combattants
    if (finished.length > 0) {
      const lastMatch = finished[finished.length - 1].match;
      if (lastMatch.fencerA) lastFencerIds.add(lastMatch.fencerA.id);
      if (lastMatch.fencerB) lastFencerIds.add(lastMatch.fencerB.id);
    }

    while (remaining.length > 0) {
      // Chercher un match où aucun des deux tireurs n'a combattu au dernier tour
      let bestIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < remaining.length; i++) {
        const { match } = remaining[i];
        const fencerAId = match.fencerA?.id || '';
        const fencerBId = match.fencerB?.id || '';

        let score = 0;
        if (!lastFencerIds.has(fencerAId)) score++;
        if (!lastFencerIds.has(fencerBId)) score++;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }

        // Score parfait (2) = aucun des deux n'a combattu
        if (score === 2) break;
      }

      // Prendre le meilleur match trouvé (ou le premier si aucun idéal)
      const chosenIdx = bestIdx >= 0 ? bestIdx : 0;
      const chosen = remaining.splice(chosenIdx, 1)[0];
      ordered.push(chosen);

      // Mettre à jour les derniers combattants
      lastFencerIds = new Set();
      if (chosen.match.fencerA) lastFencerIds.add(chosen.match.fencerA.id);
      if (chosen.match.fencerB) lastFencerIds.add(chosen.match.fencerB.id);
    }

    return { pending: ordered, finished, cancelled };
  }, [pool.matches, matchesStatusKey]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ne pas interférer si un input natif est actif (sauf ceux du modal)
      const target = e.target as HTMLElement;
      const inModalInput = target.tagName === 'INPUT' && target.closest('.modal');

      if (editingMatch !== null) {
        // Modal ouvert
        if (e.key === 'Escape') {
          e.preventDefault();
          setEditingMatch(null);
          setIsMatchInverted(false);
          setKeyboardFocusField('A');
          return;
        }
        if (e.key === 'Enter' && !inModalInput) {
          e.preventDefault();
          handleScoreSubmitRef.current();
          return;
        }
        if (e.key === 'Tab' && !inModalInput) {
          e.preventDefault();
          setKeyboardFocusField(prev => (prev === 'A' ? 'B' : 'A'));
          return;
        }
        if ((e.key === 'v' || e.key === 'V') && tieByVictory && !inModalInput) {
          e.preventDefault();
          if (keyboardFocusField === 'A') {
            setVictoryA(prev => !prev);
            setVictoryB(false);
          } else {
            setVictoryB(prev => !prev);
            setVictoryA(false);
          }
          return;
        }
        if (/^\d$/.test(e.key) && !inModalInput) {
          e.preventDefault();
          const digit = e.key;
          if (keyboardFocusField === 'A') {
            setEditScoreA(prev => (prev.length < 2 ? prev + digit : digit));
          } else {
            setEditScoreB(prev => (prev.length < 2 ? prev + digit : digit));
          }
          return;
        }
      } else {
        // Modal fermé
        if (
          (e.key === 'n' || e.key === 'N') &&
          !inModalInput &&
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          if (!isLocked) {
            const firstPending = orderedMatches.pending[0];
            if (firstPending) {
              openScoreModal(firstPending.index);
              setKeyboardFocusField('A');
            }
          }
          return;
        }
        if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          if (!isLocked) undo();
          return;
        }
        if (
          (e.key === 'y' && e.ctrlKey) ||
          (e.key === 'z' && e.ctrlKey && e.shiftKey) ||
          (e.key === 'Z' && e.ctrlKey && e.shiftKey)
        ) {
          e.preventDefault();
          if (!isLocked) redo();
          return;
        }
        // Saisie simplifiée : survoler une case puis Suppr efface le score de ce match.
        if (
          e.key === 'Delete' &&
          simplifiedInputMode &&
          !isLocked &&
          !inModalInput &&
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          hoveredFencerIds.size === 2
        ) {
          e.preventDefault();
          const [idA, idB] = Array.from(hoveredFencerIds);
          const fencerA = fencers.find(f => f.id === idA);
          const fencerB = fencers.find(f => f.id === idB);
          if (fencerA && fencerB) {
            const matchIndex = getMatchIndex(fencerA, fencerB);
            if (matchIndex !== -1 && pool.matches[matchIndex]?.status === MatchStatus.FINISHED) {
              handleMatchDelete(matchIndex);
            }
          }
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    editingMatch,
    keyboardFocusField,
    isLaserSabre,
    orderedMatches.pending,
    undo,
    redo,
    simplifiedInputMode,
    isLocked,
    hoveredFencerIds,
    fencers,
    pool.matches,
    handleMatchDelete,
  ]);

  // Calculer l'ordre optimal des matches restants

  const getMatchIndex = (fencerA: Fencer, fencerB: Fencer): number => {
    return pool.matches.findIndex(
      m =>
        (m.fencerA?.id === fencerA.id && m.fencerB?.id === fencerB.id) ||
        (m.fencerA?.id === fencerB.id && m.fencerB?.id === fencerA.id)
    );
  };

  const { modalRef } = useModalResize({
    defaultWidth: 1440, // Doublé de 720 à 1440 (+100%)
    defaultHeight: 400,
    minWidth: 960, // Doublé de 480 à 960 (+100%)
    minHeight: 300,
  });

  const closeAndResetScoreModal = () => {
    setEditingMatch(null);
    setIsMatchInverted(false);
    setEditScoreA('');
    setEditScoreB('');
    setVictoryA(false);
    setVictoryB(false);
    setPriorityPick(null);
    setShowTieChooser(false);
    setShowPriorityDraw(false);
  };

  /** Égalité tranchée : V, minute prioritaire, ou égalité sans vainqueur (« Aucun ») (#1442) */
  const commitTie = (scoreA: number, scoreB: number, winner?: 'A' | 'B', priority?: 'A' | 'B') => {
    if (editingMatch === null) return;
    const matchIdx = editingMatch;
    const match = pool.matches[matchIdx];
    const prevScoreA = match?.scoreA?.value ?? null;
    const prevScoreB = match?.scoreB?.value ?? null;
    addAction({
      type: 'UPDATE_SCORE',
      description: `Score poule ${pool.number} match ${matchIdx + 1}`,
      undo: () => {
        if (prevScoreA !== null && prevScoreB !== null)
          onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
      },
      redo: () => {
        onScoreUpdate(matchIdx, scoreA, scoreB, winner, undefined, priority);
      },
    });
    onScoreUpdate(matchIdx, scoreA, scoreB, winner, undefined, priority);
    setMatchesUpdateTrigger(prev => prev + 1);
    closeAndResetScoreModal();
  };

  /** Choix du vainqueur à égalité (gauche / droite affichées, ou « Aucun ») */
  const chooseTieWinner = (choice: 'left' | 'right' | 'none') => {
    const sL = parseInt(editScoreA, 10) || 0;
    const sR = parseInt(editScoreB, 10) || 0;
    const scoreA = isMatchInverted ? sR : sL;
    const scoreB = isMatchInverted ? sL : sR;
    const winner: 'A' | 'B' | undefined =
      choice === 'none' ? undefined : (choice === 'left') !== isMatchInverted ? 'A' : 'B';
    commitTie(scoreA, scoreB, winner);
  };

  // Focus piégé + Échap sur la modale de score (clic extérieur : ne ferme pas, #1115)
  const scoreTrapRef = useFocusTrap<HTMLDivElement>(editingMatch !== null, closeAndResetScoreModal);

  const openScoreModal = (matchIndex: number, inverted = false) => {
    const match = pool.matches[matchIndex];
    setEditingMatch(matchIndex);
    setIsMatchInverted(inverted);
    setEditScoreA(
      inverted ? match.scoreB?.value?.toString() || '' : match.scoreA?.value?.toString() || ''
    );
    setEditScoreB(
      inverted ? match.scoreA?.value?.toString() || '' : match.scoreB?.value?.toString() || ''
    );
    // Restaurer la victoire existante (ex: match déjà saisi par tirage au sort)
    setVictoryA(!inverted ? !!match.scoreA?.isVictory : !!match.scoreB?.isVictory);
    setVictoryB(!inverted ? !!match.scoreB?.isVictory : !!match.scoreA?.isVictory);
  };

  const handleHoverCell = (rowFencer: Fencer, colFencer: Fencer) => {
    setHoveredFencerIds(new Set([rowFencer.id, colFencer.id]));
  };

  const handleHoverLeave = () => setHoveredFencerIds(new Set());

  const handleWheelScore = (
    rowFencer: Fencer,
    colFencer: Fencer,
    shiftKey: boolean,
    delta: number
  ) => {
    if (isLocked) return;
    const matchIndex = getMatchIndex(rowFencer, colFencer);
    if (matchIndex === -1) return;
    const match = pool.matches[matchIndex];
    if (!match || match.status === MatchStatus.CANCELLED) return;
    if (match.scoreA?.isAbstention || match.scoreA?.isExclusion || match.scoreA?.isForfait) return;

    const inverted = match.fencerA?.id === colFencer.id;
    const curA = match.scoreA?.value ?? 0;
    const curB = match.scoreB?.value ?? 0;
    let scoreLeft = inverted ? curB : curA;
    let scoreRight = inverted ? curA : curB;

    const effectiveMax = maxScore || match.maxScore || 5;
    if (!shiftKey) {
      scoreLeft = Math.max(0, Math.min(effectiveMax, scoreLeft + delta));
    } else {
      scoreRight = Math.max(0, Math.min(effectiveMax, scoreRight + delta));
    }

    const actualScoreA = inverted ? scoreRight : scoreLeft;
    const actualScoreB = inverted ? scoreLeft : scoreRight;

    if (actualScoreA === actualScoreB) {
      if (tieByVictory) {
        openScoreModal(matchIndex, inverted);
      }
      return;
    }

    onScoreUpdate(matchIndex, actualScoreA, actualScoreB);
  };

  const getOrderedCells = () => {
    const cells: Array<{
      rowFencer: Fencer;
      colFencer: Fencer;
      key: string;
      matchIndex: number;
      inverted: boolean;
    }> = [];
    for (const rowFencer of fencers) {
      for (const colFencer of fencers) {
        if (rowFencer.id === colFencer.id) continue;
        const isAbandoned =
          rowFencer.status === FencerStatus.ABANDONED ||
          rowFencer.status === FencerStatus.FORFAIT ||
          rowFencer.status === FencerStatus.EXCLUDED ||
          colFencer.status === FencerStatus.ABANDONED ||
          colFencer.status === FencerStatus.FORFAIT ||
          colFencer.status === FencerStatus.EXCLUDED;
        if (isAbandoned) continue;
        const matchIndex = getMatchIndex(rowFencer, colFencer);
        if (matchIndex === -1) continue;
        const match = pool.matches[matchIndex];
        if (match.status === MatchStatus.FINISHED || match.status === MatchStatus.CANCELLED)
          continue;
        const inverted = match.fencerA?.id === colFencer.id;
        cells.push({
          rowFencer,
          colFencer,
          key: `${rowFencer.id}-${colFencer.id}`,
          matchIndex,
          inverted,
        });
      }
    }
    return cells;
  };

  const openNextCell = (
    currentKey: string,
    skipKeys: Set<string>,
    buffer: Record<string, number>
  ) => {
    const cells = getOrderedCells();
    const currentIndex = cells.findIndex(c => c.key === currentKey);
    const startFrom = currentIndex === -1 ? 0 : currentIndex + 1;
    for (let i = startFrom; i < cells.length; i++) {
      if (!skipKeys.has(cells[i].key)) {
        const next = cells[i];
        setInlineEditCell({
          key: next.key,
          rowId: next.rowFencer.id,
          colId: next.colFencer.id,
          matchIndex: next.matchIndex,
          inverted: next.inverted,
        });
        setInlineSingleScore(buffer[next.key] !== undefined ? String(buffer[next.key]) : '');
        return;
      }
    }
    setInlineEditCell(null);
    setInlineSingleScore('');
  };

  // Score déjà enregistré pour une case (côté ligne), si le match a été saisi
  const getRecordedCellScore = (matchIndex: number, inverted: boolean, mirror = false) => {
    const match = pool.matches[matchIndex];
    if (!match || match.status !== MatchStatus.FINISHED) return undefined;
    const side = inverted !== mirror ? match.scoreB : match.scoreA;
    return side?.value ?? undefined;
  };

  const handleCellClick = (rowFencer: Fencer, colFencer: Fencer) => {
    if (isLocked) return;
    if (rowFencer.id === colFencer.id) return;
    const matchIndex = getMatchIndex(rowFencer, colFencer);
    if (matchIndex === -1) return;
    const match = pool.matches[matchIndex];
    const inverted = match.fencerA?.id === colFencer.id;
    if (simplifiedInputMode) {
      const key = `${rowFencer.id}-${colFencer.id}`;
      setInlineEditCell({ key, rowId: rowFencer.id, colId: colFencer.id, matchIndex, inverted });
      const current = cellScoreBuffer[key] ?? getRecordedCellScore(matchIndex, inverted);
      setInlineSingleScore(current !== undefined ? String(current) : '');
      return;
    }
    openScoreModal(matchIndex, inverted);
  };

  const handleInlineSubmit = () => {
    if (!inlineEditCell) return;
    const { key, rowId, colId, matchIndex, inverted } = inlineEditCell;
    const r = resolveInlineSubmit({
      raw: inlineSingleScore,
      maxScore: maxScore || pool.matches[matchIndex]?.maxScore || 0,
      tieByVictory,
      isLaserSabre,
      key,
      rowId,
      colId,
      inverted,
      buffer: cellScoreBuffer,
      recordedMirror: getRecordedCellScore(matchIndex, inverted, true), // #1046
      winnerCells: tieWinnerCellsRef.current,
    });
    if (r.action === 'skip') openNextCell(key, new Set(), cellScoreBuffer);
    else if (r.action === 'error') showToast(t(r.msgKey, { max: r.max ?? 0 }), 'error');
    else if (r.action === 'modal') openScoreModal(matchIndex, inverted);
    else if (r.action === 'buffer') {
      setCellScoreBuffer(r.buffer);
      openNextCell(key, new Set(), r.buffer);
    } else {
      setCellScoreBuffer(r.restBuffer);
      if (r.winner) onScoreUpdate(matchIndex, r.scoreA, r.scoreB, r.winner);
      else onScoreUpdate(matchIndex, r.scoreA, r.scoreB);
      openNextCell(key, new Set([key, r.mirrorKey]), r.restBuffer);
    }
  };

  const handleInlineCancel = () => {
    setInlineEditCell(null);
    setInlineSingleScore('');
  };

  const handleScoreSubmit = () => {
    if (editingMatch === null) return;

    const scoreLeft = parseInt(editScoreA, 10) || 0;
    const scoreRight = parseInt(editScoreB, 10) || 0;

    // Valider que les scores ne dépassent pas le maximum
    // Le réglage courant (prop) prime sur le maxScore figé à la génération du match
    const effectiveMax = maxScore || pool.matches[editingMatch]?.maxScore || 0;
    if (effectiveMax > 0) {
      if (scoreLeft > effectiveMax) {
        showToast(t('poolView.max_score_a', { max: effectiveMax }), 'error');
        return;
      }
      if (scoreRight > effectiveMax) {
        showToast(t('poolView.max_score_b', { max: effectiveMax }), 'error');
        return;
      }
    }

    // Remettre dans l'ordre fencerA/fencerB du match si la vue est inversée
    const actualScoreA = isMatchInverted ? scoreRight : scoreLeft;
    const actualScoreB = isMatchInverted ? scoreLeft : scoreRight;

    // Capturer l'ancien score pour l'historique
    const match = pool.matches[editingMatch];
    const prevScoreA =
      typeof match?.scoreA === 'number' ? match.scoreA : ((match?.scoreA as any)?.value ?? null);
    const prevScoreB =
      typeof match?.scoreB === 'number' ? match.scoreB : ((match?.scoreB as any)?.value ?? null);
    const matchIdx = editingMatch;

    if (actualScoreA === actualScoreB) {
      if (tieByVictory && (victoryA || victoryB)) {
        // victoryA = victoire du tireur affiché à gauche (= fencerA si normal, fencerB si inversé)
        const winnerLeft = victoryA;
        const winner: 'A' | 'B' = isMatchInverted
          ? winnerLeft
            ? 'B'
            : 'A'
          : winnerLeft
            ? 'A'
            : 'B';
        addAction({
          type: 'UPDATE_SCORE',
          description: `Score poule ${pool.number} match ${matchIdx + 1}`,
          undo: () => {
            if (prevScoreA !== null && prevScoreB !== null)
              onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
          },
          redo: () => {
            onScoreUpdate(matchIdx, actualScoreA, actualScoreB, winner);
          },
        });
        onScoreUpdate(editingMatch, actualScoreA, actualScoreB, winner);
      } else if (isLaserSabre) {
        showToast(t('poolView.draw_laser'), 'warning');
        return;
      } else if (victoryA || victoryB) {
        // Tirage au sort déjà décidé (ex: résultat importé depuis une tablette arbitre)
        const winnerLeft = victoryA;
        const winner: 'A' | 'B' = isMatchInverted
          ? winnerLeft
            ? 'B'
            : 'A'
          : winnerLeft
            ? 'A'
            : 'B';
        addAction({
          type: 'UPDATE_SCORE',
          description: `Score poule ${pool.number} match ${matchIdx + 1}`,
          undo: () => {
            if (prevScoreA !== null && prevScoreB !== null)
              onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
          },
          redo: () => {
            onScoreUpdate(matchIdx, actualScoreA, actualScoreB, winner);
          },
        });
        onScoreUpdate(editingMatch, actualScoreA, actualScoreB, winner);
      } else if (tieByVictory) {
        // Minute prioritaire tirée avant la minute supplémentaire : le prioritaire gagne sans touche
        if (priorityPick) {
          commitTie(actualScoreA, actualScoreB, undefined, priorityPick);
        } else {
          setShowTieChooser(true);
        }
        return;
      } else {
        showToast(t('poolView.draw_live'), 'error');
        return;
      }
    } else {
      addAction({
        type: 'UPDATE_SCORE',
        description: `Score poule ${pool.number} match ${matchIdx + 1}`,
        undo: () => {
          if (prevScoreA !== null && prevScoreB !== null)
            onScoreUpdate(matchIdx, prevScoreA, prevScoreB);
        },
        redo: () => {
          onScoreUpdate(matchIdx, actualScoreA, actualScoreB);
        },
      });
      onScoreUpdate(editingMatch, actualScoreA, actualScoreB);
    }

    // Forcer la mise à jour de l'ordre des matchs
    setMatchesUpdateTrigger(prev => prev + 1);

    // Fermer le modal immédiatement après la mise à jour
    closeAndResetScoreModal();
  };

  // Mettre à jour la ref avec la fonction actuelle
  handleScoreSubmitRef.current = handleScoreSubmit;

  // Ouvre la modale « Quel est le combattant … ? ». Les erreurs arrivent : on
  // ne déclenche rien tant que le référent n'a pas désigné un combattant.
  const handleSpecialStatus = (status: PoolSpecialStatus) => {
    if (editingMatch === null) return;
    setPendingSpecialStatus(status);
  };

  // Le référent a désigné le combattant concerné (côté affiché) dans la modale
  const applySpecialStatus = (side: 'left' | 'right', blackCard = false) => {
    const status = pendingSpecialStatus;
    if (status === null || editingMatch === null) {
      setPendingSpecialStatus(null);
      return;
    }

    const match = pool.matches[editingMatch];
    const out = specialStatusOutcome({
      side,
      inverted: isMatchInverted,
      status,
      isLaserSabre,
      editScoreLeft: editScoreA,
      editScoreRight: editScoreB,
      scoreA: match.scoreA?.value,
      scoreB: match.scoreB?.value,
      maxScore,
    });
    onScoreUpdate(editingMatch, out.scoreA, out.scoreB, out.winner, status);
    const loserFencer = out.loser === 'A' ? match.fencerA : match.fencerB;
    if (onFencerStatusChange && loserFencer) {
      onFencerStatusChange(loserFencer.id, status, blackCard);
    }

    // Forcer la mise à jour de l'ordre des matchs
    setMatchesUpdateTrigger(prev => prev + 1);

    // Fermer les modales immédiatement après la mise à jour
    setPendingSpecialStatus(null);
    closeAndResetScoreModal();
  };

  const finishedCount = useMemo(
    () => pool.matches.filter(m => m.status === MatchStatus.FINISHED).length,
    [pool.matches]
  );
  const totalMatches = pool.matches.length;

  // Options communes à l'export PDF et à l'impression de la feuille de poule
  const buildPoolPrintOptions = async () => {
    const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
    const sigsArray = await window.electronAPI.db.getPoolSignatures(pool.id);
    const signatures = Object.fromEntries(sigsArray.map(s => [s.fencerId, s.signatureData]));
    return {
      title: `Poule ${pool.number} - ${pool.fencers.length} tireurs`,
      includeFinishedMatches: true,
      includePendingMatches: true,
      includePoolStats: true,
      logoBase64: logo,
      competitionName,
      competitionId,
      visibleColumns: getVisibleColumns('pool', pool.id),
      hideStatColumns: pdfHideStatColumns,
      landscape: pdfLandscape,
      signatures,
      stripQrUrl: stripQr?.url,
      stripNumber: stripQr?.strip,
    };
  };

  const errorText = (e: unknown) => (e instanceof Error ? e.message : t('poolView.unknown_error'));

  // Impression directe de la feuille de poule (Ctrl+P / bouton 🖨️)
  const handlePrintPool = async () => {
    try {
      const options = await buildPoolPrintOptions();
      const { printPoolHTML } = await import('../../shared/utils/pdfExport');
      await printPoolHTML(pool, options, poolTemplate);
    } catch (error) {
      logger.error(LogCategory.UI, "Erreur lors de l'impression de la poule", error as Error);
      showToast(t('poolView.print_error', { error: errorText(error) }), 'error');
    }
  };

  // Fonction pour remplir automatiquement tous les scores de la poule (pour les tests)
  const handleAutoFillScores = async () => {
    const confirmed = await confirm({
      message: t('poolView.autofill_confirm'),
      confirmLabel: t('poolView.autofill_ok'),
      cancelLabel: t('actions.cancel'),
    });

    if (!confirmed) return;

    const pendingMatches = pool.matches
      .map((match, index) => ({ match, index }))
      .filter(({ match }) => match.status !== MatchStatus.FINISHED);

    if (pendingMatches.length === 0) {
      showToast(t('poolView.all_finished'), 'info');
      return;
    }

    // Arbitres : ceux de la poule en priorité, sinon ceux de la compétition (statistiques de test)
    const refereeCandidates =
      assignedReferees.length > 0 ? assignedReferees : (autoFillReferees ?? []);
    if (onAutoFillReferees && refereeCandidates.length > 0) {
      const load = new Map<string, number>();
      for (const m of pool.matches) {
        if (m.referee) load.set(m.referee.id, (load.get(m.referee.id) ?? 0) + 1);
      }
      const assignments = autoAssignReferees(
        pendingMatches.map(({ match }) => match).filter(m => !m.referee),
        refereeCandidates,
        load
      );
      if (assignments.size > 0) onAutoFillReferees(assignments);
    }

    // Scores tirés au hasard, puis appliqués ; une seule action annulable (Ctrl+Z) (#1037)
    const generated: Array<{ index: number; a: number; b: number; winner?: 'A' | 'B' }> = [];
    for (const { index } of pendingMatches) {
      const scoreA = Math.floor(Math.random() * (maxScore + 1));
      const scoreB = Math.floor(Math.random() * (maxScore + 1));

      if (scoreA === scoreB) {
        if (isLaserSabre) {
          // En sabre laser, désigner un vainqueur aléatoire en cas d'égalité
          generated.push({ index, a: scoreA, b: scoreB, winner: Math.random() > 0.5 ? 'A' : 'B' });
        } else if (scoreA === 0) {
          // En escrime classique, éviter l'égalité
          generated.push({ index, a: 1, b: 0 });
        } else if (Math.random() > 0.5) {
          generated.push({ index, a: scoreA + 1, b: scoreB });
        } else {
          generated.push({ index, a: scoreA, b: scoreB + 1 });
        }
      } else {
        // Scores différents : désigner le vainqueur explicitement
        generated.push({ index, a: scoreA, b: scoreB, winner: scoreA > scoreB ? 'A' : 'B' });
      }
    }

    const applyGenerated = () => {
      for (const g of generated) onScoreUpdate(g.index, g.a, g.b, g.winner);
      setMatchesUpdateTrigger(prev => prev + 1);
    };
    addAction({
      type: 'UPDATE_SCORE',
      description: `Scores aléatoires poule ${pool.number} (${generated.length} matchs)`,
      undo: () => {
        for (const g of generated) onMatchReset?.(g.index);
        setMatchesUpdateTrigger(prev => prev + 1);
      },
      redo: applyGenerated,
    });
    applyGenerated();

    showToast(t('plural.scores_generated', { count: pendingMatches.length }), 'success');
  };

  // Render Score Modal
  const renderScoreModal = () => {
    if (editingMatch === null) return null;

    const match = pool.matches[editingMatch];

    return (
      // Clic hors de la fenêtre : ne ferme pas (#1115)
      <div className="modal-overlay" ref={scoreTrapRef}>
        <div
          ref={modalRef}
          className="modal resizable"
          style={SCORE_MODAL}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-header is-0430c2">
            <h3 className="modal-title">{t('poolView.quick_score')}</h3>
          </div>
          <div className="modal-body is-a48125">
            {/* Égalité olympique / rapières : tirage du prioritaire (#1442) */}
            {tieByVictory && !isLaserSabre && (
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {editScoreA !== '' &&
                  editScoreB !== '' &&
                  (parseInt(editScoreA, 10) || 0) === (parseInt(editScoreB, 10) || 0) &&
                  !!pool.matches[editingMatch]?.fencerA &&
                  !!pool.matches[editingMatch]?.fencerB && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Button
                        type="button"
                        variant="warning"
                        onClick={() => setShowPriorityDraw(true)}
                      >
                        <Icon icon={Coins} /> {t('poolView.priority_draw')}
                      </Button>
                      {priorityPick && (
                        <span className="text-muted">
                          {t('poolView.priority_holder', {
                            name: (() => {
                              const f =
                                priorityPick === 'A'
                                  ? pool.matches[editingMatch]?.fencerA
                                  : pool.matches[editingMatch]?.fencerB;
                              return f ? `${f.lastName} ${f.firstName}`.trim() : '';
                            })(),
                          })}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            )}
            {showPriorityDraw &&
              pool.matches[editingMatch]?.fencerA &&
              pool.matches[editingMatch]?.fencerB && (
                <TiebreakerAnimation
                  fencerA={pool.matches[editingMatch]!.fencerA!}
                  fencerB={pool.matches[editingMatch]!.fencerB!}
                  onComplete={winner => {
                    setPriorityPick(winner);
                    setShowPriorityDraw(false);
                  }}
                />
              )}
            {/* Ligne unique avec les deux tireurs côte à côte */}
            <div style={SCORE_ROW}>
              {/* Tireur gauche (ligne dans la grille) */}
              {(() => {
                const f = isMatchInverted ? match.fencerB : match.fencerA;
                return (
                  <div style={nameCol('flex-end')}>
                    <div style={nameLast('right')}>{f?.lastName}</div>
                    <div style={nameFirst('right')}>
                      {f?.firstName} {f?.club && `(${f.club})`}
                    </div>
                  </div>
                );
              })()}

              {/* Bouton Victoire (égalité) A */}
              {tieByVictory && (
                <button
                  type="button"
                  onClick={() => {
                    setVictoryA(!victoryA);
                    setVictoryB(false);
                  }}
                  style={victoryBtn(victoryA)}
                >
                  V
                </button>
              )}

              {/* Input Score A */}
              <input
                type="number"
                className="form-input"
                style={scoreInput(
                  (parseInt(editScoreA, 10) || 0) > (maxScore || match?.maxScore || 999)
                )}
                value={editScoreA}
                onChange={e => setEditScoreA(e.target.value)}
                min="0"
                max={maxScore || match?.maxScore || undefined}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScoreSubmitRef.current();
                  } else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    const modalBody = e.currentTarget.closest('.modal-body');
                    if (modalBody) {
                      const inputs = modalBody.querySelectorAll('input[type="number"]');
                      if (inputs.length > 1) {
                        const nextInput = inputs[1] as HTMLInputElement;
                        nextInput.focus();
                        nextInput.select();
                      }
                    }
                  }
                }}
              />

              {/* Séparateur */}
              <span style={SCORE_SEP}>:</span>

              {/* Input Score B */}
              <input
                type="number"
                className="form-input"
                style={scoreInput(
                  (parseInt(editScoreB, 10) || 0) > (maxScore || match?.maxScore || 999)
                )}
                value={editScoreB}
                onChange={e => setEditScoreB(e.target.value)}
                min="0"
                max={maxScore || match?.maxScore || undefined}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScoreSubmitRef.current();
                  } else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    const modalBody = e.currentTarget.closest('.modal-body');
                    if (modalBody) {
                      const inputs = modalBody.querySelectorAll('input[type="number"]');
                      if (inputs.length > 0) {
                        const prevInput = inputs[0] as HTMLInputElement;
                        prevInput.focus();
                        prevInput.select();
                      }
                    }
                  }
                }}
              />

              {/* Bouton Victoire (égalité) B */}
              {tieByVictory && (
                <button
                  type="button"
                  onClick={() => {
                    setVictoryB(!victoryB);
                    setVictoryA(false);
                  }}
                  style={victoryBtn(victoryB)}
                >
                  V
                </button>
              )}

              {/* Tireur droite (colonne dans la grille) */}
              {(() => {
                const f = isMatchInverted ? match.fencerA : match.fencerB;
                return (
                  <div style={nameCol('flex-start')}>
                    <div style={nameLast('left')}>{f?.lastName}</div>
                    <div style={nameFirst('left')}>
                      {f?.firstName} {f?.club && `(${f.club})`}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Info égalité sabre laser */}
            {isLaserSabre && (
              <p className="text-sm text-muted is-b92227">{t('poolView.tie_hint')}</p>
            )}

            {/* Choix du tireur concerné : même affichage que le tableau, sans pop-up (#1418) */}
            {pendingSpecialStatus !== null && (
              <SpecialStatusPanel
                status={pendingSpecialStatus}
                fencers={specialStatusFencers(
                  pool.matches[editingMatch][isMatchInverted ? 'fencerB' : 'fencerA'],
                  pool.matches[editingMatch][isMatchInverted ? 'fencerA' : 'fencerB']
                )}
                onConfirm={(id, blackCard) => {
                  const m = pool.matches[editingMatch];
                  const leftId = (isMatchInverted ? m.fencerB : m.fencerA)?.id;
                  applySpecialStatus(id === leftId ? 'left' : 'right', blackCard);
                }}
                onCancel={() => setPendingSpecialStatus(null)}
              />
            )}
            {/* Boutons spéciaux sur une ligne */}
            {pendingSpecialStatus === null && (
              <div style={SPECIAL_ROW}>
                <Button
                  variant="warning"
                  onClick={() => handleSpecialStatus('abandon')}
                  style={SPECIAL_BTN}
                >
                  <MedicalCrossIcon /> {t('poolView.btn_abandon')}
                </Button>
                <Button
                  variant="warning"
                  onClick={() => handleSpecialStatus('forfait')}
                  style={SPECIAL_BTN}
                >
                  {t('poolView.btn_forfeit')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleSpecialStatus('exclusion')}
                  style={SPECIAL_BTN}
                >
                  {t('poolView.btn_exclusion')}
                </Button>
                {onMatchCancel && (
                  <Button
                    onClick={() => {
                      if (editingMatch === null) return;
                      onMatchCancel(editingMatch);
                      closeAndResetScoreModal();
                    }}
                    style={SPECIAL_BTN}
                  >
                    {t('poolView.btn_cancel_match')}
                  </Button>
                )}
              </div>
            )}
          </div>
          {showTieChooser ? (
            <div className="modal-footer" style={FOOTER_RIGHT}>
              <span className="text-muted">{t('poolView.tie_choose_winner')}</span>
              {(['left', 'right'] as const).map(side => {
                // Gauche affichée = fencerB si la saisie est inversée
                const f =
                  (side === 'left') !== isMatchInverted
                    ? pool.matches[editingMatch]?.fencerA
                    : pool.matches[editingMatch]?.fencerB;
                return (
                  <Button key={side} variant="primary" onClick={() => chooseTieWinner(side)}>
                    V · {f ? `${f.lastName} ${f.firstName}`.trim() : ''}
                  </Button>
                );
              })}
              <Button variant="warning" onClick={() => chooseTieWinner('none')}>
                {t('poolView.tie_none')}
              </Button>
              <Button onClick={() => setShowTieChooser(false)}>{t('actions.cancel')}</Button>
            </div>
          ) : (
            <div className="modal-footer" style={FOOTER_RIGHT}>
              <Button
                onClick={() => {
                  setEditingMatch(null);
                  setIsMatchInverted(false);
                }}
              >
                {t('actions.cancel')}
              </Button>
              <Button variant="primary" onClick={handleScoreSubmit}>
                {t('actions.validate')}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Modale de désignation du combattant pour abandon / forfait / exclusion.
  // Un bouton par combattant + un bouton Annuler (les erreurs, ça arrive).
  // Render Grid View
  const renderGridView = () => (
    <>
      <div className="pool-matrix-scroll">
        <PoolScoreMatrix
          pool={pool}
          isLaserSabre={isLaserSabre}
          isVisible={isVisible}
          toggleColumn={(context, columnId) => toggleColumn(context, columnId, pool.id)}
          onCellClick={handleCellClick}
          onFencerChangePool={onFencerChangePool}
          isLocked={isLocked}
          onMatchReset={
            !isLocked && onMatchReset
              ? (rowFencer, colFencer) => {
                  const matchIndex = getMatchIndex(rowFencer, colFencer);
                  if (matchIndex !== -1) handleMatchDelete(matchIndex);
                }
              : undefined
          }
          quickMouseScoring={quickMouseScoring}
          highlightedFencerIds={hoveredFencerIds}
          waveHighlightPairs={waveHighlightPairs}
          onHoverCell={quickMouseScoring || simplifiedInputMode ? handleHoverCell : undefined}
          onHoverLeave={quickMouseScoring || simplifiedInputMode ? handleHoverLeave : undefined}
          onWheelScore={quickMouseScoring ? handleWheelScore : undefined}
          simplifiedInputMode={simplifiedInputMode}
          inlineEditKey={inlineEditCell?.key ?? null}
          inlineSingleScore={inlineSingleScore}
          cellScoreBuffer={cellScoreBuffer}
          onInlineSingleScoreChange={setInlineSingleScore}
          onInlineSubmit={handleInlineSubmit}
          onInlineCancel={handleInlineCancel}
        />
      </div>
      {orderedMatches.finished.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowFinishedLog(v => !v)}
            aria-expanded={showFinishedLog}
            style={LOG_TOGGLE}
          >
            <span
              style={{
                transition: 'transform 0.15s',
                transform: showFinishedLog ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <Icon icon={Play} />
            </span>
            {t('poolView.finished_log', { count: orderedMatches.finished.length })}
          </button>
          {showFinishedLog && (
            <div style={LOG_WRAP}>
              {orderedMatches.finished.map(({ match }) => (
                <button
                  key={match.id}
                  onClick={() => setAuditMatchId(match.id)}
                  style={LOG_ITEM}
                  title={t('poolView.view_match_log')}
                >
                  <Icon icon={ClipboardList} /> {match.fencerA?.lastName} {t('poolView.vs')}{' '}
                  {match.fencerB?.lastName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Composant Prochain Match réutilisable
  const renderNextMatch = () => {
    if (orderedMatches.pending.length === 0) return null;

    const nextMatch = orderedMatches.pending[0];

    // Vérifier si l'un des tireurs a abandonné
    const fencerAAbandoned =
      nextMatch.match.fencerA?.status === FencerStatus.ABANDONED ||
      nextMatch.match.fencerA?.status === FencerStatus.FORFAIT ||
      nextMatch.match.fencerA?.status === FencerStatus.EXCLUDED;
    const fencerBAbandoned =
      nextMatch.match.fencerB?.status === FencerStatus.ABANDONED ||
      nextMatch.match.fencerB?.status === FencerStatus.FORFAIT ||
      nextMatch.match.fencerB?.status === FencerStatus.EXCLUDED;
    const isAbandonMatch = fencerAAbandoned || fencerBAbandoned;

    if (isAbandonMatch) {
      return (
        <div style={{ ...NEXT_MATCH_BOX, background: '#6b7280', opacity: 0.7 }}>
          <div style={ROW_BETWEEN}>
            <div style={MATCH_LABEL}>{t('poolView.not_fenced')}</div>
            <div style={MATCH_CENTER}>
              <span style={abandonName(fencerAAbandoned)}>
                {nextMatch.match.fencerA?.lastName} {nextMatch.match.fencerA?.firstName?.charAt(0)}.
                {fencerAAbandoned && ' ✕'}
              </span>
              <span style={VS}>{t('poolView.vs')}</span>
              <span style={abandonName(fencerBAbandoned)}>
                {nextMatch.match.fencerB?.lastName} {nextMatch.match.fencerB?.firstName?.charAt(0)}.
                {fencerBAbandoned && ' ✕'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          ...NEXT_MATCH_BOX,
          background:
            'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
        }}
      >
        <div style={ROW_BETWEEN}>
          <div style={MATCH_LABEL}>{t('poolView.next_match')}</div>
          <div style={MATCH_CENTER}>
            <span style={FENCER_NAME}>
              {nextMatch.match.fencerA?.lastName} {nextMatch.match.fencerA?.firstName?.charAt(0)}.
              {nextMatch.match.fencerA?.ranking && ` #${nextMatch.match.fencerA.ranking}`}
            </span>
            <span style={VS}>{t('poolView.vs')}</span>
            <span style={FENCER_NAME}>
              {nextMatch.match.fencerB?.lastName} {nextMatch.match.fencerB?.firstName?.charAt(0)}.
              {nextMatch.match.fencerB?.ranking && ` #${nextMatch.match.fencerB.ranking}`}
            </span>
          </div>
          <button onClick={() => openScoreModal(nextMatch.index)} style={NEXT_MATCH_SUBMIT}>
            {t('poolView.enter')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="card">
        <Confetti active={showPoolConfetti} particleCount={100} origin={{ x: 0.5, y: 0.5 }} />
        {isLocked && <div style={LOCKED_BANNER}>{t('poolView.locked')}</div>}
        <div className="card-header pv-header">
          <div className="pv-header-left">
            <span>{t('poolView.pool_n', { n: pool.number })}</span>
            <span className={`badge ${pool.isComplete ? 'badge-success' : 'badge-warning'}`}>
              {pool.isComplete ? t('poolView.finished') : `${finishedCount}/${totalMatches}`}
            </span>
            {!pool.isComplete && totalMatches > 0 && (
              <div className="pv-progress">
                <div className="pv-progress-track">
                  <div
                    className={`pv-progress-bar${finishedCount / totalMatches >= 0.7 ? ' is-high' : ''}`}
                    style={{ width: `${(finishedCount / totalMatches) * 100}%` }}
                  />
                </div>
                <span className="pv-progress-label">
                  {finishedCount}/{totalMatches}
                </span>
              </div>
            )}
            {(() => {
              const total = pool.fencers.length;
              const signed = signedFencerIds.filter(id =>
                pool.fencers.some(f => f.id === id)
              ).length;
              const allSigned = signed === total && total > 0;
              const noneSigned = signed === 0;
              return (
                <span
                  title={
                    allSigned
                      ? t('poolView.all_signed')
                      : t('plural.signatures', { signed, count: total })
                  }
                  className={`pv-pill${allSigned ? ' is-done' : noneSigned ? '' : ' is-partial'}`}
                >
                  <Icon icon={PenLine} /> {signed}/{total}
                </span>
              );
            })()}
            <button
              onClick={openRefereeModal}
              title={
                assignedReferees.length > 0
                  ? t('poolView.referees_title', {
                      count: assignedReferees.length,
                      list: assignedReferees.map(r => `${r.lastName} ${r.firstName}`).join(', '),
                    })
                  : isMultiReferee
                    ? t('poolView.assign_referees')
                    : t('poolView.assign_referee')
              }
              className={`pv-pill${assignedReferee ? ' is-assigned' : ''}`}
            >
              <Icon icon={Gavel} />{' '}
              {assignedReferees.length > 0
                ? assignedReferees.map(r => r.lastName).join(' / ')
                : t('poolView.add_referee')}
            </button>
            {stripRange && onStripChange && (
              <PoolStripButton
                poolNumber={pool.number}
                strip={pool.strip}
                stripRange={stripRange}
                onChange={strip => onStripChange(pool.id, strip)}
              />
            )}
          </div>
          <div className="pv-toolbar">
            <TipButton
              onClick={undo}
              disabled={!canUndo}
              className="pv-icon-btn is-gray"
              tip={t('poolView.undo_title')}
              aria-label={t('poolView.undo_aria')}
            >
              <Icon icon={Undo2} />
            </TipButton>
            <TipButton
              onClick={redo}
              disabled={!canRedo}
              className="pv-icon-btn is-gray"
              tip={t('poolView.redo_title')}
              aria-label={t('poolView.redo_aria')}
            >
              <Icon icon={Redo2} />
            </TipButton>
            <TipButton
              onClick={handleAutoFillScores}
              className="pv-icon-btn is-amber"
              tip={t('poolView.autofill')}
            >
              <Icon icon={Dices} />
            </TipButton>
            <TipButton
              onClick={handlePrintPool}
              className="pv-icon-btn is-primary"
              tip={t('poolView.print_title')}
              aria-label={t('poolView.print_aria')}
            >
              <Icon icon={Printer} />
            </TipButton>
            {pool.isComplete && isRemoteActive && remoteServerUrl && (
              <TipButton
                onClick={() => {
                  const url = `${remoteServerUrl}/arene${defaultArena}/poule`;
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                className="pv-icon-btn is-indigo"
                tip={t('poolView.signatures_title', { arena: defaultArena })}
                aria-label={t('poolView.signatures')}
              >
                <Icon icon={PenLine} />
              </TipButton>
            )}
            {competitionId && (
              <TipButton
                onClick={() => setShowAddFencerModal(true)}
                className="pv-icon-btn"
                tip={t('poolView.add_fencer')}
                aria-label={t('poolView.add_fencer')}
              >
                <Icon icon={Plus} />
              </TipButton>
            )}
            <div style={RELATIVE} ref={columnMenuRef}>
              <TipButton
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className={`pv-icon-btn${showColumnMenu ? ' is-open' : ''}${columnFilterEdited ? ' is-edited' : ''}`}
                tip={columnFilterEdited ? t('poolView.columns_edited') : t('poolView.columns')}
                aria-label={t('poolView.columns')}
              >
                <Funnel size={14} />
              </TipButton>
              {showColumnMenu && (
                <div style={COL_MENU}>
                  <div style={COL_MENU_HEADER}>{t('poolView.columns_shown')}</div>
                  {POOL_COLUMNS.filter(col => col.id !== 'quest' || isLaserSabre).map(col => (
                    <label key={col.id} className="pv-col-menu-label">
                      <input
                        type="checkbox"
                        checked={isVisible(col.id)}
                        onChange={() => toggleColumn('pool', col.id, pool.id)}
                        className="cursor-pointer"
                      />
                      {t(`poolColumns.col_${col.id}`)}
                    </label>
                  ))}
                  <div className="pv-col-menu-section" style={COL_MENU_HEADER}>
                    {t('poolView.pdf_print')}
                  </div>
                  <label className="pv-col-menu-label">
                    <input
                      type="checkbox"
                      checked={pdfHideStatColumns}
                      onChange={togglePdfHideStatColumns}
                      className="cursor-pointer"
                    />
                    {t('poolView.hide_stats')}
                  </label>
                  <label className="pv-col-menu-label">
                    <input
                      type="checkbox"
                      checked={pdfLandscape}
                      onChange={togglePdfLandscape}
                      className="cursor-pointer"
                    />
                    {t('poolView.landscape')}
                  </label>
                </div>
              )}
            </div>
            <TipButton
              type="button"
              role="switch"
              aria-checked={viewMode === 'matches'}
              aria-label={t('poolView.matches_view')}
              onClick={() => setViewMode(viewMode === 'grid' ? 'matches' : 'grid')}
              className={`pv-view-switch${viewMode === 'matches' ? ' is-matches' : ''}`}
              tip={viewMode === 'grid' ? t('poolView.matches_view') : t('poolView.grid_view')}
            >
              <span className="pv-view-switch-icon" aria-hidden="true">
                <Icon icon={ChartColumn} />
              </span>
              <span className="pv-view-switch-icon" aria-hidden="true">
                <Icon icon={Swords} />
              </span>
              <span className="pv-view-switch-thumb" aria-hidden="true" />
            </TipButton>
          </div>
        </div>
        <div className="card-body pv-body">
          {viewMode === 'grid' ? (
            <>
              {renderGridView()}
              {renderNextMatch()}
            </>
          ) : (
            <PoolMatchList
              orderedMatches={orderedMatches}
              isLaserSabre={isLaserSabre}
              isLocked={isLocked}
              openScoreModal={openScoreModal}
              onMatchReset={onMatchReset ? handleMatchDelete : undefined}
              onShowMatchAudit={setAuditMatchId}
              defaultArena={defaultArena}
              stripRange={stripRange}
              arenas={arenas}
              isRemoteActive={isRemoteActive}
              matchArenaOverrides={matchArenaOverrides}
              cardScale={cardScale}
              waveMatchIds={waveMatchIds}
              onMatchArenaChange={handleMatchArenaChange}
            />
          )}
          {renderScoreModal()}
        </div>
      </div>
      {showAddFencerModal && competitionId && (
        <AddFencerToPoolModal
          pool={pool}
          competitionId={competitionId}
          maxScore={maxScore}
          assignedFencerIds={assignedFencerIds}
          onConfirm={updatedPool => {
            setShowAddFencerModal(false);
            onFencerAdded?.(updatedPool);
          }}
          onClose={() => setShowAddFencerModal(false)}
        />
      )}
      {auditMatchId && (
        <React.Suspense fallback={null}>
          <MatchAuditLog matchId={auditMatchId} onClose={() => setAuditMatchId(null)} />
        </React.Suspense>
      )}
      {showRefereeModal && (
        <PoolRefereeModal
          poolNumber={pool.number}
          isMultiReferee={isMultiReferee}
          maxRefereesPerPool={maxRefereesPerPool}
          assignedReferee={assignedReferee}
          competitionReferees={competitionReferees}
          isLoadingReferees={isLoadingReferees}
          pendingRefereeIds={pendingRefereeIds}
          onClose={closeRefereeModal}
          onAssign={handleAssignReferee}
          onToggle={togglePendingReferee}
          onConfirm={confirmPendingReferees}
        />
      )}
    </>
  );
};

const PoolView = React.memo(PoolViewComponent);
export default PoolView;
