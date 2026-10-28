/**
 * BellePoule Modern - Mesure des colonnes du tableau pour les connecteurs SVG (#1241)
 * Licensed under GPL-3.0
 */
import { useLayoutEffect, useRef, useState, type DependencyList } from 'react';

export type ColumnMeasure = { left: number; width: number };

/** Mesure `colRefs` (par tour) relativement à `bracketWrapRef` quand `active` ; remesure si `deps` change. */
export function useColumnMeasures(active: boolean, deps: DependencyList) {
  const colRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const bracketWrapRef = useRef<HTMLDivElement | null>(null);
  const [colMeasures, setColMeasures] = useState<Map<number, ColumnMeasure>>(new Map());

  useLayoutEffect(() => {
    if (!active || !bracketWrapRef.current) return;
    const wrapLeft = bracketWrapRef.current.getBoundingClientRect().left;
    const measures = new Map<number, ColumnMeasure>();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

  return { colRefs, bracketWrapRef, colMeasures };
}
