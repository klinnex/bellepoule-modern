/**
 * BellePoule Modern - Classement saisonnier Quest (multi-compétitions)
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Competition, PoolRanking } from '../../shared/types';
import { calculateOverallRankingQuest } from '../../shared/utils/poolCalculations';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SeasonEntry {
  fencerId: string;
  fencerLastName: string;
  fencerFirstName: string;
  fencerClub: string | null;
  totalVictories: number;
  totalMatchesPlayed: number;
  totalQuestPoints: number;
  totalQuestV4: number;
  totalQuestV3: number;
  totalQuestV2: number;
  totalQuestV1: number;
  totalTouchesScored: number;
  totalTouchesReceived: number;
  totalRedCards: number;
  competitionCount: number;
  ratio: number;
}

interface SeasonCompetition {
  competitionId: string;
  competitionTitle: string;
  competitionDate: string;
  fencerCount: number;
  addedAt: string;
}

interface SeasonRankingViewProps {
  onClose: () => void;
  availableCompetitions?: Competition[];
  availablePoolsByComp?: Record<string, import('../../shared/types').Pool[]>;
}

function exportCSV(entries: SeasonEntry[]) {
  const headers = ['Rang', 'Nom', 'Prénom', 'Club', 'V', 'M', 'V/M', 'QP', 'V4', 'V3', 'V2', 'V1', 'TD', 'TR', 'Ind', 'Cartons 🔴', 'Compétitions'];
  const rows = entries.map((e, i) => [
    i + 1,
    e.fencerLastName, e.fencerFirstName, e.fencerClub ?? '',
    e.totalVictories, e.totalMatchesPlayed,
    e.totalMatchesPlayed > 0 ? (e.totalVictories / e.totalMatchesPlayed).toFixed(3) : '0.000',
    e.totalQuestPoints, e.totalQuestV4, e.totalQuestV3, e.totalQuestV2, e.totalQuestV1,
    e.totalTouchesScored, e.totalTouchesReceived,
    e.totalTouchesScored - e.totalTouchesReceived,
    e.totalRedCards, e.competitionCount,
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `classement-saison-quest-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ──────────────────────────────────────────────────────────────────

export const SeasonRankingView: React.FC<SeasonRankingViewProps> = ({
  onClose,
  availableCompetitions = [],
  availablePoolsByComp = {},
}) => {
  const [ranking, setRanking] = useState<SeasonEntry[]>([]);
  const [competitions, setCompetitions] = useState<SeasonCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeTab, setActiveTab] = useState<'ranking' | 'competitions'>('ranking');
  const [sortKey, setSortKey] = useState<keyof SeasonEntry>('totalQuestPoints');
  const [sortAsc, setSortAsc] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        window.electronAPI.db.getSeasonRanking(),
        window.electronAPI.db.getSeasonCompetitions(),
      ]);
      setRanking(r as SeasonEntry[]);
      setCompetitions(c as SeasonCompetition[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAddCompetition = async (comp: Competition) => {
    const pools = availablePoolsByComp[comp.id];
    if (!pools || pools.length === 0) {
      alert('Aucune poule disponible pour cette compétition.');
      return;
    }
    setAdding(true);
    try {
      const questRanking: PoolRanking[] = calculateOverallRankingQuest(pools);
      const compDate = comp.date instanceof Date
        ? comp.date.toISOString()
        : String(comp.date ?? new Date().toISOString());

      await window.electronAPI.db.addCompetitionToSeason({
        competitionId: comp.id,
        competitionTitle: comp.title,
        competitionDate: compDate,
        entries: questRanking.map((r, i) => ({
          fencerId: r.fencer.id,
          fencerLastName: r.fencer.lastName,
          fencerFirstName: r.fencer.firstName ?? '',
          fencerClub: r.fencer.club ?? undefined,
          victories: r.victories,
          matchesPlayed: r.matchesPlayed,
          questPoints: r.questPoints ?? 0,
          questV4: r.questVictories4 ?? 0,
          questV3: r.questVictories3 ?? 0,
          questV2: r.questVictories2 ?? 0,
          questV1: r.questVictories1 ?? 0,
          touchesScored: r.touchesScored,
          touchesReceived: r.touchesReceived,
          redCards: 0,
          compRank: i + 1,
        })),
      });
      await reload();
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (competitionId: string) => {
    await window.electronAPI.db.removeCompetitionFromSeason(competitionId);
    await reload();
  };

  const handleReset = async () => {
    await window.electronAPI.db.resetSeason();
    setConfirmReset(false);
    await reload();
  };

  const sortedRanking = [...ranking].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortAsc ? av - bv : bv - av;
  });

  const handleSort = (key: keyof SeasonEntry) => {
    if (sortKey === key) setSortAsc(x => !x);
    else { setSortKey(key); setSortAsc(false); }
  };

  const alreadyAdded = new Set(competitions.map(c => c.competitionId));
  const questComps = availableCompetitions.filter(
    c => (c.weapon === 'L' || (c as any).questEnabled) && !alreadyAdded.has(c.id)
  );

  const Th: React.FC<{ k: keyof SeasonEntry; label: string; title?: string }> = ({ k, label, title }) => (
    <th
      className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
      onClick={() => handleSort(k)}
      title={title}
    >
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Classement saisonnier Quest</h2>
            <p className="text-sm text-gray-500">
              {competitions.length} compétition{competitions.length > 1 ? 's' : ''} · {ranking.length} tireurs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCSV(sortedRanking)}
              disabled={ranking.length === 0}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-40"
            >
              ⬇ CSV
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              disabled={ranking.length === 0}
              className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-sm rounded hover:bg-red-100 disabled:opacity-40"
            >
              Réinitialiser saison
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl px-1 leading-none">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['ranking', 'competitions'] as const).map(tab => (
            <button
              key={tab}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'ranking' ? 'Classement' : 'Compétitions'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center text-gray-400 py-16">Chargement…</div>
          ) : activeTab === 'ranking' ? (
            ranking.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-4xl mb-3">🏆</div>
                <p className="font-medium">Aucune compétition dans la saison.</p>
                <p className="text-sm mt-1">Allez dans l'onglet "Compétitions" pour en ajouter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase text-center w-8">#</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase text-left">Nom</th>
                      <th className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase text-left">Club</th>
                      <Th k="ratio" label="V/M" title="Ratio victoires/matchs" />
                      <Th k="totalQuestPoints" label="QP" title="Points Quest cumulés" />
                      <Th k="totalQuestV4" label="V4" title="Victoires 4 pts (écart ≥12)" />
                      <Th k="totalQuestV3" label="V3" title="Victoires 3 pts (écart 8–11)" />
                      <Th k="totalQuestV2" label="V2" title="Victoires 2 pts (écart 4–7)" />
                      <Th k="totalQuestV1" label="V1" title="Victoires 1 pt (écart ≤3)" />
                      <Th k="totalRedCards" label="🔴" title="Cartons rouges" />
                      <Th k="totalTouchesScored" label="TD" title="Touches données" />
                      <Th k="totalTouchesReceived" label="TR" title="Touches reçues" />
                      <Th k="competitionCount" label="Compét." title="Nombre de compétitions disputées" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRanking.map((e, i) => {
                      const ind = e.totalTouchesScored - e.totalTouchesReceived;
                      return (
                        <tr key={e.fencerId} className="hover:bg-blue-50">
                          <td className="px-2 py-2 text-center font-bold text-gray-400">{i + 1}</td>
                          <td className="px-2 py-2 font-semibold text-gray-900 whitespace-nowrap">
                            {e.fencerLastName.toUpperCase()} {e.fencerFirstName}
                          </td>
                          <td className="px-2 py-2 text-gray-500 text-xs">{e.fencerClub ?? '—'}</td>
                          <td className="px-2 py-2 text-center font-mono">
                            {e.totalMatchesPlayed > 0 ? (e.totalVictories / e.totalMatchesPlayed).toFixed(3) : '—'}
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-blue-700">{e.totalQuestPoints}</td>
                          <td className="px-2 py-2 text-center text-emerald-700">{e.totalQuestV4 || '—'}</td>
                          <td className="px-2 py-2 text-center text-blue-600">{e.totalQuestV3 || '—'}</td>
                          <td className="px-2 py-2 text-center text-indigo-500">{e.totalQuestV2 || '—'}</td>
                          <td className="px-2 py-2 text-center text-gray-500">{e.totalQuestV1 || '—'}</td>
                          <td className="px-2 py-2 text-center text-red-600">{e.totalRedCards || '—'}</td>
                          <td className="px-2 py-2 text-center font-mono">{e.totalTouchesScored}</td>
                          <td className="px-2 py-2 text-center font-mono">{e.totalTouchesReceived}</td>
                          <td className="px-2 py-2 text-center text-gray-400">{e.competitionCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* Compétitions dans la saison */}
              {competitions.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Dans la saison</div>
                  <div className="space-y-2">
                    {competitions.map(c => (
                      <div key={c.competitionId} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">{c.competitionTitle}</div>
                          <div className="text-xs text-gray-500">{new Date(c.competitionDate).toLocaleDateString()} · {c.fencerCount} tireurs</div>
                        </div>
                        <button
                          onClick={() => handleRemove(c.competitionId)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compétitions disponibles à ajouter */}
              {questComps.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Disponibles (Laser Sabre / Quest)</div>
                  <div className="space-y-2">
                    {questComps.map(c => {
                      const hasPools = (availablePoolsByComp[c.id]?.length ?? 0) > 0;
                      return (
                        <div key={c.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                          <div>
                            <div className="font-medium text-gray-900">{c.title}</div>
                            <div className="text-xs text-gray-500">
                              {c.date instanceof Date ? c.date.toLocaleDateString() : String(c.date ?? '')}
                              {!hasPools && <span className="text-yellow-600 ml-2">⚠ Aucune poule</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddCompetition(c)}
                            disabled={adding || !hasPools}
                            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40"
                          >
                            {adding ? '…' : '+ Ajouter'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {questComps.length === 0 && competitions.length === 0 && (
                <div className="text-center text-gray-400 py-12">
                  Aucune compétition Sabre Laser disponible dans cette session.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm reset */}
        {confirmReset && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl z-10">
            <div className="bg-white rounded-lg p-6 shadow-2xl max-w-sm w-full mx-4">
              <h3 className="font-bold text-gray-900 mb-2">Réinitialiser la saison ?</h3>
              <p className="text-sm text-gray-500 mb-4">
                Toutes les compétitions et tous les classements saisonniers seront effacés. Cette action est irréversible.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Annuler
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
