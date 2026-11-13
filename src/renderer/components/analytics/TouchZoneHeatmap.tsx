/**
 * BellePoule Modern - Mannequin des zones de touche (Sabre Laser)
 * Géométrie, couleurs et rang partagés avec les exports PDF : shared/utils/touchZoneFigure.ts.
 * `variant` : « given » (touches portées) ou « received » (touches reçues) — cadre bleu / rouge.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { translateStatic } from '../../contexts/TranslationContext';
import {
  FIGURE_SHAPES,
  FIGURE_VIEWBOX,
  shapePaint,
  zonePaints,
  type FigureVariant,
} from '../../../shared/utils/touchZoneFigure';

export { zoneShade, type ZoneShade } from '../../../shared/utils/touchZoneFigure';
export type HeatmapVariant = FigureVariant;

interface Props {
  zoneA: number;
  zoneB: number;
  zoneC: number;
  label?: string;
  variant?: HeatmapVariant;
}

export const TouchZoneHeatmap: React.FC<Props> = ({
  zoneA,
  zoneB,
  zoneC,
  label,
  variant = 'given',
}) => {
  const total = zoneA + zoneB + zoneC;
  const paints = zonePaints([zoneA, zoneB, zoneC]);

  return (
    <div className={`touch-zones touch-zones--${variant}`}>
      {label && <div className="touch-zones__label">{label}</div>}
      <svg
        viewBox={FIGURE_VIEWBOX}
        width="100"
        height="155"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${label ? label + ' — ' : ''}A=${zoneA} B=${zoneB} C=${zoneC}`}
      >
        {FIGURE_SHAPES.map((sh, i) =>
          React.createElement(sh.tag, { key: i, ...sh.attrs, ...shapePaint(sh, paints) })
        )}
      </svg>

      {/* Légende */}
      <div className="touch-zones__legend">
        {(
          [
            ['a', zoneA, '1pt'],
            ['b', zoneB, '3pts'],
            ['c', zoneC, '5pts'],
          ] as const
        ).map(([z, count, pts]) => (
          <div key={z} className={`zone-legend zone-legend--${z}-${paints[z].shade}`}>
            <div className="zone-legend__count">{count}</div>
            <div className="zone-legend__name">
              {z.toUpperCase()} · {pts}
            </div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="touch-zones__total">
          {translateStatic(`touchHeatmap.touches_${total > 1 ? 'other' : 'one'}`, { count: total })}
        </div>
      )}
    </div>
  );
};
