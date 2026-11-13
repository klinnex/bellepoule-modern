/**
 * BellePoule Modern - Mannequin des zones de touche (Sabre Laser)
 * Règlement : A = main + manche du sabre (1 pt), B = bras ou jambe (3 pts), C = tronc ou tête (5 pts).
 * Une couleur par zone ; intensité selon le rang : foncé = zone la plus sollicitée,
 * moyen = intermédiaire, clair = la plus faible, gris = aucune touche.
 * `variant` : « given » (touches portées) ou « received » (touches reçues) — cadre bleu / rouge.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { translateStatic } from '../../contexts/TranslationContext';

export type HeatmapVariant = 'given' | 'received';
type Zone = 'a' | 'b' | 'c';
export type ZoneShade = 'dark' | 'medium' | 'light' | 'none';

interface Props {
  zoneA: number;
  zoneB: number;
  zoneC: number;
  label?: string;
  variant?: HeatmapVariant;
}

/** Teintes par zone (légende : styles/analytics.css, mêmes valeurs) */
const HUES: Record<Zone, Record<Exclude<ZoneShade, 'none'>, string>> = {
  a: { dark: '#b45309', medium: '#f59e0b', light: '#fde68a' },
  b: { dark: '#047857', medium: '#10b981', light: '#a7f3d0' },
  c: { dark: '#6d28d9', medium: '#8b5cf6', light: '#ddd6fe' },
};
const NONE_FILL = '#f3f4f6';
const NONE_STROKE = '#d1d5db';

/** Rang de la zone parmi les trois : la plus touchée = foncé, la moins touchée = clair. */
export function zoneShade(count: number, counts: number[]): ZoneShade {
  if (count <= 0) return 'none';
  const positive = counts.filter(c => c > 0);
  if (count === Math.max(...positive)) return 'dark';
  if (count === Math.min(...positive)) return 'light';
  return 'medium';
}

export const TouchZoneHeatmap: React.FC<Props> = ({
  zoneA,
  zoneB,
  zoneC,
  label,
  variant = 'given',
}) => {
  const counts = [zoneA, zoneB, zoneC];
  const total = zoneA + zoneB + zoneC;
  const shades: Record<Zone, ZoneShade> = {
    a: zoneShade(zoneA, counts),
    b: zoneShade(zoneB, counts),
    c: zoneShade(zoneC, counts),
  };
  const fillOf = (z: Zone) => {
    const s = shades[z];
    return s === 'none' ? NONE_FILL : HUES[z][s];
  };
  const strokeOf = (z: Zone) => (shades[z] === 'none' ? NONE_STROKE : HUES[z].dark);
  const zone = (z: Zone) => ({ fill: fillOf(z), stroke: strokeOf(z), strokeWidth: 1.2 });

  return (
    <div className={`touch-zones touch-zones--${variant}`}>
      {label && <div className="touch-zones__label">{label}</div>}
      <svg
        viewBox="0 0 80 124"
        width="100"
        height="155"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${label ? label + ' — ' : ''}A=${zoneA} B=${zoneB} C=${zoneC}`}
      >
        {/* Zone C — tête et tronc (5 pts) */}
        <ellipse cx="30" cy="11" rx="9" ry="9" {...zone('c')} />
        <rect x="18" y="23" width="24" height="54" rx="5" {...zone('c')} />

        {/* Zone B — bras et jambes (3 pts) */}
        <rect x="6" y="25" width="10" height="33" rx="4" {...zone('b')} />
        <rect x="44" y="25" width="10" height="33" rx="4" {...zone('b')} />
        <rect x="18" y="79" width="11" height="40" rx="4" {...zone('b')} />
        <rect x="31" y="79" width="11" height="40" rx="4" {...zone('b')} />

        {/* Lame du sabre (hors zone) */}
        <line
          x1="56"
          y1="56"
          x2="77"
          y2="8"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Zone A — mains + manche du sabre (1 pt) */}
        <circle cx="11" cy="63" r="5" {...zone('a')} />
        <line
          x1="46"
          y1="72"
          x2="56"
          y2="56"
          stroke={fillOf('a')}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <line x1="51" y1="55" x2="60" y2="60" stroke={strokeOf('a')} strokeWidth="1.5" />
        <circle cx="49" cy="63" r="5" {...zone('a')} />
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
          <div key={z} className={`zone-legend zone-legend--${z}-${shades[z]}`}>
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
