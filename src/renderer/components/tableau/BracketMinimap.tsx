/**
 * BellePoule Modern - Minimap du tableau (#1542)
 * Aperçu réduit du bracket avec rectangle de la zone visible ; un clic / glisser recentre la vue.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { computeMinimap, panForMinimapPoint } from './minimapGeometry';

const MAP_W = 160;

interface BracketMinimapProps {
  /** Zone visible (conteneur de défilement) */
  viewportRef: React.RefObject<HTMLElement | null>;
  /** Bracket (élément transformé) : sa taille naturelle sert de référence */
  contentRef: React.RefObject<HTMLElement | null>;
  zoom: number;
  pan: { x: number; y: number };
  onPan: (pan: { x: number; y: number }) => void;
}

const BracketMinimap: React.FC<BracketMinimapProps> = ({
  viewportRef,
  contentRef,
  zoom,
  pan,
  onPan,
}) => {
  const { t } = useTranslation();
  const [size, setSize] = useState({ contentW: 0, contentH: 0, viewW: 0, viewH: 0 });

  useEffect(() => {
    const measure = () => {
      const c = contentRef.current;
      const v = viewportRef.current;
      if (!c || !v) return;
      setSize(prev => {
        const next = {
          contentW: Math.max(c.offsetWidth, c.scrollWidth),
          contentH: Math.max(c.offsetHeight, c.scrollHeight),
          viewW: v.clientWidth,
          viewH: v.clientHeight,
        };
        return prev.contentW === next.contentW &&
          prev.contentH === next.contentH &&
          prev.viewW === next.viewW &&
          prev.viewH === next.viewH
          ? prev
          : next;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [contentRef, viewportRef]);

  const layout = computeMinimap({ ...size, zoom, pan, mapW: MAP_W });

  const moveTo = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!layout) return;
      const r = e.currentTarget.getBoundingClientRect();
      onPan(
        panForMinimapPoint(e.clientX - r.left, e.clientY - r.top, { ...size, zoom }, layout.scale)
      );
    },
    [layout, onPan, size, zoom]
  );

  if (!layout || layout.fullyVisible) return null;

  return (
    <svg
      className="bracket-minimap"
      role="img"
      aria-label={t('tableauView.minimap')}
      width={MAP_W}
      height={layout.mapH}
      onPointerDown={e => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={e => {
        if (e.buttons === 1) moveTo(e);
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <rect
        className="bracket-minimap-view"
        x={layout.view.x}
        y={layout.view.y}
        width={layout.view.w}
        height={layout.view.h}
      />
    </svg>
  );
};

export default React.memo(BracketMinimap);
