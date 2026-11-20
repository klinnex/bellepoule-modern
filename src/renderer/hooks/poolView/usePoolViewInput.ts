/**
 * BellePoule Modern - Saisie des scores de poule : ordre des matchs, modale de score, navigation clavier et molette
 * Licensed under GPL-3.0
 */

import { useMemo, useEffect, useRef } from 'react';
import { nextChainedPair } from '../../components/pool/poolChainedInput';
import { useModalResize } from '../useModalResize';
import { useFocusTrap } from '../useFocusTrap';
import { Fencer, MatchStatus, FencerStatus } from '../../../shared/types';
import { inlineCellText } from '../../../shared/utils/inlineScoreInput';
import type { PoolViewProps } from '../../components/pool/poolViewTypes';
import { usePoolViewState } from './usePoolViewState';

type Ctx = PoolViewProps & ReturnType<typeof usePoolViewState>;

/** Saisie des scores de poule : ordre des matchs, modale de score, navigation clavier et molette (extrait de PoolViewComponent, #1599) */
export function usePoolViewInput(ctx: Ctx) {
  const {
    pool,
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
    isLocked,
    undo,
    redo,
    simplifiedInputMode,
    chainedInputMode,
    hoveredFencerIds,
    fencers,
    handleMatchDelete,
    isLaserSabre,
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
    maxScore,
    setInlineEditCell,
    setInlineSingleScore,
    cellScoreBuffer,
  } = ctx;

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

  /** Saisie enchaînée : la modale est ouverte depuis une case de la matrice (et le réglage est actif) */
  const chainedRef = useRef(false);

  /** Tireur hors poule (abandon, forfait, exclusion) : case non saisissable */
  const isOutOfPool = (f: Fencer) =>
    f.status === FencerStatus.ABANDONED ||
    f.status === FencerStatus.FORFAIT ||
    f.status === FencerStatus.EXCLUDED;

  /** Case suivante après le match `matchIdx` (ligne par ligne, au-dessus de la diagonale), ou null */
  const findChainedNext = (matchIdx: number) => {
    const m = pool.matches[matchIdx];
    if (!m?.fencerA || !m?.fencerB) return null;
    const ia = fencers.findIndex(f => f.id === m.fencerA!.id);
    const ib = fencers.findIndex(f => f.id === m.fencerB!.id);
    if (ia < 0 || ib < 0) return null;
    const isPlayable = ({ rowIdx, colIdx }: { rowIdx: number; colIdx: number }) => {
      const rowF = fencers[rowIdx];
      const colF = fencers[colIdx];
      if (isOutOfPool(rowF) || isOutOfPool(colF)) return false;
      const idx = getMatchIndex(rowF, colF);
      return idx !== -1 && pool.matches[idx].status !== MatchStatus.CANCELLED;
    };
    const pair = nextChainedPair(
      fencers.length,
      { rowIdx: Math.min(ia, ib), colIdx: Math.max(ia, ib) },
      isPlayable
    );
    if (!pair) return null;
    const rowF = fencers[pair.rowIdx];
    const colF = fencers[pair.colIdx];
    const matchIndex = getMatchIndex(rowF, colF);
    // Même convention que handleCellClick : tireur de ligne à gauche
    return { matchIndex, inverted: pool.matches[matchIndex].fencerA?.id === colF.id };
  };

  /** Score validé : ferme la modale, puis ouvre la case suivante si la saisie enchaînée est active */
  const finishScoreEntry = (matchIdx: number) => {
    const continueChain = chainedRef.current && chainedInputMode;
    closeAndResetScoreModal();
    if (!continueChain) return;
    const next = findChainedNext(matchIdx);
    if (next) openScoreModal(next.matchIndex, next.inverted, true);
  };

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
    finishScoreEntry(matchIdx);
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

  const openScoreModal = (matchIndex: number, inverted = false, chained = false) => {
    const match = pool.matches[matchIndex];
    chainedRef.current = chained;
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
        // Les matchs terminés restent visités : Tab repasse sur chaque case, modifiable
        if (match.status === MatchStatus.CANCELLED) continue;
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

  /** Case suivante (ou précédente avec `backward`, Maj+Tab) dans l'ordre de la matrice */
  const openNextCell = (
    currentKey: string,
    skipKeys: Set<string>,
    buffer: Record<string, number>,
    backward = false
  ) => {
    const cells = getOrderedCells();
    const currentIndex = cells.findIndex(c => c.key === currentKey);
    const step = backward ? -1 : 1;
    const startFrom = currentIndex === -1 ? (backward ? cells.length - 1 : 0) : currentIndex + step;
    for (let i = startFrom; i >= 0 && i < cells.length; i += step) {
      if (!skipKeys.has(cells[i].key)) {
        const next = cells[i];
        const initial = cellInitialText(next.key, next.matchIndex, next.inverted, buffer);
        setInlineEditCell({
          key: next.key,
          rowId: next.rowFencer.id,
          colId: next.colFencer.id,
          matchIndex: next.matchIndex,
          inverted: next.inverted,
          initial,
        });
        setInlineSingleScore(initial);
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

  // Texte proposé dans une case : score en attente, sinon score enregistré (« V », « W3 », nombre)
  const cellInitialText = (
    key: string,
    matchIndex: number,
    inverted: boolean,
    buffer: Record<string, number>
  ): string => {
    if (buffer[key] !== undefined) return String(buffer[key]);
    const match = pool.matches[matchIndex];
    if (!match || match.status !== MatchStatus.FINISHED) return '';
    const own = inverted ? match.scoreB : match.scoreA;
    const other = inverted ? match.scoreA : match.scoreB;
    if (own?.value == null) return '';
    return inlineCellText({
      value: own.value,
      isVictory: !!own.isVictory,
      opponent: other?.value ?? -1,
      maxScore: maxScore || match.maxScore || 0,
      isLaserSabre,
    });
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
      const initial = cellInitialText(key, matchIndex, inverted, cellScoreBuffer);
      setInlineEditCell({
        key,
        rowId: rowFencer.id,
        colId: colFencer.id,
        matchIndex,
        inverted,
        initial,
      });
      setInlineSingleScore(initial);
      return;
    }
    openScoreModal(matchIndex, inverted, chainedInputMode);
  };

  return {
    orderedMatches,
    getMatchIndex,
    modalRef,
    closeAndResetScoreModal,
    commitTie,
    chooseTieWinner,
    scoreTrapRef,
    openScoreModal,
    finishScoreEntry,
    handleHoverCell,
    handleHoverLeave,
    handleWheelScore,
    openNextCell,
    getRecordedCellScore,
    handleCellClick,
  };
}
