/**
 * BellePoule Modern - Modale de détail d'un combattant
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Competition, FencerCompetitionStats } from '../../../shared/types';
import { FencerMatchRecord } from '../../../shared/types/preload';
import { useTranslation } from '../../../renderer/contexts/TranslationContext';
import { exportFencerDetailPDF } from '../../../shared/utils/fencerDetailPdfExport';
import { TouchZoneHeatmap } from '../../../renderer/components/analytics/TouchZoneHeatmap';

interface Props {
  fencer: FencerCompetitionStats;
  competition: Competition;
  onClose: () => void;
}

function fmt(seconds: number): string {
  if (!seconds) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function relTime(ts: string, startIso: string | null): string {
  if (!startIso) return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = Math.max(
    0,
    Math.floor((new Date(ts).getTime() - new Date(startIso).getTime()) / 1000)
  );
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`;
}

interface ParsedScore {
  value: number | null;
  isVictory: boolean;
  isAbstention: boolean;
  isExclusion: boolean;
  isForfait: boolean;
}

function parseScore(json: string | null): ParsedScore | null {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

function matchOutcome(rec: FencerMatchRecord): {
  myScore: number | null;
  oppScore: number | null;
  isVictory: boolean;
  outcomeLabel: string;
} {
  const sA = parseScore(rec.scoreA);
  const sB = parseScore(rec.scoreB);
  const mine = rec.side === 'A' ? sA : sB;
  const opp = rec.side === 'A' ? sB : sA;
  const isVictory = mine?.isVictory ?? false;
  const outcomeLabel = mine?.isVictory
    ? 'Victoire'
    : mine?.isExclusion
      ? 'Exclusion'
      : mine?.isForfait
        ? 'Forfait'
        : mine?.isAbstention
          ? 'Abstention'
          : 'Défaite';
  return { myScore: mine?.value ?? null, oppScore: opp?.value ?? null, isVictory, outcomeLabel };
}

const CARD_EMOJI: Record<string, string> = {
  white: '⬜',
  yellow: '🟡',
  red: '🔴',
  black: '⬛',
};
const CARD_COLOR: Record<string, string> = {
  white: 'text-gray-400',
  yellow: 'text-yellow-600',
  red: 'text-red-600',
  black: 'text-gray-900 font-bold',
};

export const FencerDetailModal: React.FC<Props> = ({ fencer, competition, onClose }) => {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<FencerMatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const isLaser = competition.weapon === 'L';

  const cardReasonLabels = useCallback(() => {
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.electronAPI?.db
      .getFencerHistory(fencer.fencerId)
      .then(hist => {
        if (!cancelled) setMatches(hist.matches);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fencer.fencerId]);

  const handleExportFencer = async () => {
    setExporting(true);
    try {
      await exportFencerDetailPDF(fencer, matches, competition, cardReasonLabels());
    } finally {
      setExporting(false);
    }
  };

  const victories = matches.filter(m => matchOutcome(m).isVictory).length;
  const cardTotal = fencer.whiteCards + fencer.yellowCards + fencer.redCards;
  const labels = cardReasonLabels();

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {fencer.fencerLastName.toUpperCase()} {fencer.fencerFirstName}
            </h2>
            {fencer.fencerClub && <p className="text-sm text-gray-500">{fencer.fencerClub}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-700">{fencer.matchesPlayed}</div>
            <div className="text-xs text-gray-500 mt-0.5">{t('stats.matches_played')}</div>
            <div className="text-xs text-gray-400">
              {victories}V · {fencer.matchesPlayed - victories}D
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-700">
              {fmt(fencer.averageDurationSeconds)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{t('stats.avg_duration')}</div>
            <div className="text-xs text-gray-400">Total : {fmt(fencer.totalDurationSeconds)}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-700">{cardTotal || '0'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Cartons</div>
            <div className="text-xs text-gray-400">
              {fencer.whiteCards > 0 && `${fencer.whiteCards}⬜ `}
              {fencer.yellowCards > 0 && `${fencer.yellowCards}🟡 `}
              {fencer.redCards > 0 && `${fencer.redCards}🔴`}
              {cardTotal === 0 && '—'}
            </div>
          </div>
          {isLaser ? (
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">{fencer.totalTouchPoints}</div>
              <div className="text-xs text-gray-500 mt-0.5">Points touches</div>
              <div className="text-xs text-gray-400">
                A:{fencer.touchesZoneA} B:{fencer.touchesZoneB} C:{fencer.touchesZoneC}
              </div>
            </div>
          ) : null}
        </div>

        {/* Heatmap Laser Sabre */}
        {isLaser && (
          <div className="px-5 py-3 bg-blue-50 border-b border-gray-200 flex-shrink-0">
            <div className="text-xs font-semibold text-gray-600 mb-2">Répartition des touches</div>
            <div className="flex justify-center">
              <TouchZoneHeatmap
                zoneA={fencer.touchesZoneA}
                zoneB={fencer.touchesZoneB}
                zoneC={fencer.touchesZoneC}
              />
            </div>
          </div>
        )}

        {/* Sorties piste (armes classiques) */}
        {!isLaser && (
          <div className="grid grid-cols-4 gap-3 px-5 py-0 bg-gray-50 border-b border-gray-200 flex-shrink-0">
            <div></div>
            <div></div>
            <div></div>
            <div className="text-center py-2">
              <div className="text-2xl font-bold text-blue-700">{fencer.arenaExits || '0'}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t('stats.arena_exits')}</div>
              <div className="text-xs text-gray-400">&nbsp;</div>
            </div>
          </div>
        )}

        {/* Match list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Chargement…</div>
          ) : matches.length === 0 ? (
            <div className="text-center text-gray-400 py-8">Aucun match terminé enregistré.</div>
          ) : (
            matches.map((rec, i) => {
              const { myScore, oppScore, isVictory, outcomeLabel } = matchOutcome(rec);
              const oppName = rec.opponentLastName
                ? `${rec.opponentLastName}${rec.opponentFirstName ? ' ' + rec.opponentFirstName : ''}`
                : '—';
              const scoreStr =
                myScore !== null && oppScore !== null ? `${myScore} – ${oppScore}` : '';
              const durStr = rec.duration ? fmt(rec.duration) : '—';
              const phaseStr = rec.poolId ? 'Poule' : rec.tableId ? `Tour ${rec.round ?? ''}` : '';

              type RawTouch = (typeof rec.touches)[0];
              type RawCard = (typeof rec.cards)[0];
              type Ev =
                | { ts: string; type: 'touch'; data: RawTouch }
                | { ts: string; type: 'card'; data: RawCard };

              const events: Ev[] = [
                ...rec.touches.map(t => ({ ts: t.timestamp, type: 'touch' as const, data: t })),
                ...rec.cards.map(c => ({ ts: c.timestamp, type: 'card' as const, data: c })),
              ].sort((a, b) => a.ts.localeCompare(b.ts));

              return (
                <div
                  key={rec.matchId}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <div className="flex justify-between items-center px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="font-medium text-sm">
                      {phaseStr ? `Match ${i + 1} (${phaseStr})` : `Match ${i + 1}`} – vs {oppName}
                    </span>
                    <span className="text-sm">
                      <span className={isVictory ? 'text-green-600 font-bold' : 'text-red-600'}>
                        {outcomeLabel}
                      </span>
                      {scoreStr && ` ${scoreStr}`}
                      <span className="text-gray-400 ml-2">{durStr}</span>
                    </span>
                  </div>

                  {events.length === 0 ? (
                    <p className="text-xs text-gray-400 italic px-3 py-2">
                      Aucun événement enregistré
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {events.map((ev, j) => {
                        const time = relTime(ev.ts, rec.startTime);
                        if (ev.type === 'touch') {
                          const tz = ev.data.zone;
                          const zoneLabel =
                            tz === 'A'
                              ? 'Zone A – 1 pt'
                              : tz === 'B'
                                ? 'Zone B – 3 pts'
                                : tz === 'C'
                                  ? 'Zone C – 5 pts'
                                  : `Zone ${tz}`;
                          return (
                            <li key={j} className="flex items-baseline gap-2 px-3 py-1 text-xs">
                              <span className="text-gray-400 font-mono w-8 flex-shrink-0">
                                {time}
                              </span>
                              <span className="text-blue-600">● {zoneLabel}</span>
                              {ev.data.isReversed && (
                                <span className="text-gray-400 italic">(annulée)</span>
                              )}
                            </li>
                          );
                        } else {
                          const ct = ev.data.cardType.toLowerCase();
                          const emoji = CARD_EMOJI[ct] ?? '❓';
                          const colorClass = CARD_COLOR[ct] ?? 'text-gray-600';
                          const reason =
                            labels[ev.data.reason.toUpperCase()] ??
                            ev.data.reason.replace(/_/g, ' ');
                          return (
                            <li key={j} className="flex items-baseline gap-2 px-3 py-1 text-xs">
                              <span className="text-gray-400 font-mono w-8 flex-shrink-0">
                                {time}
                              </span>
                              <span className={colorClass}>
                                {emoji} {reason}
                                {ev.data.resultingExclusion && (
                                  <span className="text-red-700 font-bold"> → Exclusion</span>
                                )}
                              </span>
                            </li>
                          );
                        }
                      })}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Fermer
          </button>
          <button
            onClick={handleExportFencer}
            disabled={exporting || loading}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {exporting ? 'Export…' : t('stats.export_fencer_pdf')}
          </button>
        </div>
      </div>
    </div>
  );
};
