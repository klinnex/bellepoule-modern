/**
 * BellePoule Modern - Tableau de statistiques par combattant
 * Licensed under GPL-3.0
 */

import { Button } from '../../../renderer/components/common/Button';
import React, { useEffect, useState, useCallback } from 'react';
import { Competition, FencerCompetitionStats, Weapon } from '../../../shared/types';
import { FencerMatchRecord } from '../../../shared/types/preload';
import { useTranslation } from '../../../renderer/contexts/TranslationContext';
import { CardIcon } from '../../../renderer/components/common/CardIcon';
import { FencerDetailModal } from './FencerDetailModal';
import { exportCompetitionDetailPDF } from '../../../shared/utils/fencerDetailPdfExport';
import {
  ColumnsMenu,
  useColumnVisibility,
  type ColumnDef,
} from '../../../renderer/components/analytics/ColumnsMenu';

interface FencerStatsTableProps {
  competition: Competition;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const FencerStatsTableComponent: React.FC<FencerStatsTableProps> = ({ competition }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<FencerCompetitionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof FencerCompetitionStats>('fencerLastName');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedFencer, setSelectedFencer] = useState<FencerCompetitionStats | null>(null);
  const [exportingComp, setExportingComp] = useState(false);

  const isLaser = competition.weapon === Weapon.LASER;
  // Colonnes masquables (#1817) ; sorties d'arène : Sabre Laser uniquement
  const columns: ColumnDef[] = [
    { id: 'club', label: t('ranking.club') },
    ...(isLaser
      ? [
          { id: 'zones', label: t('stats.zones_column') },
          { id: 'received', label: t('stats.received_points') },
        ]
      : []),
    { id: 'white', label: t('stats.white_cards') },
    { id: 'yellow', label: t('stats.yellow_cards') },
    { id: 'red', label: t('stats.red_cards') },
    ...(isLaser ? [{ id: 'exits', label: t('stats.arena_exits') }] : []),
    { id: 'matches', label: t('stats.matches_played') },
    { id: 'duration', label: t('stats.avg_duration') },
    { id: 'early', label: t('stats.early_finishes') },
  ];
  const { isVisible, toggle } = useColumnVisibility('bp-analytics-stats-columns', columns);
  const show = (id: string) => columns.some(c => c.id === id) && isVisible(id);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI?.db.getCompetitionFencerStats(competition.id);
      setStats((data as FencerCompetitionStats[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [competition.id]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const handleSort = (key: keyof FencerCompetitionStats) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const cardReasonLabels = useCallback((): Record<string, string> => {
    const reasons = [
      'EARLY_START',
      'LATE_STOP',
      'BODY_CONTACT',
      'COUNTER_ATTACK',
      'TARGET_SUBSTITUTION',
      'VOLUNTARY_DROP',
      'TIME_WASTING',
      'NON_COMPLIANT_GEAR',
      'ESTOC',
      'UNARMED_HAND',
      'VOLUNTARY_EXIT',
      'HEAVY_HIT',
      'BRUTALITY',
      'DANGEROUS',
      'REFUSAL',
      'UNSPORTSMANLIKE',
      'CHEATING',
    ];
    const labels: Record<string, string> = {};
    for (const r of reasons) {
      labels[r] = t(`cardReasons.${r}`) ?? r.replace(/_/g, ' ');
    }
    return labels;
  }, [t]);

  const exportCompetitionPdf = async () => {
    if (!window.electronAPI?.file) return;
    setExportingComp(true);
    try {
      const entries = await Promise.all(
        stats.map(async s => {
          const hist = await window.electronAPI.db.getFencerHistory(s.fencerId);
          return [s.fencerId, hist.matches] as [string, FencerMatchRecord[]];
        })
      );
      const histories = new Map(entries);
      await exportCompetitionDetailPDF(sorted, histories, competition, cardReasonLabels());
    } finally {
      setExportingComp(false);
    }
  };

  const exportPdf = async () => {
    if (!window.electronAPI?.file) return;
    const rows = sorted
      .map(
        s => `
      <tr>
        <td>${s.fencerLastName} ${s.fencerFirstName}</td>
        <td>${s.fencerClub ?? '—'}</td>
        ${isLaser ? `<td>${s.touchesZoneA}</td><td>${s.touchesZoneB}</td><td>${s.touchesZoneC}</td><td>${s.totalTouchPoints}</td><td>${s.receivedTouchPoints ?? 0}</td>` : ''}
        <td>${s.whiteCards}</td>
        <td>${s.yellowCards}</td>
        <td>${s.redCards}</td>
        ${isLaser ? `<td>${s.arenaExits}</td>` : ''}
        <td>${s.matchesPlayed}</td>
        <td>${formatDuration(s.averageDurationSeconds)}</td>
        <td>${s.matchesFinishedEarly}</td>
      </tr>`
      )
      .join('');

    const laserHeaders = isLaser
      ? `<th>Zone A</th><th>Zone B</th><th>Zone C</th><th>Pts</th><th>${t('stats.received_points')}</th>`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        h2 { font-size: 12px; color: #666; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e40af; color: white; padding: 6px 4px; text-align: left; font-size: 10px; }
        td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f9fafb; }
      </style></head><body>
      <h1>${t('stats.title')}</h1>
      <h2>${competition.title} — ${competition.date instanceof Date ? competition.date.toLocaleDateString() : ''}</h2>
      <table><thead><tr>
        <th>Nom / Prénom</th>
        <th>Club</th>
        ${laserHeaders}
        <th>${t('stats.white_cards')}</th>
        <th>${t('stats.yellow_cards')}</th>
        <th>${t('stats.red_cards')}</th>
        ${isLaser ? `<th>${t('stats.arena_exits')}</th>` : ''}
        <th>${t('stats.matches_played')}</th>
        <th>${t('stats.avg_duration')}</th>
        <th>${t('stats.early_finishes')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;

    const result = await window.electronAPI.dialog.saveFile({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: `stats-${competition.title.replace(/\s+/g, '-')}.pdf`,
    });
    if (result?.filePath) {
      await window.electronAPI.file.printHtmlToPDF(html, result.filePath);
    }
  };

  const Th: React.FC<{ k: keyof FencerCompetitionStats; label: React.ReactNode }> = ({
    k,
    label,
  }) => (
    <th
      className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{t('fencerStats.loading')}</div>;
  }

  if (stats.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>{t('stats.no_data')}</p>
      </div>
    );
  }

  return (
    <>
      {selectedFencer && (
        <FencerDetailModal
          fencer={selectedFencer}
          competition={competition}
          onClose={() => setSelectedFencer(null)}
        />
      )}
      <div>
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs text-gray-500">
            {t('fencerStats.count', { count: sorted.length })}
            {isLaser ? ` — ${t('stats.laser_only')}` : ''}
          </p>
          <div className="flex gap-2">
            <ColumnsMenu columns={columns} isVisible={isVisible} onToggle={toggle} />
            <Button size="sm" onClick={exportCompetitionPdf} loading={exportingComp}>
              {t('stats.export_competition_pdf')}
            </Button>
            <Button variant="primary" size="sm" onClick={exportPdf}>
              {t('stats.export_pdf')}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th k="fencerLastName" label={t('fencerStats.name')} />
                {show('club') && <Th k="fencerClub" label={t('ranking.club')} />}
                {show('zones') && (
                  <>
                    <Th k="touchesZoneA" label={t('stats.zone_a')} />
                    <Th k="touchesZoneB" label={t('stats.zone_b')} />
                    <Th k="touchesZoneC" label={t('stats.zone_c')} />
                    <Th k="totalTouchPoints" label={t('stats.total_points')} />
                  </>
                )}
                {show('received') && (
                  <Th k="receivedTouchPoints" label={t('stats.received_points')} />
                )}
                {show('white') && (
                  <Th
                    k="whiteCards"
                    label={<CardIcon type="white" label={t('stats.white_cards')} />}
                  />
                )}
                {show('yellow') && (
                  <Th
                    k="yellowCards"
                    label={<CardIcon type="yellow" label={t('stats.yellow_cards')} />}
                  />
                )}
                {show('red') && (
                  <Th k="redCards" label={<CardIcon type="red" label={t('stats.red_cards')} />} />
                )}
                {show('exits') && <Th k="arenaExits" label={t('stats.arena_exits')} />}
                {show('matches') && <Th k="matchesPlayed" label={t('stats.matches_played')} />}
                {show('duration') && (
                  <Th k="averageDurationSeconds" label={t('stats.avg_duration')} />
                )}
                {show('early') && <Th k="matchesFinishedEarly" label={t('stats.early_finishes')} />}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sorted.map(s => (
                <tr
                  key={s.fencerId}
                  className="hover:bg-blue-50 cursor-pointer"
                  onClick={() => setSelectedFencer(s)}
                  title={t('fencerStats.detail')}
                >
                  <td className="px-2 py-2 font-medium whitespace-nowrap underline ">
                    {s.fencerLastName} {s.fencerFirstName}
                  </td>
                  {show('club') && (
                    <td className="px-2 py-2 text-gray-600">{s.fencerClub ?? '—'}</td>
                  )}
                  {show('zones') && (
                    <>
                      <td className="px-2 py-2 text-center">{s.touchesZoneA}</td>
                      <td className="px-2 py-2 text-center">{s.touchesZoneB}</td>
                      <td className="px-2 py-2 text-center">{s.touchesZoneC}</td>
                      <td className="px-2 py-2 text-center font-semibold">{s.totalTouchPoints}</td>
                    </>
                  )}
                  {show('received') && (
                    <td className="px-2 py-2 text-center text-red-600">
                      {s.receivedTouchPoints ?? 0}
                    </td>
                  )}
                  {show('white') && (
                    <td className="px-2 py-2 text-center">{s.whiteCards || '—'}</td>
                  )}
                  {show('yellow') && (
                    <td className="px-2 py-2 text-center">{s.yellowCards || '—'}</td>
                  )}
                  {show('red') && <td className="px-2 py-2 text-center">{s.redCards || '—'}</td>}
                  {show('exits') && (
                    <td className="px-2 py-2 text-center">{s.arenaExits || '—'}</td>
                  )}
                  {show('matches') && <td className="px-2 py-2 text-center">{s.matchesPlayed}</td>}
                  {show('duration') && (
                    <td className="px-2 py-2 text-center">
                      {formatDuration(s.averageDurationSeconds)}
                    </td>
                  )}
                  {show('early') && (
                    <td className="px-2 py-2 text-center">{s.matchesFinishedEarly || '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export const FencerStatsTable = React.memo(FencerStatsTableComponent);
