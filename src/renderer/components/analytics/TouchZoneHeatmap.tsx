/**
 * BellePoule Modern - Heatmap des zones de touche (Laser Sabre)
 * Zones FFE : A = main/arme (1 pt), B = bras/jambes (3 pts), C = tête/torse (5 pts).
 * `variant="given"` (bleu) : touches portées ; `variant="received"` (rouge) : touches reçues.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { translateStatic } from '../../contexts/TranslationContext';

export type HeatmapVariant = 'given' | 'received';

interface Props {
  zoneA: number;
  zoneB: number;
  zoneC: number;
  label?: string;
  variant?: HeatmapVariant;
}

const PALETTE: Record<
  HeatmapVariant,
  { rgb: string; strokes: [string, string, string]; legend: [string, string, string] }
> = {
  given: {
    rgb: '59,130,246',
    strokes: ['#93c5fd', '#3b82f6', '#1d4ed8'],
    legend: ['bg-blue-100 text-blue-800', 'bg-blue-200 text-blue-900', 'bg-blue-400 text-white'],
  },
  received: {
    rgb: '239,68,68',
    strokes: ['#fca5a5', '#ef4444', '#b91c1c'],
    legend: ['bg-red-100 text-red-800', 'bg-red-200 text-red-900', 'bg-red-400 text-white'],
  },
};

export const TouchZoneHeatmap: React.FC<Props> = ({
  zoneA,
  zoneB,
  zoneC,
  label,
  variant = 'given',
}) => {
  const palette = PALETTE[variant];
  const max = Math.max(zoneA, zoneB, zoneC, 1);
  const total = zoneA + zoneB + zoneC;

  const fill = (count: number) => {
    if (count === 0) return `rgba(${palette.rgb},0.08)`;
    return `rgba(${palette.rgb},${(0.15 + (count / max) * 0.75).toFixed(2)})`;
  };
  const stroke = (count: number) => {
    const ratio = count / max;
    if (ratio > 0.6) return palette.strokes[2];
    if (ratio > 0.3) return palette.strokes[1];
    return palette.strokes[0];
  };
  const zone = (count: number) => ({
    fill: fill(count),
    stroke: stroke(count),
    strokeWidth: 1.5,
  });

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <div className="text-xs font-medium text-gray-600 text-center">{label}</div>}
      <svg
        viewBox="0 0 60 120"
        width="60"
        height="120"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${label ? label + ' — ' : ''}A=${zoneA} B=${zoneB} C=${zoneC}`}
      >
        {/* Zone C — tête et torse (5 pts) */}
        <ellipse cx="30" cy="10" rx="9" ry="9" {...zone(zoneC)} />
        <rect x="18" y="22" width="24" height="56" rx="4" {...zone(zoneC)} />

        {/* Zone B — bras et jambes (3 pts) */}
        <rect x="6" y="24" width="10" height="34" rx="4" {...zone(zoneB)} />
        <rect x="44" y="24" width="10" height="34" rx="4" {...zone(zoneB)} />
        <rect x="18" y="80" width="11" height="36" rx="4" {...zone(zoneB)} />
        <rect x="31" y="80" width="11" height="36" rx="4" {...zone(zoneB)} />

        {/* Zone A — mains / arme (1 pt) */}
        <circle cx="11" cy="64" r="5" {...zone(zoneA)} />
        <circle cx="49" cy="64" r="5" {...zone(zoneA)} />
      </svg>

      {/* Légende */}
      <div className="grid grid-cols-3 gap-1 w-full text-center">
        {[
          { zone: 'A', count: zoneA, pts: '1pt' },
          { zone: 'B', count: zoneB, pts: '3pts' },
          { zone: 'C', count: zoneC, pts: '5pts' },
        ].map(({ zone: z, count, pts }, i) => (
          <div key={z} className={`rounded px-1 py-0.5 ${palette.legend[i]}`}>
            <div className="text-xs font-bold">{count}</div>
            <div className="text-[10px] leading-tight">
              {z} · {pts}
            </div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="text-[10px] text-gray-400">
          {translateStatic(`touchHeatmap.touches_${total > 1 ? 'other' : 'one'}`, { count: total })}
        </div>
      )}
    </div>
  );
};
