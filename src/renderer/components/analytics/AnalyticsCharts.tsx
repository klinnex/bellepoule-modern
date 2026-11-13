/**
 * BellePoule Modern - Graphiques SVG analytics (sans librairie externe)
 * Licensed under GPL-3.0
 */

import React, { useMemo, useState } from 'react';
import {
  Competition,
  Fencer,
  FencerCompetitionStats,
  FencerStatus,
  Match,
  MatchTiming,
  Weapon,
} from '../../../shared/types';
import { TouchZoneHeatmap, type HeatmapVariant } from './TouchZoneHeatmap';
import { useTranslation } from '../../hooks/useTranslation';
import { ChartColumn, Download } from 'lucide-react';
import { Icon } from '../common/Icon';
import {
  fencerIndexRanking,
  normalizeFinishedMatches,
  type KpiMatch,
  type KpiTableauMatch,
} from '../../../features/analytics/services/competitionKpis';
import { FencerKpiPanel } from './FencerKpiPanel';

type TFn = ReturnType<typeof useTranslation>['t'];

interface Props {
  competition: Competition;
  stats: FencerCompetitionStats[];
  /** Données pour l'indice moyen et les KPI par tireur (#1817) */
  fencers?: Fencer[];
  poolMatches?: Match[];
  tableauMatches?: KpiTableauMatch[];
  timings?: MatchTiming[];
  /** Rang après poules (classement général) */
  poolRanks?: Map<string, number>;
  /** Rang final après tableaux */
  finalRanks?: Map<string, number>;
}

// ── Mini bar chart horizontal ──────────────────────────────────────────────────

interface BarItem {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}

const HBar: React.FC<{ items: BarItem[]; maxValue?: number; title: string }> = ({
  items,
  maxValue,
  title,
}) => {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1);
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-20 text-right text-xs text-gray-600 truncate flex-shrink-0">
              {item.label}
            </div>
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

export const Donut: React.FC<{ slices: DonutSlice[]; title: string; centerLabel?: string }> = ({
  slices,
  title,
  centerLabel,
}) => {
  const { t } = useTranslation();
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0)
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {title}
        </div>
        <div className="text-center text-gray-300 text-sm py-8">{t('analyticsCharts.no_data')}</div>
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
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </div>
      <div className="flex items-center gap-4">
        <svg width="88" height="88" viewBox="0 0 88 88" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth="14"
              strokeDasharray={`${arc.pct * circ} ${circ}`}
              strokeDashoffset={-arc.offset * circ}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          {centerLabel && (
            <text
              x={cx}
              y={cy + 5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#374151"
            >
              {centerLabel}
            </text>
          )}
        </svg>
        <div className="space-y-1.5">
          {arcs.map((arc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: arc.color }}
              />
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

// ── Zones de touches : données / reçues, tous les tireurs ou un tireur ─────────

const ZONE_BARS = [
  { zone: 'A', pts: 1, color: '#f59e0b', border: '#b45309', key: 'analyticsCharts.zone_a' },
  { zone: 'B', pts: 3, color: '#10b981', border: '#047857', key: 'analyticsCharts.zone_b' },
  { zone: 'C', pts: 5, color: '#8b5cf6', border: '#6d28d9', key: 'analyticsCharts.zone_c' },
] as const;

const ZoneBreakdown: React.FC<{
  counts: [number, number, number];
  variant: HeatmapVariant;
  label: string;
  totalLabel: string;
}> = ({ counts, variant, label, totalLabel }) => {
  const { t } = useTranslation();
  const [a, b, c] = counts;
  const total = a + b + c;
  const totalPts = a + b * 3 + c * 5;
  return (
    <div className="flex items-center gap-6">
      <TouchZoneHeatmap zoneA={a} zoneB={b} zoneC={c} label={label} variant={variant} />
      <div className="space-y-3 flex-1">
        {ZONE_BARS.map((z, i) => {
          const pct = total > 0 ? ((counts[i] / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={z.zone}>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>
                  {t('analyticsCharts.zone_line', { zone: z.zone, text: t(z.key), count: z.pts })}
                </span>
                <span className="font-mono">
                  {counts[i]} ({pct}%)
                </span>
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
        <div className="text-xs text-gray-400 mt-2">
          {totalLabel} <span className="font-bold text-gray-700">{totalPts}</span>
        </div>
      </div>
    </div>
  );
};

const AggregateHeatmap: React.FC<{
  stats: FencerCompetitionStats[];
  title: string;
  showHint: boolean;
}> = ({ stats, title, showHint }) => {
  const { t } = useTranslation();
  const sum = (k: keyof FencerCompetitionStats) =>
    stats.reduce((acc, x) => acc + (Number(x[k]) || 0), 0);
  const given: [number, number, number] = [
    sum('touchesZoneA'),
    sum('touchesZoneB'),
    sum('touchesZoneC'),
  ];
  const received: [number, number, number] = [
    sum('receivedZoneA'),
    sum('receivedZoneB'),
    sum('receivedZoneC'),
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </div>
      {showHint && (
        <p className="text-xs text-gray-400 mb-3">{t('analyticsCharts.pick_fencer_hint')}</p>
      )}
      <div className="space-y-4">
        <ZoneBreakdown
          counts={given}
          variant="given"
          label={t('fencerDetail.touches_given')}
          totalLabel={t('analyticsCharts.total_points')}
        />
        <ZoneBreakdown
          counts={received}
          variant="received"
          label={t('fencerDetail.touches_received')}
          totalLabel={t('analyticsCharts.total_points_received')}
        />
      </div>
    </div>
  );
};

/** Filtre de l'onglet Graphiques : '' = tous, 'club:<nom>' ou 'fencer:<id>' */
export function filterStats(
  stats: FencerCompetitionStats[],
  filter: string
): FencerCompetitionStats[] {
  if (filter.startsWith('club:')) {
    const club = filter.slice(5);
    return stats.filter(s => (s.fencerClub ?? '') === club);
  }
  if (filter.startsWith('fencer:')) return stats.filter(s => s.fencerId === filter.slice(7));
  return stats;
}

// ── Top tireurs bar chart ──────────────────────────────────────────────────────

const TopFencersChart: React.FC<{ stats: FencerCompetitionStats[]; isLaser: boolean }> = ({
  stats,
  isLaser,
}) => {
  const { t } = useTranslation();
  const sorted = [...stats]
    .sort((a, b) =>
      isLaser ? b.totalTouchPoints - a.totalTouchPoints : b.matchesPlayed - a.matchesPlayed
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
    sublabel: isLaser ? t('analyticsCharts.pts') : t('analyticsCharts.m'),
  }));

  return (
    <HBar
      items={items}
      maxValue={max}
      title={isLaser ? t('analyticsCharts.top_points') : t('analyticsCharts.top_matches')}
    />
  );
};

// ── Indice moyen (TD − TR par match), armes olympiques (#1817) ─────────────────

const IndexChart: React.FC<{
  matches: KpiMatch[];
  names: Map<string, string>;
  restrictTo: Set<string> | null;
}> = ({ matches, names, restrictTo }) => {
  const { t } = useTranslation();
  const rows = fencerIndexRanking(matches)
    .filter(r => !restrictTo || restrictTo.has(r.fencerId))
    .slice(0, 8);
  if (rows.length === 0) return null;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.averageIndex)), 1);
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {t('analyticsCharts.index_title')}
      </div>
      <p className="text-xs text-gray-400 mb-3">{t('analyticsCharts.index_hint')}</p>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const pos = r.averageIndex >= 0;
          return (
            <div key={r.fencerId} className="flex items-center gap-2">
              <div className="w-24 text-right text-xs text-gray-600 truncate flex-shrink-0">
                {i + 1}. {names.get(r.fencerId) ?? '?'}
              </div>
              <div className="idx-bar">
                <progress
                  className="idx-bar__neg"
                  max={maxAbs}
                  value={pos ? 0 : Math.abs(r.averageIndex)}
                  aria-hidden="true"
                />
                <progress
                  className="idx-bar__pos"
                  max={maxAbs}
                  value={pos ? r.averageIndex : 0}
                  aria-hidden="true"
                />
              </div>
              <div className="w-20 text-xs font-mono text-gray-700 flex-shrink-0">
                {pos ? '+' : ''}
                {r.averageIndex.toFixed(2)}
                <span className="text-gray-400 ml-1">
                  ({r.matches}
                  {t('analyticsCharts.m')})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Durée moyenne par tireur (histogram) ──────────────────────────────────────

const DurationChart: React.FC<{ stats: FencerCompetitionStats[] }> = ({ stats }) => {
  const { t } = useTranslation();
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
    value: withDuration.filter(
      s => s.averageDurationSeconds >= b.min && s.averageDurationSeconds < b.max
    ).length,
    color: b.color,
    sublabel: t('analyticsCharts.fencers_short'),
  }));

  return <HBar items={items} title={t('analyticsCharts.duration_title')} />;
};

// ── Cards by reason ──────────────────────────────────────────────────────────

const CardsByReason: React.FC<{ stats: FencerCompetitionStats[] }> = ({ stats }) => {
  const { t } = useTranslation();
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

  const items: BarItem[] = entries.map(([reason, count]) => {
    const label = t(`cardReasons.${reason}`);
    return {
      label: label.startsWith('cardReasons.') ? reason : label,
      value: count,
      color: '#f59e0b',
    };
  });

  return <HBar items={items} title={t('analyticsCharts.cards_by_reason')} />;
};

// ── Export CSV ─────────────────────────────────────────────────────────────────

async function exportCSV(t: TFn, competition: Competition, stats: FencerCompetitionStats[]) {
  const isLaser = competition.weapon === Weapon.LASER;
  const headers = [
    t('ranking.name'),
    t('analyticsCharts.csv_first_name'),
    t('ranking.club'),
    ...(isLaser
      ? [
          'A',
          'B',
          'C',
          t('analyticsCharts.csv_total_points'),
          `${t('stats.received_points')} A`,
          `${t('stats.received_points')} B`,
          `${t('stats.received_points')} C`,
          t('stats.received_points'),
        ]
      : []),
    t('analyticsCharts.csv_white'),
    t('analyticsCharts.csv_yellow'),
    t('analyticsCharts.csv_red'),
    ...(isLaser ? [t('analyticsCharts.csv_exits')] : []),
    t('analyticsCharts.csv_matches'),
    t('analyticsCharts.csv_avg'),
    t('analyticsCharts.csv_early'),
  ];

  const rows = stats.map(s => [
    s.fencerLastName,
    s.fencerFirstName,
    s.fencerClub ?? '',
    ...(isLaser
      ? [
          s.touchesZoneA,
          s.touchesZoneB,
          s.touchesZoneC,
          s.totalTouchPoints,
          s.receivedZoneA ?? 0,
          s.receivedZoneB ?? 0,
          s.receivedZoneC ?? 0,
          s.receivedTouchPoints ?? 0,
        ]
      : []),
    s.whiteCards,
    s.yellowCards,
    s.redCards,
    ...(isLaser ? [s.arenaExits] : []),
    s.matchesPlayed,
    s.averageDurationSeconds,
    s.matchesFinishedEarly,
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

export const AnalyticsCharts: React.FC<Props> = ({
  competition,
  stats: allStats,
  fencers = [],
  poolMatches = [],
  tableauMatches = [],
  timings = [],
  poolRanks,
  finalRanks,
}) => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const isLaser = competition.weapon === Weapon.LASER;
  const isOlympic = !isLaser && competition.weapon !== Weapon.CUSTOM;

  const [filter, setFilter] = useState('');
  const stats = filterStats(allStats, filter);
  const selectedFencerId = filter.startsWith('fencer:') ? filter.slice(7) : null;
  const clubs = [...new Set(allStats.map(s => s.fencerClub).filter((c): c is string => !!c))].sort(
    (a, b) => a.localeCompare(b)
  );
  const kpiMatches = useMemo(
    () => normalizeFinishedMatches(poolMatches, tableauMatches, timings),
    [poolMatches, tableauMatches, timings]
  );
  const names = useMemo(
    () => new Map(allStats.map(s => [s.fencerId, s.fencerLastName])),
    [allStats]
  );
  // Tireurs présents uniquement (pointés) dans la liste de sélection
  const absent = new Set(
    fencers.filter(f => f.status === FencerStatus.NOT_CHECKED_IN).map(f => f.id)
  );
  const fencersSorted = [...allStats]
    .filter(s => !absent.has(s.fencerId))
    .sort(
      (a, b) =>
        a.fencerLastName.localeCompare(b.fencerLastName) ||
        a.fencerFirstName.localeCompare(b.fencerFirstName)
    );
  const filterLabel = filter.startsWith('club:')
    ? filter.slice(5)
    : filter.startsWith('fencer:')
      ? `${stats[0]?.fencerLastName ?? ''} ${stats[0]?.fencerFirstName ?? ''}`.trim()
      : '';
  const totalWhite = stats.reduce((s, x) => s + x.whiteCards, 0);
  const totalYellow = stats.reduce((s, x) => s + x.yellowCards, 0);
  const totalRed = stats.reduce((s, x) => s + x.redCards, 0);

  if (allStats.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">
          <Icon icon={ChartColumn} />
        </div>
        <div>{t('analyticsCharts.empty')}</div>
      </div>
    );
  }

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await exportCSV(t, competition, stats);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar export */}
      <div className="flex justify-between items-center gap-3">
        <select
          className="form-select"
          aria-label={t('analyticsCharts.filter_label')}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">{t('analyticsCharts.global')}</option>
          {clubs.length > 0 && (
            <optgroup label={t('analyticsCharts.clubs')}>
              {clubs.map(c => (
                <option key={c} value={`club:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('analyticsCharts.fencers')}>
            {fencersSorted.map(s => (
              <option key={s.fencerId} value={`fencer:${s.fencerId}`}>
                {s.fencerLastName} {s.fencerFirstName}
                {s.fencerClub ? ` (${s.fencerClub})` : ''}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
        >
          {exporting ? (
            t('analyticsCharts.exporting')
          ) : (
            <>
              <Icon icon={Download} /> CSV
            </>
          )}
        </button>
      </div>

      {/* Zone heatmap — Laser Sabre only */}
      {isLaser && (
        <AggregateHeatmap
          stats={stats}
          title={
            filterLabel
              ? `${t('analyticsCharts.zones_title_short')} — ${filterLabel}`
              : t('analyticsCharts.zones_title', { n: stats.length })
          }
          showHint={!filter}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Donut cartons */}
        <Donut
          title={t('analyticsCharts.cards_split')}
          centerLabel={String(totalWhite + totalYellow + totalRed)}
          slices={[
            { label: t('analyticsCharts.white'), value: totalWhite, color: '#d1d5db' },
            { label: t('analyticsCharts.yellow'), value: totalYellow, color: '#f59e0b' },
            { label: t('analyticsCharts.red'), value: totalRed, color: '#ef4444' },
          ]}
        />

        {/* Durée */}
        <DurationChart stats={stats} />
      </div>

      {/* KPI du tireur sélectionné (#1817) : remplace le classement « Top tireurs » */}
      {selectedFencerId ? (
        <FencerKpiPanel
          fencerId={selectedFencerId}
          matches={kpiMatches}
          fencers={fencers}
          poolRank={poolRanks?.get(selectedFencerId) ?? null}
          finalRank={finalRanks?.get(selectedFencerId) ?? null}
        />
      ) : isOlympic ? (
        <IndexChart
          matches={kpiMatches}
          names={names}
          restrictTo={filter ? new Set(stats.map(s => s.fencerId)) : null}
        />
      ) : (
        <TopFencersChart stats={stats} isLaser={isLaser} />
      )}

      {/* Cards by reason */}
      <CardsByReason stats={stats} />
    </div>
  );
};
