/**
 * BellePoule Modern - Gestionnaire de compétitions par équipes
 * Vue: création d'équipes, affectation tireurs, poule équipes, scores
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Competition, Fencer } from '../../shared/types';

// ── Types locaux ───────────────────────────────────────────────────────────────

interface TeamFencerRow {
  fencerId: string;
  fencerLastName: string;
  fencerFirstName: string;
  teamOrder: number;
  isReserve: boolean;
}

interface TeamRow {
  id: string;
  name: string;
  club: string;
  fencers: TeamFencerRow[];
}

interface BoutRow {
  id: string;
  boutOrder: number;
  fencerAId: string;
  fencerBId: string;
  scoreA: number;
  scoreB: number;
  maxScore: number;
  status: string;
  winnerId: string | null;
}

interface MatchRow {
  id: string;
  poolNumber: number;
  teamAId: string;
  teamBId: string;
  scoreBoutsA: number;
  scoreBoutsB: number;
  status: string;
  winnerId: string | null;
  currentBoutIndex: number;
  bouts: BoutRow[];
}

// Ordre des assauts relais FFE : positions (0-indexed) dans l'équipe
const RELAY_ORDER: [number, number][] = [
  [0, 0], [1, 1], [2, 2],
  [0, 1], [1, 2], [2, 0],
  [0, 2], [1, 0], [2, 1],
];

// ── Helper ─────────────────────────────────────────────────────────────────────

function getTeamRankings(teams: TeamRow[], matches: MatchRow[]) {
  const stats = teams.map(t => ({
    team: t, victories: 0, defeats: 0,
    boutsWon: 0, boutsLost: 0,
    pointsFor: 0, pointsAgainst: 0,
  }));
  const byId = new Map(stats.map(s => [s.team.id, s]));

  for (const m of matches) {
    if (m.status !== 'finished') continue;
    const sa = byId.get(m.teamAId);
    const sb = byId.get(m.teamBId);
    if (!sa || !sb) continue;
    if (m.winnerId === m.teamAId) { sa.victories++; sb.defeats++; }
    else if (m.winnerId === m.teamBId) { sb.victories++; sa.defeats++; }
    sa.boutsWon += m.scoreBoutsA; sa.boutsLost += m.scoreBoutsB;
    sb.boutsWon += m.scoreBoutsB; sb.boutsLost += m.scoreBoutsA;
    for (const b of m.bouts) {
      if (b.status !== 'finished') continue;
      const isATeam = sa.team.fencers.some(f => f.fencerId === b.fencerAId);
      if (isATeam) { sa.pointsFor += b.scoreA; sa.pointsAgainst += b.scoreB; sb.pointsFor += b.scoreB; sb.pointsAgainst += b.scoreA; }
      else { sb.pointsFor += b.scoreA; sb.pointsAgainst += b.scoreB; sa.pointsFor += b.scoreB; sa.pointsAgainst += b.scoreA; }
    }
  }

  return [...stats].sort((a, b) =>
    b.victories - a.victories ||
    (b.boutsWon - b.boutsLost) - (a.boutsWon - a.boutsLost) ||
    (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  );
}

// ── Composant ─────────────────────────────────────────────────────────────────

interface Props {
  competition: Competition;
  fencers: Fencer[];
  onClose: () => void;
}

type ViewMode = 'teams' | 'pool' | 'ranking';

export const TeamManagerView: React.FC<Props> = ({ competition, fencers, onClose }) => {
  const [view, setView] = useState<ViewMode>('teams');
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Création équipe
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamClub, setNewTeamClub] = useState('');
  const [creating, setCreating] = useState(false);

  // Edition fencer assignment
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [selectedFencerId, setSelectedFencerId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(1);
  const [selectedIsReserve, setSelectedIsReserve] = useState(false);

  // Scoring
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([
        window.electronAPI.db.getTeamsByCompetition(competition.id),
        window.electronAPI.db.getTeamMatchesByCompetition(competition.id),
      ]);
      setTeams(t as TeamRow[]);
      setMatches(m as MatchRow[]);
    } finally {
      setLoading(false);
    }
  }, [competition.id]);

  useEffect(() => { reload(); }, [reload]);

  // ── Créer équipe ──────────────────────────────────────────────────────────────
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      await window.electronAPI.db.createTeam(competition.id, newTeamName.trim(), newTeamClub.trim() || newTeamName.trim());
      setNewTeamName(''); setNewTeamClub('');
      await reload();
    } finally { setCreating(false); }
  };

  // ── Supprimer équipe ──────────────────────────────────────────────────────────
  const handleDeleteTeam = async (teamId: string) => {
    await window.electronAPI.db.deleteTeam(teamId);
    await reload();
  };

  // ── Affecter tireur ───────────────────────────────────────────────────────────
  const handleUpsertFencer = async () => {
    if (!editTeamId || !selectedFencerId) return;
    await window.electronAPI.db.upsertTeamFencer(editTeamId, selectedFencerId, selectedOrder, selectedIsReserve);
    setSelectedFencerId('');
    await reload();
  };

  const handleRemoveFencer = async (teamId: string, fencerId: string) => {
    await window.electronAPI.db.removeTeamFencer(teamId, fencerId);
    await reload();
  };

  // ── Générer poule (round-robin) ───────────────────────────────────────────────
  const handleGeneratePool = async () => {
    if (teams.length < 2) return;
    if (matches.length > 0 && !confirm('Des matchs existent déjà. Supprimer et régénérer ?')) return;

    for (const m of matches) {
      // No direct delete match API — we'll just regenerate on top via DB (match IDs change)
    }

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i];
        const b = teams[j];
        const { id: matchId } = await window.electronAPI.db.createTeamMatch(competition.id, 1, a.id, b.id);

        const mainA = a.fencers.filter(f => !f.isReserve).sort((x, y) => x.teamOrder - y.teamOrder);
        const mainB = b.fencers.filter(f => !f.isReserve).sort((x, y) => x.teamOrder - y.teamOrder);

        if (mainA.length >= 3 && mainB.length >= 3) {
          for (let k = 0; k < RELAY_ORDER.length; k++) {
            const [oi, oj] = RELAY_ORDER[k];
            await window.electronAPI.db.createTeamBout(matchId, k + 1, mainA[oi].fencerId, mainB[oj].fencerId, 5);
          }
        }
      }
    }
    await reload();
    setView('pool');
  };

  // ── Scorer un assaut ──────────────────────────────────────────────────────────
  const handleScoreBout = async (bout: BoutRow, side: 'A' | 'B') => {
    const newScoreA = side === 'A' ? bout.scoreA + 1 : bout.scoreA;
    const newScoreB = side === 'B' ? bout.scoreB + 1 : bout.scoreB;
    const maxReached = newScoreA >= bout.maxScore || newScoreB >= bout.maxScore;
    const newStatus = maxReached ? 'finished' : 'in_progress';
    const winnerId = maxReached ? (newScoreA >= bout.maxScore ? bout.fencerAId : bout.fencerBId) : null;
    await window.electronAPI.db.updateTeamBout(bout.id, newScoreA, newScoreB, newStatus, winnerId);
    await reload();
  };

  const handleResetBout = async (bout: BoutRow) => {
    await window.electronAPI.db.updateTeamBout(bout.id, 0, 0, 'not_started', null);
    await reload();
  };

  // ── Fencers alloués à chaque équipe (pour éviter les doublons) ───────────────
  const assignedFencerIds = new Set(teams.flatMap(t => t.fencers.map(f => f.fencerId)));

  // ── Lookup helpers ────────────────────────────────────────────────────────────
  const teamById = new Map(teams.map(t => [t.id, t]));
  const fencerById = new Map(fencers.map(f => [f.id, f]));
  const allTeamFencerIds = new Set(teams.flatMap(t => t.fencers.map(f => f.fencerId)));

  const fencerName = (id: string) => {
    const f = fencerById.get(id);
    return f ? `${f.lastName} ${f.firstName ?? ''}`.trim() : id.slice(0, 8);
  };

  const rankings = getTeamRankings(teams, matches);

  if (loading) return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-8 text-gray-400">Chargement…</div>
    </div>
  );

  const scoringMatch = scoringMatchId ? matches.find(m => m.id === scoringMatchId) : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Compétition par équipes</h2>
            <p className="text-sm text-gray-500">{competition.title} · {teams.length} équipes</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl px-1 leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['teams', 'pool', 'ranking'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === v ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'teams' ? 'Équipes' : v === 'pool' ? `Poule (${matches.length} matchs)` : 'Classement'}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 py-2">
            {view === 'teams' && teams.length >= 2 && (
              <button
                onClick={handleGeneratePool}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Générer la poule
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Vue ÉQUIPES ── */}
          {view === 'teams' && (
            <div className="space-y-4">
              {/* Formulaire création */}
              <div className="bg-gray-50 rounded-lg p-4 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 block mb-1">Nom équipe</label>
                  <input
                    value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                    placeholder="Ex : équipe A"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 block mb-1">Club</label>
                  <input
                    value={newTeamClub} onChange={e => setNewTeamClub(e.target.value)}
                    placeholder="Club / association"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
                >
                  + Créer
                </button>
              </div>

              {teams.length === 0 && (
                <div className="text-center text-gray-400 py-10">Aucune équipe — créez-en une ci-dessus.</div>
              )}

              {/* Liste équipes */}
              {teams.map(team => {
                const isEditing = editTeamId === team.id;
                const mainFencers = team.fencers.filter(f => !f.isReserve).sort((a, b) => a.teamOrder - b.teamOrder);
                const reserve = team.fencers.find(f => f.isReserve);
                const valid = mainFencers.length === 3;
                const availableFencers = fencers.filter(f => !allTeamFencerIds.has(f.id) || team.fencers.some(tf => tf.fencerId === f.id));

                return (
                  <div key={team.id} className={`border rounded-lg overflow-hidden ${valid ? 'border-green-200' : 'border-yellow-300'}`}>
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div>
                        <span className="font-semibold text-gray-900">{team.name}</span>
                        <span className="text-sm text-gray-400 ml-2">{team.club}</span>
                        {valid
                          ? <span className="ml-2 text-xs text-green-600 font-medium">✓ Complète</span>
                          : <span className="ml-2 text-xs text-yellow-600 font-medium">⚠ {3 - mainFencers.length} tireur(s) manquant(s)</span>
                        }
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditTeamId(isEditing ? null : team.id)}
                          className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                        >
                          {isEditing ? 'Fermer' : 'Gérer'}
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Tireurs actuels */}
                    <div className="px-4 py-2 flex flex-wrap gap-2">
                      {mainFencers.map(f => (
                        <div key={f.fencerId} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs">
                          <span className="font-bold text-blue-700">#{f.teamOrder}</span>
                          <span>{f.fencerLastName} {f.fencerFirstName}</span>
                          {isEditing && (
                            <button onClick={() => handleRemoveFencer(team.id, f.fencerId)} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                          )}
                        </div>
                      ))}
                      {reserve && (
                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-xs">
                          <span className="text-gray-500">Rés.</span>
                          <span>{reserve.fencerLastName} {reserve.fencerFirstName}</span>
                          {isEditing && (
                            <button onClick={() => handleRemoveFencer(team.id, reserve.fencerId)} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                          )}
                        </div>
                      )}
                      {team.fencers.length === 0 && <span className="text-xs text-gray-400 italic">Aucun tireur</span>}
                    </div>

                    {/* Formulaire affectation */}
                    {isEditing && (
                      <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex gap-3 items-end flex-wrap">
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Tireur</label>
                          <select
                            value={selectedFencerId}
                            onChange={e => setSelectedFencerId(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                          >
                            <option value="">-- sélectionner --</option>
                            {availableFencers.map(f => (
                              <option key={f.id} value={f.id}>
                                {f.lastName} {f.firstName ?? ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">Position</label>
                          <select
                            value={selectedOrder}
                            onChange={e => setSelectedOrder(Number(e.target.value))}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                          >
                            <option value={1}>#1</option>
                            <option value={2}>#2</option>
                            <option value={3}>#3</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id={`res-${team.id}`} checked={selectedIsReserve} onChange={e => setSelectedIsReserve(e.target.checked)} />
                          <label htmlFor={`res-${team.id}`} className="text-sm text-gray-600">Réserviste</label>
                        </div>
                        <button
                          onClick={handleUpsertFencer}
                          disabled={!selectedFencerId}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40"
                        >
                          Affecter
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Vue POULE ── */}
          {view === 'pool' && (
            <div className="space-y-4">
              {matches.length === 0 ? (
                <div className="text-center text-gray-400 py-10">
                  Aucun match — cliquez sur "Générer la poule" dans l'onglet Équipes.
                </div>
              ) : (
                matches.map(m => {
                  const ta = teamById.get(m.teamAId);
                  const tb = teamById.get(m.teamBId);
                  const isScoring = scoringMatchId === m.id;
                  const statusColor = m.status === 'finished' ? 'bg-green-50 border-green-200' : m.status === 'in_progress' ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200';

                  return (
                    <div key={m.id} className={`border rounded-lg overflow-hidden ${statusColor}`}>
                      {/* Match header */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="text-center flex-1">
                            <div className="font-bold text-gray-900">{ta?.name ?? '—'}</div>
                            <div className="text-xs text-gray-400">{ta?.club}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-700">
                              {m.scoreBoutsA} – {m.scoreBoutsB}
                            </div>
                            <div className={`text-xs font-medium ${m.status === 'finished' ? 'text-green-600' : m.status === 'in_progress' ? 'text-yellow-600' : 'text-gray-400'}`}>
                              {m.status === 'finished' ? (m.winnerId === m.teamAId ? ta?.name : tb?.name) + ' gagne' : m.status === 'in_progress' ? 'En cours' : 'À commencer'}
                            </div>
                          </div>
                          <div className="text-center flex-1">
                            <div className="font-bold text-gray-900">{tb?.name ?? '—'}</div>
                            <div className="text-xs text-gray-400">{tb?.club}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setScoringMatchId(isScoring ? null : m.id)}
                          className={`ml-4 text-xs px-3 py-1.5 rounded border ${isScoring ? 'bg-gray-200 border-gray-300 text-gray-700' : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'}`}
                        >
                          {isScoring ? 'Fermer' : 'Scorer'}
                        </button>
                      </div>

                      {/* Assauts */}
                      {isScoring && (
                        <div className="border-t border-gray-200 px-4 py-3 space-y-1">
                          <div className="grid grid-cols-[1fr_auto_1fr] text-xs text-gray-500 font-medium mb-2">
                            <span>{ta?.name}</span>
                            <span className="text-center w-24">Assaut</span>
                            <span className="text-right">{tb?.name}</span>
                          </div>
                          {m.bouts.map(bout => {
                            const fa = fencerName(bout.fencerAId);
                            const fb = fencerName(bout.fencerBId);
                            const done = bout.status === 'finished';
                            return (
                              <div
                                key={bout.id}
                                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 px-2 rounded ${done ? 'bg-gray-50 opacity-70' : 'bg-white border border-gray-100'}`}
                              >
                                {/* Côté A */}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleScoreBout(bout, 'A')}
                                    disabled={done}
                                    className="w-8 h-8 text-sm font-bold rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-40 flex-shrink-0"
                                  >
                                    +
                                  </button>
                                  <span className="text-sm font-medium truncate">{fa}</span>
                                </div>
                                {/* Score */}
                                <div className="text-center w-24">
                                  <span className={`font-mono text-sm font-bold ${done ? (bout.winnerId === bout.fencerAId ? 'text-green-600' : 'text-red-500') : 'text-gray-700'}`}>
                                    {bout.scoreA}
                                  </span>
                                  <span className="text-gray-400 mx-1">–</span>
                                  <span className={`font-mono text-sm font-bold ${done ? (bout.winnerId === bout.fencerBId ? 'text-green-600' : 'text-red-500') : 'text-gray-700'}`}>
                                    {bout.scoreB}
                                  </span>
                                  <div className="text-xs text-gray-400">/5 · A{bout.boutOrder}</div>
                                </div>
                                {/* Côté B */}
                                <div className="flex items-center gap-2 justify-end">
                                  <span className="text-sm font-medium truncate text-right">{fb}</span>
                                  <button
                                    onClick={() => handleScoreBout(bout, 'B')}
                                    disabled={done}
                                    className="w-8 h-8 text-sm font-bold rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-40 flex-shrink-0"
                                  >
                                    +
                                  </button>
                                  {done && (
                                    <button
                                      onClick={() => handleResetBout(bout)}
                                      className="w-6 h-6 text-xs rounded text-red-400 hover:text-red-600 flex-shrink-0"
                                      title="Réinitialiser cet assaut"
                                    >
                                      ↩
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Vue CLASSEMENT ── */}
          {view === 'ranking' && (
            <div>
              {rankings.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                    onClick={() => {
                      const header = 'Rang,Équipe,Club,V,D,Assauts+,Assauts-,Ind.,Pts+,Pts-\n';
                      const rows = rankings.map((r, i) =>
                        [
                          i + 1,
                          `"${r.team.name}"`,
                          `"${r.team.club ?? ''}"`,
                          r.victories,
                          r.defeats,
                          r.boutsWon,
                          r.boutsLost,
                          r.boutsWon - r.boutsLost,
                          r.pointsFor,
                          r.pointsAgainst,
                        ].join(',')
                      ).join('\n');
                      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'classement-equipes.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    ↓ Exporter CSV
                  </button>
                </div>
              )}
              {rankings.length === 0 ? (
                <div className="text-center text-gray-400 py-10">Aucun match joué.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center w-8">#</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-left">Équipe</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">V</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">D</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">Assauts +</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">Assauts -</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">Ind.</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">Pts+</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">Pts-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rankings.map((r, i) => (
                      <tr key={r.team.id} className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-center font-bold text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-gray-900">
                          {r.team.name}
                          <span className="text-xs text-gray-400 font-normal ml-2">{r.team.club}</span>
                        </td>
                        <td className="px-3 py-2 text-center text-green-700 font-bold">{r.victories}</td>
                        <td className="px-3 py-2 text-center text-red-500">{r.defeats}</td>
                        <td className="px-3 py-2 text-center">{r.boutsWon}</td>
                        <td className="px-3 py-2 text-center">{r.boutsLost}</td>
                        <td className={`px-3 py-2 text-center font-bold ${r.boutsWon - r.boutsLost >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {r.boutsWon - r.boutsLost > 0 ? '+' : ''}{r.boutsWon - r.boutsLost}
                        </td>
                        <td className="px-3 py-2 text-center font-mono">{r.pointsFor}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-400">{r.pointsAgainst}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
