/**
 * BellePoule Modern - Zoom et déplacement (pan) de la vue bracket de TableauView (#1241)
 * Sort l'état de zoom/pan et les gestionnaires de souris / molette de TableauView.
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useStateGroup } from '../../hooks/useStateGroup';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;
const zoomStorageKey = (competitionId: string) => `bp_bracket_zoom_${competitionId}`;

/** Lit le zoom mémorisé d'une compétition (1 si absent ou invalide) */
export function loadBracketZoom(competitionId?: string): number {
  if (!competitionId) return 1;
  try {
    const v = parseFloat(localStorage.getItem(zoomStorageKey(competitionId)) ?? '');
    return Number.isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX ? v : 1;
  } catch {
    return 1;
  }
}

/** Mémorise le zoom d'une compétition (1 = valeur par défaut, entrée supprimée) */
export function saveBracketZoom(competitionId: string | undefined, zoom: number): void {
  if (!competitionId) return;
  try {
    if (zoom === 1) localStorage.removeItem(zoomStorageKey(competitionId));
    else localStorage.setItem(zoomStorageKey(competitionId), String(zoom));
  } catch {
    // stockage indisponible : zoom non mémorisé
  }
}

/**
 * Borne le pan pour que le bracket ne quitte pas la zone visible :
 * plus de défilement dans le vide (haut, gauche, bas, droite).
 * Contenu plus petit que la vue : reste entièrement visible.
 */
export function clampBracketPan(
  pan: { x: number; y: number },
  zoom: number,
  content: { w: number; h: number },
  view: { w: number; h: number }
): { x: number; y: number } {
  const axis = (p: number, c: number, v: number) => {
    const free = v - c * zoom;
    const lo = Math.min(0, free);
    const hi = Math.max(0, free);
    return Math.min(hi, Math.max(lo, p)) + 0; // + 0 : évite -0
  };
  return { x: axis(pan.x, content.w, view.w), y: axis(pan.y, content.h, view.h) };
}

interface UseBracketZoomPanOptions {
  /** Compétition : clé de mémorisation du zoom entre les sessions */
  competitionId?: string;
  /** Vue active : le zoom/pan ne s'applique qu'à la vue bracket complète */
  viewMode: 'full' | 'pending';
  pyramidViewMode: boolean;
  /** Contenu transformé du bracket : mesuré pour borner le pan */
  contentRef?: React.RefObject<HTMLElement | null>;
}

export function useBracketZoomPan({
  competitionId,
  viewMode,
  pyramidViewMode,
  contentRef,
}: UseBracketZoomPanOptions) {
  const { zoom, setZoom, pan, setPan } = useStateGroup({
    zoom: loadBracketZoom(competitionId),
    pan: { x: 0, y: 0 },
  });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // Remet à zéro le zoom/pan si on change de mode (sauf au montage : zoom mémorisé conservé)
  const modeInitRef = useRef(true);
  useEffect(() => {
    if (modeInitRef.current) {
      modeInitRef.current = false;
      return;
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [viewMode, pyramidViewMode, setZoom, setPan]);

  // Borne le pan (molette, glisser, minimap, zoom) avant affichage
  useLayoutEffect(() => {
    const c = contentRef?.current;
    const v = scrollAreaRef.current;
    if (!c || !v || viewMode !== 'full' || pyramidViewMode) return;
    const next = clampBracketPan(
      pan,
      zoom,
      { w: Math.max(c.offsetWidth, c.scrollWidth), h: Math.max(c.offsetHeight, c.scrollHeight) },
      { w: v.clientWidth, h: v.clientHeight }
    );
    if (next.x !== pan.x || next.y !== pan.y) setPan(next);
  }, [pan, zoom, viewMode, pyramidViewMode, contentRef, setPan]);

  // Mémorise le zoom de la vue bracket complète
  useEffect(() => {
    if (viewMode === 'full' && !pyramidViewMode) saveBracketZoom(competitionId, zoom);
  }, [competitionId, viewMode, pyramidViewMode, zoom]);

  // Listener natif non-passif : le onWheel React est passif, preventDefault y est ignoré
  // et la page entière défilait au lieu du tableau.
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
  }, [viewMode, pyramidViewMode, setPan]);

  const handleBracketMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || viewMode !== 'full' || pyramidViewMode) return;
      // Only pan on background (not on match cards)
      if ((e.target as HTMLElement).closest('.match-card')) return;
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [viewMode, pyramidViewMode, pan]
  );

  const handleBracketMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanningRef.current) return;
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
      });
    },
    [setPan]
  );

  const handleBracketMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  return {
    zoom,
    setZoom,
    pan,
    setPan,
    isPanningRef,
    scrollAreaRef,
    handleBracketMouseDown,
    handleBracketMouseMove,
    handleBracketMouseUp,
  };
}
