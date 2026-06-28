/**
 * BellePoule Modern - Graphiques SVG analytics (sans librairie externe)
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { Competition, FencerCompetitionStats, Weapon } from '../../../shared/types';
import { TouchZoneHeatmap } from './TouchZoneHeatmap';

interface Props {
  competition: Competition;
  stats: FencerCompetitionStats[];
}

// ── Mini bar chart horizontal ──────────────────────────────────────────────────

interface BarItem {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}

const HBar: React.FC<{ items: BarItem[]; maxValue?: number; title: string }> = ({ items, maxValue, title }) => {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1);
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-20 text-right text-xs text-gray-600 truncate flex-shrink-0">{item.label}</div>
            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color }}
              />
            </div>
            <div className="w-10 text-xs font-mono text-gray-700 flex-shrink-0">
              {item.value}
              {item.sublabel && <span className="text-gray-400 ml-0.5">{item.sublabel}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Donut chart SVG ────────────────────────────────────────────────────────────

interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

const Donut: React.FC<{ slices: DonutSlice[]; title: string; centerLabel?: string }> = ({ slices, title, centerLabel }) => {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</div>
      <div className="text-center text-gray-300 text-sm py-8">Aucune donnée</div>
    </div>
  );

  const r = 34;
  const cx = 44;
  const cy = 44;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const arcs = slices.map(sl => {
    const pct = sl.value / total;
    const arc = { pct, offset, color: sl.color, label: sl.label, value: sl.value };
    offset += pct;
    return arc;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</div>
      <div className="flex items-center gap-4">
        <svg width="88" height="88" viewBox="0 0 88 88" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth="14"
              strokeDasharray={`${arc.pct * circ} ${circ}`}
              strokeDashoffset={-arc.offset * circ}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          {centerLabel && (
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#374151">
              {centerLabel}
            </text>
          )}
        </svg>
        <div className="space-y-1.5">
          {arcs.map((arc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: arc.color }} />
              <span className="text-gray-600">{arc.label}</span>
              <span className="font-mono font-medium text-gray-800 ml-auto">{arc.value}</span>
              <span className="text-gray-400">({(arc.pct * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Aggregated heatmap (moyenne sur tous les tireurs) ──────────────────────────

const AggregateHeatmap: React.FC<{ stats: FencerCompetitionStats[] }> = ({ stats }) => {
  const totA = stats.reduce((s, x) => s + x.touchesZoneA, 0);
  const totB = stats.reduce((s, x) => s + x.touchesZoneB, 0);
  const totC = stats.reduce((s, x) => s + x.touchesZoneC, 0);
  const totalPts = totA * 1 + totB * 3 + totC * 5;

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Zones de touches — {stats.length} tireurs
      </div>
      <div className="flex items-center gap-6">
        <TouchZoneHeatmap zoneA={totA} zoneB={totB} zoneC={totC} />
        <div className="space-y-3 flex-1">
          {[
            { zone: 'A', count: totA, pts: 1, color: '#bfdbfe', border: '#93c5fd', text: 'Main/Arme' },
            { zone: 'B', count: totB, pts: 3, color: '#60a5fa', border: '#3b82f6', text: 'Bras/Jambes' },
            { zone: 'C', count: totC, pts: 5, color: '#1d4ed8', border: '#1e40af', text: 'Tête/Torse' },
          ].map(z => {
            const total = totA + totB + totC;
            const pct = total > 0 ? ((z.count / total) * 100).toFixed(1) : '0.0';
            return (
              <div key={z.zone}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Zone {z.zone} · {z.text} · {z.pts}pt{z.pts > 1 ? 's' : ''}</span>
                  <span className="font-mono">{z.count} ({pct}%)</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: z.color,
                      border: `1px solid ${z.border}`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div className="text-xs text-gray-400 mt-2">Total points marqués : <span className="font-bold text-gray-700">{totalPts}</span></div>
        </div>
      </div>
    </div>
  );
};

// ── Top tireurs bar chart ──────────────────────────────────────────────────────

const TopFencersChart: React.FC<{ stats: FencerCompetitionStats[]; isLaser: boolean }> = ({ stats, isLaser }) => {
  const sorted = [...stats]
    .sort((a, b) =>
      isLaser
        ? b.totalTouchPoints - a.totalTouchPoints
        : b.matchesPlayed - a.matchesPlayed
    )
    .slice(0, 8);

  if (sorted.length === 0) return null;

  const max = isLaser
    ? Math.max(...sorted.map(s => s.totalTouchPoints), 1)
    : Math.max(...sorted.map(s => s.matchesPlayed), 1);

  const items: BarItem[] = sorted.map((s, i) => ({
    label: `${i + 1}. ${s.fencerLastName}`,
    value: isLaser ? s.totalTouchPoints : s.matchesPlayed,
    color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#3b82f6',
    sublabel: isLaser ? 'pts' : 'M',
  }));

  return (
    <HBar
      items={items}
      maxValue={max}
      title={isLaser ? 'Top tireurs — Points touches' : 'Top tireurs — Matchs joués'}
    />
  );
};

// ── Durée moyenne par tireur (histogram) ──────────────────────────────────────

const DurationChart: React.FC<{ stats: FencerCompetitionStats[] }> = ({ stats }) => {
  const withDuration = stats.filter(s => s.averageDurationSeconds > 0);
  if (withDuration.length === 0) return null;

  const buckets = [
    { label: '<1min', min: 0, max: 60, color: '#10b981' },
    { label: '1–2min', min: 60, max: 120, color: '#3b82f6' },
    { label: '2–3min', min: 120, max: 180, color: '#8b5cf6' },
    { label: '3–4min', min: 180, max: 240, color: '#f59e0b' },
    { label: '>4min', min: 240, max: Infinity, color: '#ef4444' },
  ];

  const items: BarItem[] = buckets.map(b => ({
    label: b.label,
    value: withDuration.filter(s => s.averageDurationSeconds >= b.min && s.averageDurationSeconds < b.max).length,
    color: b.color,
    sublabel: 't.',
  }));

  return <HBar items={items} title="Distribution durée moyenne des matchs" />;
};

// ── Cards by reason ──────────────────────────────────────────────────────────

const CARD_REASON_FR: Record<string, string> = {
  EARLY_START: 'Départ anticipé',
  LATE_STOP: 'Arrêt tardif',
  BODY_CONTACT: 'Contact corporel',
  COUNTER_ATTACK: 'Contre-attaque',
  TARGET_SUBSTITUTION: 'Substitution cible',
  VOLUNTARY_DROP: 'Abandon arme',
  TIME_WASTING: 'Perte de temps',
  NON_COMPLIANT_GEAR: 'Équip. non conforme',
  ESTOC: 'Estoc',
  UNARMED_HAND: 'Main libre',
  VOLUNTARY_EXIT: 'Sortie volontaire',
  HEAVY_HIT: 'Coup violent',
  BRUTALITY: 'Brutalité',
  DANGEROUS: 'Dangereux',
  REFUSAL: 'Refus',
  UNSPORTSMANLIKE: 'Antisportif',
  CHEATING: 'Triche',
};

const CardsByReason: React.FC<{ stats: FencerCompetitionStats[] }> = ({ stats }) => {
  const totals: Record<string, number> = {};
  for (const s of stats) {
    for (const [reason, count] of Object.entries(s.cardsByReason ?? {})) {
      totals[reason] = (totals[reason] ?? 0) + (count as number);
    }
  }
  const entries = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  if (entries.length === 0) return null;

  const items: BarItem[] = entries.map(([reason, count]) => ({
    label: CARD_REASON_FR[reason] ?? reason,
    value: count,
    color: '#f59e0b',
  }));

  return <HBar items={items} title="Cartons par motif" />;
};

// ── Export CSV ─────────────────────────────────────────────────────────────────

async function exportCSV(competition: Competition, stats: FencerCompetitionStats[]) {
  const isLaser = competition.weapon === Weapon.LASER;
  const headers = [
    'Nom', 'Prénom', 'Club',
    ...(isLaser ? ['Zone A', 'Zone B', 'Zone C', 'Points total'] : []),
    'Cartons blancs', 'Cartons jaunes', 'Cartons rouges',
    'Sorties piste', 'Matchs joués', 'Durée moy. (s)', 'Fins anticipées',
  ];

  const rows = stats.map(s => [
    s.fencerLastName, s.fencerFirstName, s.fencerClub ?? '',
    ...(isLaser ? [s.touchesZoneA, s.touchesZoneB, s.touchesZoneC, s.totalTouchPoints] : []),
    s.whiteCards, s.yellowCards, s.redCards,
    s.arenaExits, s.matchesPlayed, s.averageDurationSeconds, s.matchesFinishedEarly,
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  if (!window.electronAPI?.file) return;
  const result = await window.electronAPI.dialog.saveFile({
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    defaultPath: `stats-${competition.title.replace(/\s+/g, '-')}.csv`,
  });
  if (result?.filePath) {
    await window.electronAPI.file.writeContent(result.filePath, csv);
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export const AnalyticsCharts: React.FC<Props> = ({ competition, stats }) => {
  const [exporting, setExporting] = useState(false);
  const isLaser = competition.weapon === Weapon.LASER;

  const totalWhite = stats.reduce((s, x) => s + x.whiteCards, 0);
  const totalYellow = stats.reduce((s, x) => s + x.yellowCards, 0);
  const totalRed = stats.reduce((s, x) => s + x.redCards, 0);

  if (stats.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">📊</div>
        <div>Aucune statistique disponible — lancez des matchs d'abord.</div>
      </div>
    );
  }

  const handleExportCSV = async () => {
    setExporting(true);
    try { await exportCSV(competition, stats); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar export */}
      <div className="flex justify-end">
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
        >
          {exporting ? 'Export…' : '⬇ CSV'}
        </button>
      </div>

      {/* Zone heatmap — Laser Sabre only */}
      {isLaser && <AggregateHeatmap stats={stats} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Donut cartons */}
        <Donut
          title="Répartition des cartons"
          centerLabel={String(totalWhite + totalYellow + totalRed)}
          slices={[
            { label: 'Blancs', value: totalWhite, color: '#d1d5db' },
            { label: 'Jaunes', value: totalYellow, color: '#f59e0b' },
            { label: 'Rouges', value: totalRed, color: '#ef4444' },
          ]}
        />

        {/* Durée */}
        <DurationChart stats={stats} />
      </div>

      {/* Top fencers */}
      <TopFencersChart stats={stats} isLaser={isLaser} />

      {/* Cards by reason */}
      <CardsByReason stats={stats} />
    </div>
  );
};
