/**
 * BellePoule Modern - Tableau View Component
 * Direct Elimination Table
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Fencer, FencerStatus, PoolRanking } from '../../shared/types';
export { TableauMatch, FinalResult, ConsolationBracket, propagateWinners } from './tableau/tableauTypes';
import { TableauMatch, FinalResult, ConsolationBracket, propagateWinners, deriveFirstRound, isBracketComplete } from './tableau/tableauTypes';
import { useToast } from './Toast';
import { useModalResize } from '../hooks/useModalResize';
import Bracket from './Bracket';
// pdfExport (jsPDF) chargé à la demande ; seule la constante reste en import statique léger
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../../shared/utils/pdfConstants';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import MatchCard from './tableau/MatchCard';
import SeedingTable from './tableau/SeedingTable';
import TableauScoreModal from './tableau/TableauScoreModal';
import TableauPendingSection from './tableau/TableauPendingSection';
import TableauToolbar from './tableau/TableauToolbar';
import TableauPdfModal from './tableau/TableauPdfModal';
import TableauArenaModal from './tableau/TableauArenaModal';
import TableauRefereeModal from './tableau/TableauRefereeModal';
import TableauSignaturesModal from './tableau/TableauSignaturesModal';
import ConsolationBracketsSection from './tableau/ConsolationBracketsSection';
import {
  BASE_MATCH_HEIGHT,
  SLOT_HEIGHT,
  getTableauSize,
  getRoundName,
  buildTableauMatches,
  autoFillTableauScores,
  autoFillAllPositions,
  placeBarrageWinners,
  syncConsolationBrackets,
  calculateFinalResults,
  buildCombinedResults,
  calculateMatchVerticalPosition,
} from './tableau/tableauCalculations';

interface BracketMatch {
  id: string;
  round: number;
  position: number;
  fencerA: Fencer | null;
  fencerB: Fencer | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId?: string;
  isBye?: boolean;
}


interface TableauViewProps {
  ranking: PoolRanking[];
  matches: TableauMatch[];
  onMatchesChange: (matches: TableauMatch[]) => void;
  maxScore?: number;
  onComplete?: (results: FinalResult[]) => void;
  thirdPlaceMatch?: boolean;
  playAllPositions?: boolean;
  arenaCount?: number;
  onMatchArenaChange?: (matchId: string, oldArena: number | null, newArena: number | null, fencerA?: any, fencerB?: any) => void;
  onMatchRefereeChange?: (matchId: string, refereeId: string | null) => void;
  competitionId?: string;
  consolationBrackets?: ConsolationBracket[];
  onConsolationBracketsChange?: (brackets: ConsolationBracket[]) => void;
  readOnly?: boolean;
  /** Nombre max d'arbitres par match (mode expert) ; 1 = sélection unique */
  maxRefereesPerMatch?: number;
}

// ─── Static style constants ───────────────────────────────────────────────────

const TV_STYLES = {
  root: { padding: '1rem' } satisfies React.CSSProperties,
  scrollArea: { padding: '1rem', background: '#f9fafb', borderRadius: '8px', maxHeight: '70vh', overflowY: 'auto' as const } satisfies React.CSSProperties,
  pendingOrderRow: { marginBottom: '0.75rem', display: 'flex', justifyContent: 'flex-end' as const } satisfies React.CSSProperties,
  pendingOrderBtn: { background: '#e5e7eb', border: 'none', padding: '0.375rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.25rem' } satisfies React.CSSProperties,
  summaryBox: { marginTop: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '8px' } satisfies React.CSSProperties,
  summaryTitle: { fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' } satisfies React.CSSProperties,
  summaryFlex: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' } satisfies React.CSSProperties,
  summaryItemBase: { padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid #e5e7eb' } satisfies React.CSSProperties,
  pendingEmpty: { padding: '2rem', textAlign: 'center' as const, color: '#6b7280' } satisfies React.CSSProperties,
  roundCol: { display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-start', minWidth: '200px' } satisfies React.CSSProperties,
  roundHeader: { textAlign: 'center' as const, fontWeight: '600', marginBottom: '0.5rem', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', userSelect: 'none' as const } satisfies React.CSSProperties,
  roundHeaderChevron: { fontSize: '1rem', fontWeight: 'bold', marginRight: '0.25rem' } satisfies React.CSSProperties,
  fullRoundsRow: { display: 'flex', gap: '1rem', overflowX: 'auto' as const } satisfies React.CSSProperties,
  barragesBox: { marginBottom: '1rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' } satisfies React.CSSProperties,
  barragesTitle: { fontWeight: 600, marginBottom: '0.5rem', color: '#1e40af' } satisfies React.CSSProperties,
  barragesFlex: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const TableauViewComponent: React.FC<TableauViewProps> = ({
  ranking,
  matches,
  onMatchesChange,
  maxScore = 15,
  onComplete,
  thirdPlaceMatch = false,
  playAllPositions = false,
  arenaCount = 4,
  onMatchArenaChange,
  onMatchRefereeChange,
  competitionId,
  consolationBrackets: consolationBracketsprop = [],
  onConsolationBracketsChange,
  readOnly = false,
  maxRefereesPerMatch = 1,
}) => {
  const { showToast } = useToast();
  const tableauTemplate = usePdfTemplateStore(s => s.templates.tableau);
  const [tableauSize, setTableauSize] = useState<number>(0);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [editingConsolationId, setEditingConsolationId] = useState<string | null>(null);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [editScoreA, setEditScoreA] = useState<string>('');
  const [editScoreB, setEditScoreB] = useState<string>('');
  const [victoryA, setVictoryA] = useState(false);
  const [victoryB, setVictoryB] = useState(false);
  const [viewMode, setViewMode] = useState<'full' | 'pending'>('full');
  const [pendingOrder, setPendingOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [selectedMatchForArena, setSelectedMatchForArena] = useState<string | null>(null);
  const [showRefereeModal, setShowRefereeModal] = useState(false);
  const [signaturesMatch, setSignaturesMatch] = useState<TableauMatch | null>(null);
  const [selectedMatchForReferee, setSelectedMatchForReferee] = useState<string | null>(null);
  const [competitionReferees, setCompetitionReferees] = useState<Array<{ id: string; firstName: string; lastName: string; club?: string }>>([]);
  const [selectedMatchConsolationBracketId, setSelectedMatchConsolationBracketId] = useState<string | null>(null);
  const [pyramidViewMode, setPyramidViewMode] = useState<boolean>(false);
  // Zoom / pan state (vue bracket full uniquement)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // SVG connector measures
  const colRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const bracketWrapRef = useRef<HTMLDivElement | null>(null);
  const [colMeasures, setColMeasures] = useState<Map<number, { left: number; width: number }>>(new Map());
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfMode, setPdfMode] = useState<'print' | 'pdf' | 'preview'>('pdf');
  const [pdfMatchesPerPage, setPdfMatchesPerPage] = useState<number>(MAX_MATCHES_PER_PAGE_TABLEAU);
  const [selectedRounds, setSelectedRounds] = useState<Set<number>>(new Set());
  const [autoAssignArenas, setAutoAssignArenas] = useState(false);
  // Mesure les positions des colonnes pour les connecteurs SVG
  useLayoutEffect(() => {
    if (viewMode !== 'full' || pyramidViewMode || !bracketWrapRef.current) return;
    const wrapLeft = bracketWrapRef.current.getBoundingClientRect().left;
    const measures = new Map<number, { left: number; width: number }>();
    colRefs.current.forEach((el, round) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        measures.set(round, { left: rect.left - wrapLeft, width: rect.width });
      }
    });
    // Updater fonctionnel : retourne prev si valeurs identiques → évite re-render inutile
    setColMeasures(prev => {
      if (prev.size !== measures.size) return measures;
      for (const [round, { left, width }] of measures) {
        const p = prev.get(round);
        if (!p || p.left !== left || p.width !== width) return measures;
      }
      return prev;
    });
  }, [viewMode, pyramidViewMode, tableauSize]);

  // Remet à zéro le zoom/pan si on change de mode
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [viewMode, pyramidViewMode]);

  // Listener natif non-passif : le onWheel React est passif, preventDefault y est ignoré
  // et la page entière défilait au lieu du tableau.
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el || viewMode !== 'full' || pyramidViewMode) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      setPan(p => ({ x: p.x - dx, y: p.y - dy }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewMode, pyramidViewMode]);

  const handleBracketMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || viewMode !== 'full' || pyramidViewMode) return;
    // Only pan on background (not on match cards)
    if ((e.target as HTMLElement).closest('.match-card')) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [viewMode, pyramidViewMode, pan]);

  const handleBracketMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    });
  }, []);

  const handleBracketMouseUp = useCallback(() => { isPanningRef.current = false; }, []);

  // Connecteurs SVG entre les MatchCards
  const svgConnectors = useMemo(() => {
    if (viewMode !== 'full' || pyramidViewMode || colMeasures.size === 0 || tableauSize === 0) return null;
    const totalH = (tableauSize / 2) * SLOT_HEIGHT;
    const paths: React.ReactNode[] = [];

    for (const match of matches) {
      if (match.round <= 2 || match.round === 3) continue; // pas de parent pour la finale/petite-finale
      const parentRound = match.round / 2;
      const parentPos = Math.floor(match.position / 2);

      const childMeasure = colMeasures.get(match.round);
      const parentMeasure = colMeasures.get(parentRound);
      if (!childMeasure || !parentMeasure) continue;

      const childRight = childMeasure.left + childMeasure.width;
      const parentLeft = parentMeasure.left;
      const midX = (childRight + parentLeft) / 2;

      const childY = calculateMatchVerticalPosition(match.round, match.position, tableauSize) + BASE_MATCH_HEIGHT / 2;
      const parentY = calculateMatchVerticalPosition(parentRound, parentPos, tableauSize) + BASE_MATCH_HEIGHT / 2;

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
  }, [viewMode, pyramidViewMode, colMeasures, matches, tableauSize]);

  const isUnlimitedScore = maxScore === 999;
  const prevMatchesLengthRef = useRef(0);
  const mountMatchesRef = useRef(matches);
  const consolationBrackets = consolationBracketsprop;
  const setConsolationBrackets = (updater: ConsolationBracket[] | ((prev: ConsolationBracket[]) => ConsolationBracket[])) => {
    const next = typeof updater === 'function' ? updater(consolationBrackets) : updater;
    onConsolationBracketsChange?.(next);
  };

  const { modalRef } = useModalResize({
    defaultWidth: 600,
    defaultHeight: 400,
    minWidth: 400,
    minHeight: 300,
  });

  const distributeArenasRoundRobin = useCallback(
    (matchList: TableauMatch[]): TableauMatch[] => {
      if (arenaCount <= 0) return matchList;
      let arenaIdx = 0;
      return matchList.map(m => {
        if (m.fencerA && m.fencerB && !m.isBye && !m.winner) {
          const arena = (arenaIdx % arenaCount) + 1;
          arenaIdx++;
          return { ...m, arena };
        }
        return m;
      });
    },
    [arenaCount]
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
      updated.forEach(m => {
        const orig = matches.find(o => o.id === m.id);
        if (orig && orig.arena !== m.arena) {
          onMatchArenaChange?.(m.id, orig.arena ?? null, m.arena ?? null);
        }
      });
    } else if (playable.length > prev) {
      // Nouveau tour débloqué (ex. SF après QF) : assigner les pistes uniquement aux
      // matchs qui n'en ont pas encore, sans écraser les affectations manuelles.
      const unassigned = matches.filter(m => m.fencerA && m.fencerB && !m.isBye && !m.winner && !m.arena);
      if (unassigned.length > 0) {
        let arenaIdx = 0;
        const updated = matches.map(m => {
          if (m.fencerA && m.fencerB && !m.isBye && !m.winner && !m.arena) {
            const arena = (arenaIdx % arenaCount) + 1;
            arenaIdx++;
            return { ...m, arena };
          }
          return m;
        });
        onMatchesChange(updated);
        updated.forEach(m => {
          const orig = matches.find(o => o.id === m.id);
          if (orig && orig.arena !== m.arena) {
            onMatchArenaChange?.(m.id, orig.arena ?? null, m.arena ?? null);
          }
        });
      }
    }
  }, [playableMatchCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoAssignToggle = useCallback(
    (enabled: boolean) => {
      setAutoAssignArenas(enabled);
      if (enabled && arenaCount > 0) {
        const updated = distributeArenasRoundRobin(matches);
        onMatchesChange(updated);
        updated.forEach(m => {
          const orig = matches.find(o => o.id === m.id);
          if (orig && orig.arena !== m.arena) {
            onMatchArenaChange?.(m.id, orig.arena ?? null, m.arena ?? null);
          }
        });
      } else if (!enabled) {
        // Désactivation : vider les assignations des matchs non encore joués
        const updated = matches.map(m =>
          !m.winner ? ({ ...m, arena: null as number | null }) : m
        );
        onMatchesChange(updated);
        matches.forEach(m => {
          if (m.arena != null && !m.winner) {
            onMatchArenaChange?.(m.id, m.arena, null);
          }
        });
      }
    },
    [arenaCount, distributeArenasRoundRobin, matches, onMatchesChange, onMatchArenaChange]
  );

  const handleBulkDeassign = useCallback(() => {
    const updated = matches.map(m => ({ ...m, arena: null as number | null }));
    onMatchesChange(updated);
    matches.forEach(m => {
      if (m.arena != null) {
        onMatchArenaChange?.(m.id, m.arena, null);
      }
    });
  }, [matches, onMatchesChange, onMatchArenaChange]);

  useEffect(() => {
    if (readOnly) {
      // En lecture seule, ne pas régénérer le tableau, mais déduire sa taille
      // des matches existants pour permettre l'affichage des rounds.
      if (matches.length > 0) {
        // deriveFirstRound écarte le round de barrage (mainSize*2) : sinon la taille
        // serait surévaluée à mainSize*2 et l'affichage des tours serait faussé.
        setTableauSize(deriveFirstRound(matches));
      }
      return;
    }
    const eligibleCount = ranking.filter(
      r =>
        r.fencer.status !== FencerStatus.ABANDONED &&
        r.fencer.status !== FencerStatus.FORFAIT &&
        r.fencer.status !== FencerStatus.EXCLUDED
    ).length;
    if (eligibleCount > 0) {
      const expectedSize = getMainTableauSize(eligibleCount);
      // deriveFirstRound écarte le round de barrage (mainSize*2) et la petite finale.
      // Avec un Math.max naïf, un tableau avec barrages restauré (tab switch) donnait
      // currentSize = mainSize*2 ≠ expectedSize → regénération qui effaçait les scores saisis.
      const currentSize = matches.length > 0 ? deriveFirstRound(matches) : 0;

      const hasThirdPlace = matches.some(m => m.round === 3);
      const thirdPlaceMismatch = thirdPlaceMatch !== hasThirdPlace;

      if (matches.length === 0 || currentSize !== expectedSize || thirdPlaceMismatch) {
        generateTableau();
      } else {
        setTableauSize(currentSize);
      }
    }
  }, [readOnly, ranking.length, thirdPlaceMatch, maxScore, matches.length]); // Dépend du nombre de tireurs, match pour la 3ème place et score max

  // Filet de sécurité : détecte la complétion du tableau à chaque mise à jour de matches
  // Couvre les chemins qui ne passent pas par handleScoreSubmit (saisie distante, statuts spéciaux)
  useEffect(() => {
    if (readOnly) return;
    // Ignorer si matches n'a pas changé depuis le montage du composant.
    // Robuste au double-invoke de React StrictMode : le ref de montage reste stable
    // entre les deux passes, contrairement à un booléen consommé au premier run.
    if (matches === mountMatchesRef.current) return;
    if (readOnly || matches.length === 0 || !onComplete) return;
    const champion = matches.find(m => m.round === 2)?.winner;
    if (!champion) return;
    const thirdPlaceEntry = matches.find(m => m.round === 3);
    const thirdPlaceDone = !thirdPlaceEntry || !!thirdPlaceEntry.winner;
    if (thirdPlaceDone && !playAllPositions) {
      onComplete(calculateFinalResults(matches, ranking, tableauSize));
    }
    // calculateFinalResults et onComplete sont stables pendant la phase tableau
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, readOnly]);

  // NB : la synchronisation tablette → tableau (event match:finished) est gérée
  // de façon centralisée par applyRemoteScore dans CompetitionView, qui fonctionne
  // quel que soit l'onglet affiché. On ne s'abonne PLUS ici pour éviter une double
  // mise à jour concurrente qui écrasait le vainqueur (course value vs functional).
  // La complétion du tableau est détectée par le filet de sécurité ci-dessus.

  // playAllPositions : déclencher onComplete quand le tableau principal ET tous les brackets de consolation sont terminés
  useEffect(() => {
    if (readOnly || !playAllPositions || !onComplete || matches.length === 0) return;
    // NB : pas de garde « matches === mountMatchesRef » ici. La dernière saisie qui
    // complète le classement est souvent un match de bracket de consolation, qui ne
    // modifie PAS `matches`. Après un changement d'onglet (remontage), `matches` est
    // identique au montage : la garde bloquait alors onComplete et l'étape tableau ne
    // se validait jamais. Le cas « déjà complet restauré depuis DB » est couvert par
    // le garde readOnly (finalResults.length > 0 ⇒ readOnly) en amont.
    const mainFinalDone = !!matches.find(m => m.round === 2)?.winner;
    const mainThirdEntry = matches.find(m => m.round === 3);
    const mainThirdDone = !mainThirdEntry || !!mainThirdEntry.winner;
    if (!mainFinalDone || !mainThirdDone) return;
    // Des brackets de consolation sont attendus quand tableauSize >= 8 (rounds > 4)
    // ou quand il y a des barrages. Pour tableauSize <= 4, aucun bracket de consolation
    // n'est créé (les demi-finalistes perdants vont directement à la petite finale).
    const hasBarrages = matches.some(m => m.round === tableauSize * 2);
    const needsConsolation = tableauSize >= 8 || hasBarrages;
    if (needsConsolation && consolationBrackets.length === 0) return; // pas encore créés
    if (consolationBrackets.some(b => !b.isComplete)) return;
    onComplete(buildCombinedResults(matches, consolationBrackets, ranking));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, consolationBrackets, playAllPositions]);

  // Mode playAllPositions : créer les brackets de consolation quand un round du tableau principal se complète
  useEffect(() => {
    if (!playAllPositions || matches.length === 0) return;
    setConsolationBrackets(prevBrackets =>
      syncConsolationBrackets(matches, prevBrackets, tableauSize, ranking).brackets
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, tableauSize, playAllPositions]);

  // Gagnants des barrages → placer dans le tableau principal
  useEffect(() => {
    if (!playAllPositions || tableauSize === 0) return;
    const updatedMatches = matches.map(m => ({ ...m }));
    if (placeBarrageWinners(updatedMatches, tableauSize)) onMatchesChange(updatedMatches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.filter(m => m.round === tableauSize * 2).map(m => m.winner?.id).join(','), tableauSize]);

  // Pour playAllPositions : plus grande puissance de 2 ≤ fencerCount
  const getMainTableauSize = (fencerCount: number): number => {
    if (!playAllPositions) return getTableauSize(fencerCount);
    const sizes = [4, 8, 16, 32, 64, 128, 256];
    let result = 4;
    for (const size of sizes) {
      if (size <= fencerCount) result = size;
    }
    return result;
  };

  const getEligibleFencers = (): PoolRanking[] =>
    ranking.filter(
      r =>
        r.fencer.status !== FencerStatus.ABANDONED &&
        r.fencer.status !== FencerStatus.FORFAIT &&
        r.fencer.status !== FencerStatus.EXCLUDED
    );

  const generateTableau = () => {
    const qualifiedFencers = getEligibleFencers().sort((a, b) => a.rank - b.rank);
    const mainSize = getMainTableauSize(qualifiedFencers.length);

    setTableauSize(mainSize);
    setConsolationBrackets([]); // réinitialiser les brackets de consolation

    // Barrages éventuels + premier tour + rounds suivants + petite finale + propagation des byes
    const newMatches = buildTableauMatches(
      qualifiedFencers,
      mainSize,
      playAllPositions,
      thirdPlaceMatch
    );
    onMatchesChange(newMatches);
  };

  const handleAutoFillScores = () => {
    if (readOnly) return;
    const confirmed = window.confirm(
      'Remplir automatiquement tous les scores des matchs non terminés ?\n\nLes scores seront générés aléatoirement pour les tests.'
    );

    if (!confirmed) return;

    const effectiveMax = isUnlimitedScore ? 15 : maxScore;

    // Toutes les places : barrages + tableau principal + tous les brackets de consolation.
    // La complétion est détectée par l'effet playAllPositions (matches + brackets).
    if (playAllPositions) {
      const { updatedMatches, updatedBrackets, filledCount } = autoFillAllPositions(
        matches,
        consolationBrackets,
        effectiveMax,
        tableauSize,
        ranking
      );
      setConsolationBrackets(updatedBrackets);
      onMatchesChange(updatedMatches);
      showToast(`Scores générés pour ${filledCount} match(s)`, 'success');
      return;
    }

    const { updatedMatches, filledCount } = autoFillTableauScores(
      matches,
      effectiveMax,
      tableauSize
    );

    // Créer une copie profonde pour forcer React à re-renderer
    const matchesCopy = updatedMatches.map(m => ({ ...m }));
    onMatchesChange(matchesCopy);
    showToast(`Scores générés pour ${filledCount} match(s)`, 'success');

    // Vérifier si le tableau est complet
    const champion = updatedMatches.find(m => m.round === 2)?.winner;
    const autoFillThirdPlace = updatedMatches.find(m => m.round === 3);
    const autoFillThirdDone = !autoFillThirdPlace || !!autoFillThirdPlace.winner;
    if (champion && autoFillThirdDone && onComplete) {
      const finalResults = calculateFinalResults(updatedMatches, ranking, tableauSize);
      onComplete(finalResults);
    }
  };

  // Met à jour les matchs d'un bracket de consolation
  const updateConsolationMatch = (consolationId: string, matchId: string, scoreA: number, scoreB: number, winner: Fencer | null) => {
    setConsolationBrackets(prev => prev.map(bracket => {
      if (bracket.id !== consolationId) return bracket;
      const updatedMatches = bracket.matches.map(m => {
        if (m.id === matchId) return { ...m, scoreA, scoreB, winner };
        return m;
      });
      propagateWinners(updatedMatches, bracket.size);
      const isComplete = isBracketComplete(updatedMatches);
      return { ...bracket, matches: updatedMatches.map(m => ({ ...m })), isComplete };
    }));
  };

  const handleScoreSubmit = () => {
    if (!editingMatch) return;

    const scoreA = parseInt(editScoreA) || 0;
    const scoreB = parseInt(editScoreB) || 0;

    // Validation
    if (scoreA === scoreB && !victoryA && !victoryB) {
      showToast('Les scores ne peuvent pas être égaux en élimination directe', 'error');
      return;
    }

    if (!isUnlimitedScore && maxScore > 0) {
      if (scoreA > maxScore || scoreB > maxScore) {
        showToast(`Le score ne peut pas dépasser ${maxScore}`, 'error');
        return;
      }
    }

    // Si c'est un match de bracket de consolation
    if (editingConsolationId) {
      const bracket = consolationBrackets.find(b => b.id === editingConsolationId);
      if (bracket) {
        const match = bracket.matches.find(m => m.id === editingMatch);
        let winner: Fencer | null = null;
        if (victoryA) winner = match?.fencerA || null;
        else if (victoryB) winner = match?.fencerB || null;
        else if (scoreA > scoreB) winner = match?.fencerA || null;
        else if (scoreB > scoreA) winner = match?.fencerB || null;
        updateConsolationMatch(editingConsolationId, editingMatch, scoreA, scoreB, winner);
      }
      setShowScoreModal(false);
      setEditingMatch(null);
      setEditingConsolationId(null);
      setEditScoreA('');
      setEditScoreB('');
      setVictoryA(false);
      setVictoryB(false);
      return;
    }

    // Déterminer le vainqueur
    let winner: Fencer | null = null;
    if (victoryA) {
      winner = matches.find(m => m.id === editingMatch)?.fencerA || null;
    } else if (victoryB) {
      winner = matches.find(m => m.id === editingMatch)?.fencerB || null;
    } else if (scoreA > scoreB) {
      winner = matches.find(m => m.id === editingMatch)?.fencerA || null;
    } else if (scoreB > scoreA) {
      winner = matches.find(m => m.id === editingMatch)?.fencerB || null;
    }

    const updatedMatches = matches.map(match => {
      if (match.id === editingMatch) {
        return {
          ...match,
          scoreA,
          scoreB,
          winner,
        };
      }
      return match;
    });

    // Propager les gagnants avant de sauvegarder
    propagateWinners(updatedMatches, tableauSize);

    // Créer une copie profonde pour forcer React à re-renderer
    const matchesCopy = updatedMatches.map(m => ({ ...m }));
    onMatchesChange(matchesCopy);

    // Vérifier si le tableau est complet (finale + petite finale si elle existe)
    const champion = updatedMatches.find(m => m.round === 2)?.winner;
    const thirdPlaceMatch = updatedMatches.find(m => m.round === 3);
    const thirdPlaceDone = !thirdPlaceMatch || !!thirdPlaceMatch.winner;
    if (champion && thirdPlaceDone && onComplete && !playAllPositions) {
      const finalResults = calculateFinalResults(updatedMatches, ranking, tableauSize);
      onComplete(finalResults);
    }

    setShowScoreModal(false);
    setEditingMatch(null);
    setEditScoreA('');
    setEditScoreB('');
    setVictoryA(false);
    setVictoryB(false);
  };

  const openScoreModal = (match: TableauMatch, consolationId?: string) => {
    setEditingMatch(match.id);
    setEditingConsolationId(consolationId ?? null);
    setEditScoreA(match.scoreA?.toString() || '');
    setEditScoreB(match.scoreB?.toString() || '');
    setVictoryA(false);
    setVictoryB(false);
    setShowScoreModal(true);
  };

  const handleExportPDF = async () => {
    const perPage = Math.max(1, Math.min(pdfMatchesPerPage, MAX_MATCHES_PER_PAGE_TABLEAU));
    const filteredMatches = matches.filter(m => selectedRounds.has(m.round));
    const roundLabel = [...selectedRounds]
      .sort((a, b) => b - a)
      .map(r => getRoundName(r))
      .join(', ');
    const title = `Tableau de ${tableauSize}${roundLabel ? ` — ${roundLabel}` : ''}`;
    const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
    try {
      // Récupérer les signatures des combattants (saisies sur tablette)
      let signatures: Record<string, { A?: string; B?: string }> | undefined;
      try {
        const api = (window as any).electronAPI;
        const ids = filteredMatches.map(m => m.id).filter(Boolean);
        const rows = (await api?.db?.getDEMatchSignaturesByMatchIds?.(ids)) ?? [];
        if (rows.length > 0) {
          signatures = {};
          for (const row of rows) {
            const match = filteredMatches.find(m => m.id === row.matchId);
            if (!match) continue;
            const slot = match.fencerA?.id === row.fencerId ? 'A' : match.fencerB?.id === row.fencerId ? 'B' : null;
            if (!slot) continue;
            (signatures[row.matchId] ??= {})[slot] = row.signatureData;
          }
        }
      } catch { /* signatures optionnelles */ }

      const { printTableauHTML, exportTableauToPDF, previewTableauHTML } = await import('../../shared/utils/pdfExport');
      if (pdfMode === 'print') {
        await printTableauHTML(filteredMatches, perPage, title, logo, tableauTemplate, signatures);
      } else if (pdfMode === 'preview') {
        await previewTableauHTML(filteredMatches, perPage, title, logo, tableauTemplate, signatures);
      } else {
        await exportTableauToPDF(filteredMatches, perPage, title, logo, tableauTemplate, signatures);
      }
      setShowPdfModal(false);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  const handleExportTree = async () => {
    const title = `Arbre — Tableau de ${tableauSize}`;
    const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
    try {
      const { exportBracketTreeToPDF } = await import('../../shared/utils/pdfExport');
      await exportBracketTreeToPDF(matches, title, logo, tableauTemplate);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  const handlePrintClick = useCallback(() => {
    setPdfMode('print');
    const rounds = [...new Set(matches.filter(m => m.fencerA && m.fencerB && !m.isBye).map(m => m.round))].sort((a, b) => b - a);
    setSelectedRounds(new Set(rounds));
    setShowPdfModal(true);
  }, [matches]);

  const handlePreviewClick = useCallback(() => {
    setPdfMode('preview');
    const rounds = [...new Set(matches.filter(m => m.fencerA && m.fencerB && !m.isBye).map(m => m.round))].sort((a, b) => b - a);
    setSelectedRounds(new Set(rounds));
    setShowPdfModal(true);
  }, [matches]);

  // Ctrl+P / Cmd+P → imprimer les feuilles de match du tableau
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrintClick();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePrintClick]);

  const handleSpecialStatus = (
    status: 'abandon' | 'forfait' | 'exclusion',
    fencerId: string
  ) => {
    if (!editingMatch) return;

    // L'adversaire du tireur sélectionné (qui abandonne / forfait / est exclu) gagne
    const opponentWinner = (m: { fencerA?: Fencer | null; fencerB?: Fencer | null }) => {
      if (m.fencerA?.id === fencerId) return m.fencerB ?? null;
      if (m.fencerB?.id === fencerId) return m.fencerA ?? null;
      return null;
    };

    // Si c'est un match de consolation
    if (editingConsolationId) {
      const bracket = consolationBrackets.find(b => b.id === editingConsolationId);
      const match = bracket?.matches.find(m => m.id === editingMatch);
      if (bracket && match) {
        const winner = opponentWinner(match);
        updateConsolationMatch(editingConsolationId, editingMatch, match.scoreA ?? 0, match.scoreB ?? 0, winner);
      }
      setShowScoreModal(false);
      setEditingMatch(null);
      setEditingConsolationId(null);
      return;
    }

    const match = matches.find(m => m.id === editingMatch);
    if (!match) return;

    // Dans un tableau à élimination directe, l'adversaire gagne dans tous les cas
    const winner: Fencer | null = opponentWinner(match);

    const updatedMatches = matches.map(m => {
      if (m.id === editingMatch) {
        return {
          ...m,
          winner,
          // On pourrait ajouter des champs pour les statuts spéciaux ici
        };
      }
      return m;
    });

    // Propager les gagnants avant de sauvegarder
    propagateWinners(updatedMatches, tableauSize);
    onMatchesChange([...updatedMatches]);

    // Vérifier si le tableau est complet après statut spécial
    const specialChampion = updatedMatches.find(m => m.round === 2)?.winner;
    const specialThirdPlace = updatedMatches.find(m => m.round === 3);
    const specialThirdDone = !specialThirdPlace || !!specialThirdPlace.winner;
    if (specialChampion && specialThirdDone && onComplete) {
      onComplete(calculateFinalResults(updatedMatches, ranking, tableauSize));
    }

    setShowScoreModal(false);
    setEditingMatch(null);
    setEditScoreA('');
    setEditScoreB('');
    setVictoryA(false);
    setVictoryB(false);
  };


  const renderMatch = (match: TableauMatch, verticalPosition?: number) => (
    <MatchCard
      key={match.id}
      match={match}
      verticalPosition={verticalPosition}
      viewMode={viewMode}
      baseMatchHeight={BASE_MATCH_HEIGHT}
      onMatchClick={openScoreModal}
      onArenaClick={id => {
        setSelectedMatchForArena(id);
        setShowArenaModal(true);
      }}
      onRefereeClick={id => {
        if (competitionId) {
          window.electronAPI.db.getRefereesByCompetition(competitionId).then(refs => {
            setCompetitionReferees(refs.map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, club: r.club })));
          });
        }
        setSelectedMatchForReferee(id);
        setShowRefereeModal(true);
      }}
      onSignaturesClick={setSignaturesMatch}
      readOnly={readOnly}
    />
  );

  const getMatchPosition = (match: TableauMatch): number => {
    if (viewMode === 'pending') return match.position;

    return calculateMatchVerticalPosition(match.round, match.position, tableauSize);
  };

  const renderRound = (round: number) => {
    const roundMatches =
      viewMode === 'pending'
        ? pendingMatches.filter(m => m.round === round)
        : matches.filter(m => m.round === round);
    const sortedMatches = [...roundMatches].sort((a, b) => a.position - b.position);

    const isExpanded = expandedRounds.size === 0 || expandedRounds.has(round);

    return (
      <div
        key={round}
        ref={(el: HTMLDivElement | null) => { colRefs.current.set(round, el); }}
        style={TV_STYLES.roundCol}
      >
        <div onClick={() => toggleRoundExpansion(round)} style={TV_STYLES.roundHeader}>
          <span style={TV_STYLES.roundHeaderChevron}>
            {isExpanded ? '▼' : '▶'}
          </span>
          {getRoundName(round)}
        </div>
        {isExpanded && (
          <div
            style={
              viewMode === 'full'
                ? { position: 'relative', height: `${(tableauSize / 2) * SLOT_HEIGHT}px` }
                : {}
            }
          >
            {sortedMatches.map(match => {
              const verticalPosition = viewMode === 'full' ? getMatchPosition(match) : undefined;
              return <div key={match.id}>{renderMatch(match, verticalPosition)}</div>;
            })}
          </div>
        )}
      </div>
    );
  };

  const convertToBracketMatches = (): BracketMatch[] => {
    // Exclure la petite finale (round=3) et les barrages (round=tableauSize*2) :
    // ces rounds ne s'insèrent pas dans l'arbre puissance-de-2 de Bracket.tsx et
    // produiraient des indices flottants (ex. log2(16/3)+1 ≈ 3.415).
    const mainMatches = matches.filter(
      m => m.round !== 3 && m.round !== tableauSize * 2
    );
    return mainMatches.map(match => ({
      id: match.id,
      // round=1 = Finale (match.round=2), round=log2(tableauSize) = premier tour
      round: Math.log2(match.round),
      position: match.position,
      fencerA: match.fencerA,
      fencerB: match.fencerB,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      winnerId: match.winner?.id,
      isBye: match.isBye,
    }));
  };

  if (ranking.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏆</div>
        <h2 className="empty-state-title">Tableau à élimination directe</h2>
        <p className="empty-state-description">
          Terminez d'abord les poules pour générer le tableau
        </p>
      </div>
    );
  }

  const finalMatch = matches.find(m => m.round === 2);
  const champion = finalMatch?.winner;

  const rounds: number[] = [];
  let r = tableauSize;
  while (r >= 2) {
    rounds.push(r);
    r = r / 2;
  }
  if ((thirdPlaceMatch || playAllPositions) && tableauSize >= 4) {
    const finalIndex = rounds.indexOf(2);
    if (finalIndex !== -1) {
      rounds.splice(finalIndex, 0, 3);
    } else {
      rounds.push(3);
    }
  }

  const pendingMatches = matches.filter(m => m.fencerA && m.fencerB && !m.isBye && !m.winner);
  const pendingViewRounds: number[] =
    viewMode === 'pending'
      ? [...new Set(matches.map(m => m.round))].sort((a, b) =>
          pendingOrder === 'asc' ? a - b : b - a
        )
      : [];

  const toggleRoundExpansion = (round: number) => {
    setExpandedRounds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(round)) {
        newSet.delete(round);
      } else {
        newSet.add(round);
      }
      return newSet;
    });
  };

  const renderPendingSection = (round: number) => {
    const roundMatches = matches
      .filter(m => m.round === round)
      .sort((a, b) => a.position - b.position);
    const isExpanded = expandedRounds.has(round);
    const roundName = round === 3 ? 'Petite Finale' : `Tableau de ${round}`;

    return (
      <div
        key={round}
        style={{
          background: 'white',
          borderRadius: '8px',
          marginBottom: '0.5rem',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
        }}
      >
        <div
          onClick={() => toggleRoundExpansion(round)}
          style={{
            padding: '0.75rem 1rem',
            background: '#f3f4f6',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>{isExpanded ? '▼' : '▶'}</span>
            <span style={{ fontWeight: '600', color: '#374151' }}>{roundName}</span>
          </div>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {roundMatches.length} match{roundMatches.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isExpanded && (
          <div style={{ padding: '0.5rem' }}>
            {roundMatches.map(match => (
              <div key={match.id} style={{ marginBottom: '0.5rem' }}>
                {renderMatch(match)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={TV_STYLES.root}>
      <TableauToolbar
        tableauSize={tableauSize}
        rankingCount={ranking.length}
        arenaCount={arenaCount}
        autoAssignArenas={autoAssignArenas}
        onAutoAssignToggle={handleAutoAssignToggle}
        onBulkDeassign={handleBulkDeassign}
        onAutoFillScores={handleAutoFillScores}
        viewMode={viewMode}
        onViewModeToggle={() => setViewMode(viewMode === 'full' ? 'pending' : 'full')}
        pyramidViewMode={pyramidViewMode}
        onPyramidViewModeToggle={() => setPyramidViewMode(!pyramidViewMode)}
        onPrintClick={handlePrintClick}
        onPreviewClick={handlePreviewClick}
        onExportPdfClick={() => {
          setPdfMode('pdf');
          const rounds = [...new Set(matches.filter(m => m.fencerA && m.fencerB && !m.isBye).map(m => m.round))].sort((a, b) => b - a);
          setSelectedRounds(new Set(rounds));
          setShowPdfModal(true);
        }}
        onExportTreeClick={handleExportTree}
        champion={champion}
      />

      <div
        style={{
          ...TV_STYLES.scrollArea,
          overflow: viewMode === 'full' && !pyramidViewMode ? 'hidden' : TV_STYLES.scrollArea.overflowY,
          cursor: isPanningRef.current ? 'grabbing' : (viewMode === 'full' && !pyramidViewMode && zoom !== 1 ? 'grab' : 'default'),
          position: 'relative',
          userSelect: 'none',
          overscrollBehavior: 'contain',
        }}
        ref={scrollAreaRef}
        onMouseDown={handleBracketMouseDown}
        onMouseMove={handleBracketMouseMove}
        onMouseUp={handleBracketMouseUp}
        onMouseLeave={handleBracketMouseUp}
      >
        {viewMode === 'full' && !pyramidViewMode && (
          <div className="bracket-zoom-controls">
            <button className="bracket-zoom-btn" onClick={() => setZoom(z => Math.min(2.5, parseFloat((z + 0.1).toFixed(2))))} title="Zoom avant">+</button>
            <span className="bracket-zoom-level">{Math.round(zoom * 100)}%</span>
            <button className="bracket-zoom-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Réinitialiser">⊙</button>
            <button className="bracket-zoom-btn" onClick={() => setZoom(z => Math.max(0.3, parseFloat((z - 0.1).toFixed(2))))} title="Zoom arrière">−</button>
          </div>
        )}
        {viewMode === 'pending' ? (
          pendingViewRounds.length > 0 ? (
            <>
              <div style={TV_STYLES.pendingOrderRow}>
                <button
                  onClick={() => setPendingOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                  style={TV_STYLES.pendingOrderBtn}
                  title={pendingOrder === 'asc' ? 'Affichage croissant' : 'Affichage décroissant'}
                >
                  {pendingOrder === 'asc' ? '🔼 Croissant' : '🔽 Décroissant'}
                </button>
              </div>
              {pendingViewRounds.map(round => (
                <TableauPendingSection
                  key={round}
                  round={round}
                  matches={matches}
                  isExpanded={expandedRounds.has(round)}
                  onToggle={toggleRoundExpansion}
                  renderMatch={renderMatch}
                />
              ))}

              <div style={TV_STYLES.summaryBox}>
                <h4 style={TV_STYLES.summaryTitle}>Résumé des pistes</h4>
                <div style={TV_STYLES.summaryFlex}>
                  {Array.from({ length: arenaCount }, (_, i) => i + 1).map(arenaNum => {
                    const arenaMatches = pendingMatches.filter(m => m.arena === arenaNum);
                    return (
                      <div
                        key={arenaNum}
                        style={{
                          padding: '0.5rem 0.75rem',
                          background: arenaMatches.length > 0 ? '#d1fae5' : 'white',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <strong>Piste {arenaNum}</strong>: {arenaMatches.length} match
                        {arenaMatches.length !== 1 ? 's' : ''}
                      </div>
                    );
                  })}
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      background:
                        pendingMatches.filter(m => !m.arena).length > 0 ? '#fef3c7' : 'white',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <strong>Non assignés</strong>: {pendingMatches.filter(m => !m.arena).length}{' '}
                    match{pendingMatches.filter(m => !m.arena).length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={TV_STYLES.pendingEmpty}>✓ Tous les matches sont terminés</div>
          )
        ) : pyramidViewMode ? (
          <Bracket matches={convertToBracketMatches()} tableSize={tableauSize} />
        ) : (
          <div
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'top left',
              willChange: 'transform',
            }}
          >
            {playAllPositions && matches.some(m => m.round === tableauSize * 2) && (
              <div style={TV_STYLES.barragesBox}>
                <div style={TV_STYLES.barragesTitle}>Barrages</div>
                <div style={TV_STYLES.barragesFlex}>
                  {matches.filter(m => m.round === tableauSize * 2).sort((a, b) => a.position - b.position).map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      viewMode="full"
                      baseMatchHeight={BASE_MATCH_HEIGHT}
                      onMatchClick={openScoreModal}
                      onArenaClick={id => { setSelectedMatchForArena(id); setShowArenaModal(true); }}
                      onRefereeClick={id => { setSelectedMatchForReferee(id); setShowRefereeModal(true); }}
                      onSignaturesClick={setSignaturesMatch}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </div>
            )}
            <div style={{ position: 'relative' }} ref={bracketWrapRef}>
              {svgConnectors}
              <div style={TV_STYLES.fullRoundsRow}>
                {rounds.map(round => renderRound(round))}
              </div>
            </div>
          </div>
        )}
      </div>{/* scrollArea */}

      <SeedingTable ranking={ranking} tableauSize={tableauSize} />

      {/* Brackets de consolation (mode Jouer toutes les places) */}
      {playAllPositions && consolationBrackets.length > 0 && (
        <ConsolationBracketsSection
          consolationBrackets={consolationBrackets}
          arenaCount={arenaCount}
          readOnly={readOnly}
          onMatchClick={(m, bracketId) => openScoreModal(m, bracketId)}
          onArenaClick={(matchId, bracketId) => {
            setSelectedMatchForArena(matchId);
            setSelectedMatchConsolationBracketId(bracketId);
            setShowArenaModal(true);
          }}
          onRefereeClick={matchId => {
            setSelectedMatchForReferee(matchId);
            setShowRefereeModal(true);
          }}
          onSignaturesClick={setSignaturesMatch}
        />
      )}

      {/* Score Modal */}
      {showScoreModal && editingMatch && (() => {
        const match = editingConsolationId
          ? consolationBrackets.find(b => b.id === editingConsolationId)?.matches.find(m => m.id === editingMatch)
          : matches.find(m => m.id === editingMatch);
        if (!match) return null;
        return (
          <TableauScoreModal
            match={match}
            editScoreA={editScoreA}
            setEditScoreA={setEditScoreA}
            editScoreB={editScoreB}
            setEditScoreB={setEditScoreB}
            maxScore={maxScore}
            isUnlimitedScore={isUnlimitedScore}
            modalRef={modalRef}
            onClose={() => setShowScoreModal(false)}
            onSubmit={handleScoreSubmit}
            onSpecialStatus={handleSpecialStatus}
            getRoundName={getRoundName}
          />
        );
      })()}

      {showPdfModal && (
        <TableauPdfModal
          pdfMode={pdfMode}
          matches={matches}
          pdfMatchesPerPage={pdfMatchesPerPage}
          setPdfMatchesPerPage={setPdfMatchesPerPage}
          selectedRounds={selectedRounds}
          setSelectedRounds={setSelectedRounds}
          onExport={handleExportPDF}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {showArenaModal && selectedMatchForArena && (() => {
        const isConsolation = !!selectedMatchConsolationBracketId;
        const consolationBracket = isConsolation
          ? consolationBrackets.find(b => b.id === selectedMatchConsolationBracketId)
          : null;
        const currentArena = isConsolation
          ? (consolationBracket?.matches.find(m => m.id === selectedMatchForArena)?.arena ?? null)
          : (matches.find(m => m.id === selectedMatchForArena)?.arena ?? null);

        const closeModal = () => {
          setShowArenaModal(false);
          setSelectedMatchForArena(null);
          setSelectedMatchConsolationBracketId(null);
        };

        const assignArena = (arenaNum: number | null) => {
          const oldArena = currentArena;
          if (isConsolation && consolationBracket) {
            const updatedBracket = {
              ...consolationBracket,
              matches: consolationBracket.matches.map(m =>
                m.id === selectedMatchForArena ? { ...m, arena: arenaNum } : m
              ),
            };
            setConsolationBrackets(prev =>
              prev.map(b => b.id === consolationBracket.id ? updatedBracket : b)
            );
            const consolMatch = consolationBracket.matches.find(m => m.id === selectedMatchForArena);
            onMatchArenaChange?.(selectedMatchForArena!, oldArena, arenaNum, consolMatch?.fencerA ?? null, consolMatch?.fencerB ?? null);
          } else {
            const updatedMatches = matches.map(m =>
              m.id === selectedMatchForArena ? { ...m, arena: arenaNum } : m
            );
            onMatchesChange(updatedMatches);
            onMatchArenaChange?.(selectedMatchForArena!, oldArena, arenaNum);
          }
          closeModal();
        };

        return (
          <TableauArenaModal
            matches={matches}
            selectedMatchId={selectedMatchForArena}
            arenaCount={arenaCount}
            currentArena={currentArena}
            onAssign={assignArena}
            onClose={closeModal}
          />
        );
      })()}

      {showRefereeModal && selectedMatchForReferee && (() => {
        const selectedMatch = matches.find(m => m.id === selectedMatchForReferee);
        const currentReferees = selectedMatch?.referees?.length
          ? selectedMatch.referees
          : selectedMatch?.referee ? [selectedMatch.referee] : [];

        const closeModal = () => {
          setShowRefereeModal(false);
          setSelectedMatchForReferee(null);
        };

        // referees[0] = arbitre principal (persisté en DB via refereeId)
        const assignReferees = (refs: Array<{ id: string; firstName: string; lastName: string }>) => {
          const principal = refs[0] ?? null;
          const updatedMatches = matches.map(m =>
            m.id === selectedMatchForReferee ? { ...m, referee: principal, referees: refs } : m
          );
          onMatchesChange(updatedMatches);
          onMatchRefereeChange?.(selectedMatchForReferee!, principal?.id ?? null);
          closeModal();
        };

        return (
          <TableauRefereeModal
            currentReferees={currentReferees}
            maxReferees={Math.max(1, maxRefereesPerMatch)}
            referees={competitionReferees}
            onAssign={assignReferees}
            onClose={closeModal}
          />
        );
      })()}

      {signaturesMatch && (
        <TableauSignaturesModal match={signaturesMatch} onClose={() => setSignaturesMatch(null)} />
      )}
    </div>
  );
};

const TableauView = React.memo(TableauViewComponent);
export default TableauView;
