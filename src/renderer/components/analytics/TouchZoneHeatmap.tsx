/**
 * BellePoule Modern - Heatmap des zones de touche (Laser Sabre)
 * Licensed under GPL-3.0
 */

import React from 'react';

interface Props {
  zoneA: number;
  zoneB: number;
  zoneC: number;
  label?: string;
}

function intensity(count: number, max: number): string {
  if (max === 0 || count === 0) return 'rgba(59,130,246,0.08)';
  const ratio = count / max;
  const alpha = 0.15 + ratio * 0.75;
  return `rgba(59,130,246,${alpha.toFixed(2)})`;
}

function stroke(count: number, max: number): string {
  if (max === 0 || count === 0) return '#93c5fd';
  const ratio = count / max;
  if (ratio > 0.6) return '#1d4ed8';
  if (ratio > 0.3) return '#3b82f6';
  return '#93c5fd';
}

export const TouchZoneHeatmap: React.FC<Props> = ({ zoneA, zoneB, zoneC, label }) => {
  const max = Math.max(zoneA, zoneB, zoneC, 1);
  const total = zoneA + zoneB + zoneC;

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <div className="text-xs font-medium text-gray-600 text-center">{label}</div>}
      <svg
        viewBox="0 0 60 120"
        width="60"
        height="120"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`Heatmap: Zone A=${zoneA} B=${zoneB} C=${zoneC}`}
      >
        {/* Tête */}
        <ellipse cx="30" cy="10" rx="9" ry="9" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1" />

        {/* Zone C — jambes (5 pts) */}
        <rect
          x="18"
          y="80"
          width="11"
          height="36"
          rx="4"
          fill={intensity(zoneC, max)}
          stroke={stroke(zoneC, max)}
          strokeWidth="1.5"
        />
        <rect
          x="31"
          y="80"
          width="11"
          height="36"
          rx="4"
          fill={intensity(zoneC, max)}
          stroke={stroke(zoneC, max)}
          strokeWidth="1.5"
        />

        {/* Zone B — bras (3 pts) */}
        <rect
          x="6"
          y="30"
          width="10"
          height="30"
          rx="4"
          fill={intensity(zoneB, max)}
          stroke={stroke(zoneB, max)}
          strokeWidth="1.5"
        />
        <rect
          x="44"
          y="30"
          width="10"
          height="30"
          rx="4"
          fill={intensity(zoneB, max)}
          stroke={stroke(zoneB, max)}
          strokeWidth="1.5"
        />

        {/* Zone A — torse (1 pt) */}
        <rect
          x="18"
          y="22"
          width="24"
          height="56"
          rx="4"
          fill={intensity(zoneA, max)}
          stroke={stroke(zoneA, max)}
          strokeWidth="1.5"
        />
      </svg>

      {/* Légende */}
      <div className="grid grid-cols-3 gap-1 w-full text-center">
        {[
          { zone: 'A', count: zoneA, pts: '1pt', color: 'bg-blue-100 text-blue-800' },
          { zone: 'B', count: zoneB, pts: '3pts', color: 'bg-blue-200 text-blue-900' },
          { zone: 'C', count: zoneC, pts: '5pts', color: 'bg-blue-400 text-white' },
        ].map(({ zone, count, pts, color }) => (
          <div key={zone} className={`rounded px-1 py-0.5 ${color}`}>
            <div className="text-xs font-bold">{count}</div>
            <div className="text-[10px] leading-tight">
              {zone} · {pts}
            </div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="text-[10px] text-gray-400">
          {total} touche{total > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};
