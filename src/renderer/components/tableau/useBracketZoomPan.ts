/**
 * BellePoule Modern - Zoom et déplacement (pan) de la vue bracket de TableauView (#1241)
 * Sort l'état de zoom/pan et les gestionnaires de souris / molette de TableauView.
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect, useRef } from 'react';
import { useStateGroup } from '../../hooks/useStateGroup';

interface UseBracketZoomPanOptions {
  /** Vue active : le zoom/pan ne s'applique qu'à la vue bracket complète */
  viewMode: 'full' | 'pending';
  pyramidViewMode: boolean;
}

export function useBracketZoomPan({ viewMode, pyramidViewMode }: UseBracketZoomPanOptions) {
  const { zoom, setZoom, pan, setPan } = useStateGroup({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // Remet à zéro le zoom/pan si on change de mode
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [viewMode, pyramidViewMode, setZoom, setPan]);

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
