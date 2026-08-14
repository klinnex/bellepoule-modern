/**
 * BellePoule Modern - Gestionnaire de compétitions par équipes
 * Vue: création d'équipes, affectation tireurs, poule équipes, tableau équipes, scores
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardReason, Competition, Fencer, Weapon } from '../../shared/types';
import { TeamRow, TeamMatchRow, TeamBoutRow, TeamMatchCardRow } from '../../features/teams/types/team.types';
import {
  generateRelayOrder,
  getTeamTargetRule,
  calculateTeamPoolRanking,
  calculateTableSize,
  placeRankedTeamsInTable,
  resolveTeamTableauSlot,
} from '../../features/teams/utils/teamCalculations';
import {
  getLaserArenaBoutCap,
  isLaserArenaBoutComplete,
  calculateLaserArenaPoolRanking,
} from '../../features/teams/utils/laserArenaCalculations';
import {
  applyRematchAvoidanceSwap,
  buildPoolPairHistory,
} from '../../features/teams/utils/laserArenaBracketRules';
import {
  getLaserArenaPoolSchedule,
  resolveLaserArenaSchedule,
} from '../../features/teams/utils/laserArenaPoolSchedules';
import { createCard } from '../../shared/utils/cardSystem';
import TeamPoolView, { CardTarget } from './TeamPoolView';
import TeamTableauView from './TeamTableauView';
import { useConfirm } from './ConfirmDialog';
import { useTranslation } from '../hooks/useTranslation';

const LASER_ARENA_POOL_NUMBER_BY_LETTER: Record<string, number> = { A: 1, B: 2, C: 3 };

// ── Composant ─────────────────────────────────────────────────────────────────

interface Props {
  competition: Competition;
  fencers: Fencer[];
  onClose: () => void;
}

type ViewMode = 'teams' | 'pool' | 'tableau' | 'ranking';

export const TeamManagerView: React.FC<Props> = ({ competition, fencers, onClose }) => {
  const teamSize = competition.settings?.minTeamSize ?? 3;
  const reserveCount = competition.settings?.teamReserveCount ?? 1;
  const targetRule = getTeamTargetRule(
    competition.weapon,
    teamSize,
    competition.settings?.laserTeamMode ?? 'touches',
    competition.settings?.teamRelayStepSize ?? 5
  );
  const isEpee = competition.weapon === Weapon.EPEE;
  const isLaserPoints = competition.weapon === Weapon.LASER && targetRule.mode === 'points';
  // Format arène Sabre Laser (assauts indépendants plafonnés à 5 touches/3min,
  // score = total de points) — distinct du relais FIE classique ci-dessus,
  // qui reste le comportement par défaut pour tous les autres cas.
  const isLaserArena = competition.settings?.teamFormat === 'laser-arena';
  const boutCap = getLaserArenaBoutCap();
  const tableId = competition.id; // Un seul tableau équipes par compétition
  const { confirm } = useConfirm();
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>('teams');
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<TeamMatchRow[]>([]);
  const [tableauMatches, setTableauMatches] = useState<TeamMatchRow[]>([]);
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

  // Cartons individuels par assaut (en mémoire pour la session — cf. limites connues en documentation)
  const [boutCards, setBoutCards] = useState<Record<string, Card[]>>({});
  const [cardTarget, setCardTarget] = useState<CardTarget | null>(null);
  const [selectedReason, setSelectedReason] = useState<CardReason | ''>('');

  // Cartons d'équipe "E" (format arène Sabre Laser uniquement), persistés en DB
  // par rencontre (matchId), contrairement aux cartons individuels ci-dessus.
  const [matchCards, setMatchCards] = useState<Record<string, TeamMatchCardRow[]>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m, tm] = await Promise.all([
        window.electronAPI.db.getTeamsByCompetition(competition.id),
        window.electronAPI.db.getTeamMatchesByCompetition(competition.id),
        window.electronAPI.db.getTeamTableauMatches(competition.id, tableId),
      ]);
      setTeams(t as TeamRow[]);
      setMatches(m as TeamMatchRow[]);
      setTableauMatches(tm as TeamMatchRow[]);
      if (isLaserArena) {
        const allMatchIds = [...(m as TeamMatchRow[]), ...(tm as TeamMatchRow[])].map(x => x.id);
        const cardsArrays = await Promise.all(
          allMatchIds.map(id => window.electronAPI.db.getTeamMatchCards(id))
        );
        const map: Record<string, TeamMatchCardRow[]> = {};
        allMatchIds.forEach((id, i) => {
          map[id] = cardsArrays[i] as TeamMatchCardRow[];
        });
        setMatchCards(map);
      }
    } finally {
      setLoading(false);
    }
  }, [competition.id, tableId, isLaserArena]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Fait avancer automatiquement le tableau : crée les matchs (+ relais) dès que
  // les deux équipes d'un round/position sont connues (têtes de série ou vainqueurs
  // des matchs précédents), sans jamais persister les exempts (byes).
  useEffect(() => {
    if (loading || teams.length < 2) return;

    const baseRankedTeams = isLaserArena
      ? calculateLaserArenaPoolRanking(teams, matches).map(r => r.team)
      : calculateTeamPoolRanking(teams, matches).map(r => r.team);
    // Évitement de revanche (format arène uniquement) : si les équipes classées
    // 5/6 ou 7/8 tombent contre une équipe déjà rencontrée en poule au 1er tour,
    // échange leurs places — n'affecte que le placement dans le tableau, pas le
    // classement de poule affiché dans l'onglet Classement.
    const rankedTeams = isLaserArena
      ? applyRematchAvoidanceSwap(baseRankedTeams, buildPoolPairHistory(matches))
      : baseRankedTeams;
    const tableSize = calculateTableSize(rankedTeams.length);
    const placements = placeRankedTeamsInTable(rankedTeams, tableSize);
    const teamByIdLocal = new Map(teams.map(t => [t.id, t]));
    const matchesByKey = new Map(tableauMatches.map(m => [`${m.round}-${m.position}`, m]));

    let cancelled = false;
    const createMissing = async () => {
      for (let round = tableSize / 2; round >= 1; round /= 2) {
        for (let position = 0; position < round; position++) {
          if (cancelled) return;
          const slot = resolveTeamTableauSlot(
            round,
            position,
            tableSize,
            placements,
            matchesByKey,
            teamByIdLocal
          );
          if (!slot.match && slot.teamA && slot.teamB) {
            const { id: matchId } = await window.electronAPI.db.createTeamTableauMatch(
              competition.id,
              tableId,
              round,
              position,
              slot.teamA.id,
              slot.teamB.id
            );
            const mainA = slot.teamA.fencers
              .filter(f => !f.isReserve)
              .sort((x, y) => x.teamOrder - y.teamOrder);
            const mainB = slot.teamB.fencers
              .filter(f => !f.isReserve)
              .sort((x, y) => x.teamOrder - y.teamOrder);
            if (mainA.length >= teamSize && mainB.length >= teamSize) {
              const relayOrder = generateRelayOrder(teamSize);
              for (let k = 0; k < relayOrder.length; k++) {
                const [oi, oj] = relayOrder[k];
                await window.electronAPI.db.createTeamBout(
                  matchId,
                  k + 1,
                  mainA[oi].fencerId,
                  mainB[oj].fencerId,
                  isLaserArena ? boutCap.maxTouches : targetRule.stepSize
                );
              }
            }
            matchesByKey.set(`${round}-${position}`, {
              id: matchId,
              round,
              position,
              teamAId: slot.teamA.id,
              teamBId: slot.teamB.id,
              scoreBoutsA: 0,
              scoreBoutsB: 0,
              status: 'not_started',
              winnerId: null,
              currentBoutIndex: 0,
              bouts: [],
            });
            if (!cancelled) await reload();
          }
        }
      }
    };
    createMissing();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    teams,
    matches,
    tableauMatches,
    competition.id,
    tableId,
    teamSize,
    targetRule.stepSize,
    isLaserArena,
    boutCap.maxTouches,
  ]);

  // ── Créer équipe ──────────────────────────────────────────────────────────────
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      await window.electronAPI.db.createTeam(
        competition.id,
        newTeamName.trim(),
        newTeamClub.trim() || newTeamName.trim()
      );
      setNewTeamName('');
      setNewTeamClub('');
      await reload();
    } finally {
      setCreating(false);
    }
  };

  // ── Supprimer équipe ──────────────────────────────────────────────────────────
  const handleDeleteTeam = async (teamId: string) => {
    await window.electronAPI.db.deleteTeam(teamId);
    await reload();
  };

  // ── Affecter tireur ───────────────────────────────────────────────────────────
  const handleUpsertFencer = async () => {
    if (!editTeamId || !selectedFencerId) return;
    await window.electronAPI.db.upsertTeamFencer(
      editTeamId,
      selectedFencerId,
      selectedOrder,
      selectedIsReserve
    );
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
    if (matches.length > 0 && !(await confirm('Des matchs existent déjà. Supprimer et régénérer ?')))
      return;

    if (isLaserArena) {
      // Calendrier de poule figé du règlement (uniquement 8 ou 12 équipes) —
      // aucune génération automatique pour un autre effectif : l'organisateur
      // reste sur la saisie manuelle des équipes.
      const schedule = getLaserArenaPoolSchedule(teams.length);
      if (!schedule) {
        alert(
          `Le calendrier de poule figé "Sabre Laser équipe" n'est défini que pour 8 ou 12 équipes (actuellement ${teams.length}).`
        );
        return;
      }
      const resolved = resolveLaserArenaSchedule(teams, schedule);
      for (const rm of resolved) {
        const { id: matchId } = await window.electronAPI.db.createTeamMatch(
          competition.id,
          LASER_ARENA_POOL_NUMBER_BY_LETTER[rm.pool] ?? 1,
          rm.teamA.id,
          rm.teamB.id,
          rm.round
        );
        const mainA = rm.teamA.fencers
          .filter(f => !f.isReserve)
          .sort((x, y) => x.teamOrder - y.teamOrder);
        const mainB = rm.teamB.fencers
          .filter(f => !f.isReserve)
          .sort((x, y) => x.teamOrder - y.teamOrder);
        if (mainA.length >= teamSize && mainB.length >= teamSize) {
          const relayOrder = generateRelayOrder(teamSize);
          for (let k = 0; k < relayOrder.length; k++) {
            const [oi, oj] = relayOrder[k];
            await window.electronAPI.db.createTeamBout(
              matchId,
              k + 1,
              mainA[oi].fencerId,
              mainB[oj].fencerId,
              boutCap.maxTouches
            );
          }
        }
      }
      await reload();
      setView('pool');
      return;
    }

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i];
        const b = teams[j];
        const { id: matchId } = await window.electronAPI.db.createTeamMatch(
          competition.id,
          1,
          a.id,
          b.id
        );

        const mainA = a.fencers.filter(f => !f.isReserve).sort((x, y) => x.teamOrder - y.teamOrder);
        const mainB = b.fencers.filter(f => !f.isReserve).sort((x, y) => x.teamOrder - y.teamOrder);

        if (mainA.length >= teamSize && mainB.length >= teamSize) {
          const relayOrder = generateRelayOrder(teamSize);
          for (let k = 0; k < relayOrder.length; k++) {
            const [oi, oj] = relayOrder[k];
            await window.electronAPI.db.createTeamBout(
              matchId,
              k + 1,
              mainA[oi].fencerId,
              mainB[oj].fencerId,
              targetRule.stepSize
            );
          }
        }
      }
    }
    await reload();
    setView('pool');
  };

  // ── Scorer un assaut (arme-aware) ─────────────────────────────────────────────
  // side='double' : touche double simultanée (épée uniquement, pas de priorité).
  // points : 1 par défaut, ou valeur de zone A/B/C (1/3/5) en Sabre Laser mode points.
  const handleScoreBout = async (
    bout: TeamBoutRow,
    side: 'A' | 'B' | 'double',
    points: number = 1
  ) => {
    const match = [...matches, ...tableauMatches].find(m => m.bouts.some(b => b.id === bout.id));
    if (!match) return;

    const newScoreA = side === 'A' || side === 'double' ? bout.scoreA + points : bout.scoreA;
    const newScoreB = side === 'B' || side === 'double' ? bout.scoreB + points : bout.scoreB;

    let maxReached: boolean;
    let winnerId: string | null;

    if (isLaserArena) {
      // Format arène : chaque assaut est indépendant, plafonné à 5 touches
      // valides cumulées (les deux côtés) — pas de cible d'équipe progressive.
      // Le plafond de 3 minutes s'applique côté saisie temps réel (tablette).
      maxReached = isLaserArenaBoutComplete(newScoreA, newScoreB, 0, boutCap);
      winnerId = maxReached
        ? newScoreA > newScoreB
          ? bout.fencerAId
          : newScoreB > newScoreA
            ? bout.fencerBId
            : null
        : null;
    } else {
      // Cible progressive FIE : le relais s'arrête quand le cumul d'équipe atteint
      // le palier (5-10-15…) de ce relais, ou la cible finale de la rencontre.
      const priorBouts = match.bouts.filter(b => b.boutOrder < bout.boutOrder);
      const cumulA = priorBouts.reduce((s, b) => s + b.scoreA, 0) + newScoreA;
      const cumulB = priorBouts.reduce((s, b) => s + b.scoreB, 0) + newScoreB;
      const cap = Math.min(bout.boutOrder * targetRule.stepSize, targetRule.target);
      maxReached = cumulA >= cap || cumulB >= cap;
      winnerId = maxReached
        ? cumulA > cumulB
          ? bout.fencerAId
          : cumulB > cumulA
            ? bout.fencerBId
            : null
        : null;
    }

    const newStatus = maxReached ? 'finished' : 'in_progress';
    await window.electronAPI.db.updateTeamBout(bout.id, newScoreA, newScoreB, newStatus, winnerId);
    await reload();
  };

  // ── Carton d'équipe "E" (format arène Sabre Laser, persisté, traçabilité seule) ──
  const handleAddTeamCard = async (
    matchId: string,
    teamId: string,
    type: 'white' | 'yellow' | 'red' | 'black'
  ) => {
    await window.electronAPI.db.createTeamMatchCard(matchId, teamId, type, 'late_designation');
    await reload();
  };

  // ── Envoyer une rencontre sur une arène pour saisie tablette temps réel ──────
  const handleAssignArena = async (matchId: string, arenaId: string) => {
    const result = await window.electronAPI.remote.setTeamArenaMatch(
      competition.id,
      arenaId,
      matchId,
      isLaserPoints
    );
    if (!result.success) {
      alert(result.error ?? "Impossible d'assigner cette rencontre à l'arène (serveur distant démarré ?).");
    }
  };

  const handleResetBout = async (bout: TeamBoutRow) => {
    await window.electronAPI.db.updateTeamBout(bout.id, 0, 0, 'not_started', null);
    await reload();
  };

  // ── Carton (arme-aware, escalade selon les cartons déjà reçus par ce tireur) ──
  const handleAddCard = (matchId: string) => {
    if (!cardTarget || !selectedReason) return;
    const match = [...matches, ...tableauMatches].find(m => m.id === matchId);
    const previousCards = Object.entries(boutCards)
      .filter(([boutId]) => match?.bouts.some(b => b.id === boutId))
      .flatMap(([, cards]) => cards)
      .filter(c => c.fencerId === cardTarget.fencerId);
    const card = createCard(
      matchId,
      cardTarget.fencerId,
      selectedReason,
      previousCards,
      competition.weapon
    );
    setBoutCards(prev => ({
      ...prev,
      [cardTarget.boutId]: [...(prev[cardTarget.boutId] ?? []), card],
    }));
    setCardTarget(null);
    setSelectedReason('');
  };

  // ── Lookup helpers ────────────────────────────────────────────────────────────
  const fencerById = new Map(fencers.map(f => [f.id, f]));
  const allTeamFencerIds = new Set(teams.flatMap(t => t.fencers.map(f => f.fencerId)));

  const fencerName = (id: string) => {
    const f = fencerById.get(id);
    return f ? `${f.lastName} ${f.firstName ?? ''}`.trim() : id.slice(0, 8);
  };

  const fieRankings = calculateTeamPoolRanking(teams, matches);
  const laserRankings = isLaserArena ? calculateLaserArenaPoolRanking(teams, matches) : [];
  const rankedTeamsForBracket = isLaserArena
    ? laserRankings.map(r => r.team)
    : fieRankings.map(r => r.team);

  if (loading)
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 text-gray-400">Chargement…</div>
      </div>
    );

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Compétition par équipes</h2>
            <p className="text-sm text-gray-500">
              {competition.title} · {teams.length} équipes
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl px-1 leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['teams', 'pool', 'tableau', 'ranking'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === v ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'teams'
                ? 'Équipes'
                : v === 'pool'
                  ? `Poule (${matches.length} matchs)`
                  : v === 'tableau'
                    ? 'Tableau'
                    : 'Classement'}
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
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    placeholder="Ex : équipe A"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 block mb-1">Club</label>
                  <input
                    value={newTeamClub}
                    onChange={e => setNewTeamClub(e.target.value)}
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
                <div className="text-center text-gray-400 py-10">
                  Aucune équipe — créez-en une ci-dessus.
                </div>
              )}

              {/* Liste équipes */}
              {teams.map(team => {
                const isEditing = editTeamId === team.id;
                const mainFencers = team.fencers
                  .filter(f => !f.isReserve)
                  .sort((a, b) => a.teamOrder - b.teamOrder);
                const reserves = team.fencers.filter(f => f.isReserve);
                const valid = mainFencers.length === teamSize;
                const availableFencers = fencers.filter(
                  f => !allTeamFencerIds.has(f.id) || team.fencers.some(tf => tf.fencerId === f.id)
                );

                return (
                  <div
                    key={team.id}
                    className={`border rounded-lg overflow-hidden ${valid ? 'border-green-200' : 'border-yellow-300'}`}
                  >
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div>
                        <span className="font-semibold text-gray-900">{team.name}</span>
                        <span className="text-sm text-gray-400 ml-2">{team.club}</span>
                        {valid ? (
                          <span className="ml-2 text-xs text-green-600 font-medium">
                            ✓ Complète
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-yellow-600 font-medium">
                            ⚠ {teamSize - mainFencers.length} tireur(s) manquant(s)
                          </span>
                        )}
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
                        <div
                          key={f.fencerId}
                          className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs"
                        >
                          <span className="font-bold text-blue-700">#{f.teamOrder}</span>
                          <span>
                            {f.fencerLastName} {f.fencerFirstName}
                          </span>
                          {isEditing && (
                            <button
                              onClick={() => handleRemoveFencer(team.id, f.fencerId)}
                              className="text-red-400 hover:text-red-600 ml-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {reserves.map(reserve => (
                        <div
                          key={reserve.fencerId}
                          className="flex items-center gap-1 bg-gray-50 border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <span className="text-gray-500">Rés.</span>
                          <span>
                            {reserve.fencerLastName} {reserve.fencerFirstName}
                          </span>
                          {isEditing && (
                            <button
                              onClick={() => handleRemoveFencer(team.id, reserve.fencerId)}
                              className="text-red-400 hover:text-red-600 ml-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {team.fencers.length === 0 && (
                        <span className="text-xs text-gray-400 italic">Aucun tireur</span>
                      )}
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
                            {Array.from({ length: teamSize }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>
                                #{n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`res-${team.id}`}
                            checked={selectedIsReserve}
                            disabled={
                              reserves.length >= reserveCount &&
                              !reserves.some(r => r.fencerId === selectedFencerId)
                            }
                            onChange={e => setSelectedIsReserve(e.target.checked)}
                          />
                          <label htmlFor={`res-${team.id}`} className="text-sm text-gray-600">
                            Réserviste (max {reserveCount})
                          </label>
                        </div>
                        <button
                          onClick={handleUpsertFencer}
                          disabled={
                            !selectedFencerId ||
                            (selectedIsReserve &&
                              reserves.length >= reserveCount &&
                              !reserves.some(r => r.fencerId === selectedFencerId))
                          }
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
            <TeamPoolView
              teams={teams}
              matches={matches}
              weapon={competition.weapon}
              targetRule={targetRule}
              isEpee={isEpee}
              isLaserPoints={isLaserPoints}
              fencerName={fencerName}
              scoringMatchId={scoringMatchId}
              onToggleScoring={id => setScoringMatchId(scoringMatchId === id ? null : id)}
              onScoreBout={handleScoreBout}
              onResetBout={handleResetBout}
              boutCards={boutCards}
              cardTarget={cardTarget}
              onSetCardTarget={setCardTarget}
              selectedReason={selectedReason}
              onSelectReason={setSelectedReason}
              onAddCard={handleAddCard}
              emptyLabel='Aucun match — cliquez sur "Générer la poule" dans l&apos;onglet Équipes.'
              isLaserArena={isLaserArena}
              boutCap={boutCap}
              matchCards={matchCards}
              onAddTeamCard={handleAddTeamCard}
              onAssignArena={handleAssignArena}
            />
          )}

          {/* ── Vue TABLEAU ── */}
          {view === 'tableau' && (
            <TeamTableauView
              teams={teams}
              rankedTeams={rankedTeamsForBracket}
              tableauMatches={tableauMatches}
              weapon={competition.weapon}
              targetRule={targetRule}
              isEpee={isEpee}
              isLaserPoints={isLaserPoints}
              fencerName={fencerName}
              scoringMatchId={scoringMatchId}
              onToggleScoring={id => setScoringMatchId(scoringMatchId === id ? null : id)}
              onScoreBout={handleScoreBout}
              onResetBout={handleResetBout}
              boutCards={boutCards}
              cardTarget={cardTarget}
              onSetCardTarget={setCardTarget}
              selectedReason={selectedReason}
              onSelectReason={setSelectedReason}
              onAddCard={handleAddCard}
              onGenerate={reload}
              isLaserArena={isLaserArena}
              boutCap={boutCap}
              matchCards={matchCards}
              onAddTeamCard={handleAddTeamCard}
              onAssignArena={handleAssignArena}
            />
          )}

          {/* ── Vue CLASSEMENT ── */}
          {view === 'ranking' && isLaserArena && (
            <div>
              {laserRankings.length > 0 && (
                <div
                  style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}
                >
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                    onClick={() => {
                      const header = 'Rang,Équipe,Club,V,D,Points+,Points-,Ratio,Égalité\n';
                      const rows = laserRankings
                        .map((r, i) =>
                          [
                            i + 1,
                            `"${r.team.name}"`,
                            `"${r.team.club ?? ''}"`,
                            r.victories,
                            r.defeats,
                            r.pointsFor,
                            r.pointsAgainst,
                            r.pointsAgainst === 0
                              ? r.pointsFor
                              : (r.pointsFor / r.pointsAgainst).toFixed(2),
                            r.tied ? 'oui' : '',
                          ].join(',')
                        )
                        .join('\n');
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
              {laserRankings.length === 0 ? (
                <div className="text-center text-gray-400 py-10">Aucun match joué.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center w-8">
                        #
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-left">
                        Équipe
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">
                        V
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">
                        D
                      </th>
                      <th
                        className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center"
                        title="Critère principal du règlement : total de points marqués sur toutes les rencontres de poule"
                      >
                        Points+
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">
                        Points-
                      </th>
                      <th
                        className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center"
                        title="1er critère de départage : ratio points marqués / points reçus"
                      >
                        Ratio
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {laserRankings.map((r, i) => (
                      <tr
                        key={r.team.id}
                        className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}
                        title={r.tied ? 'Égalité totale avec une équipe voisine — à départager par tirage au sort' : undefined}
                      >
                        <td className="px-3 py-2 text-center font-bold text-gray-400">
                          {i + 1}
                          {r.tied && <span className="text-yellow-500 ml-1">⚠</span>}
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-900">
                          {r.team.name}
                          <span className="text-xs text-gray-400 font-normal ml-2">
                            {r.team.club}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-green-700 font-bold">
                          {r.victories}
                        </td>
                        <td className="px-3 py-2 text-center text-red-500">{r.defeats}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold">{r.pointsFor}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-400">
                          {r.pointsAgainst}
                        </td>
                        <td className="px-3 py-2 text-center font-mono">
                          {r.pointsAgainst === 0
                            ? r.pointsFor
                            : (r.pointsFor / r.pointsAgainst).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {view === 'ranking' && !isLaserArena && (
            <div>
              {fieRankings.length > 0 && (
                <div
                  style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}
                >
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                    onClick={() => {
                      const header =
                        'Rang,Équipe,Club,V,D,RelaisG,RelaisP,Ind.,Touches+,Touches-\n';
                      const rows = fieRankings
                        .map((r, i) =>
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
                        )
                        .join('\n');
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
              {fieRankings.length === 0 ? (
                <div className="text-center text-gray-400 py-10">Aucun match joué.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center w-8">
                        #
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-left">
                        Équipe
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">
                        V
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">
                        D
                      </th>
                      <th
                        className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center"
                        title={t('teams.relaysTooltip')}
                      >
                        {t('teams.relaysWon')}
                      </th>
                      <th
                        className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center"
                        title={t('teams.relaysTooltip')}
                      >
                        {t('teams.relaysLost')}
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center">
                        Ind.
                      </th>
                      <th
                        className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center"
                        title="Touches cumulées (règle FIE)"
                      >
                        Touches+
                      </th>
                      <th
                        className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase text-center"
                        title="Touches cumulées (règle FIE)"
                      >
                        Touches-
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fieRankings.map((r, i) => (
                      <tr key={r.team.id} className={i === 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-center font-bold text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-gray-900">
                          {r.team.name}
                          <span className="text-xs text-gray-400 font-normal ml-2">
                            {r.team.club}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-green-700 font-bold">
                          {r.victories}
                        </td>
                        <td className="px-3 py-2 text-center text-red-500">{r.defeats}</td>
                        <td className="px-3 py-2 text-center">{r.boutsWon}</td>
                        <td className="px-3 py-2 text-center">{r.boutsLost}</td>
                        <td
                          className={`px-3 py-2 text-center font-bold ${r.boutsWon - r.boutsLost >= 0 ? 'text-green-600' : 'text-red-500'}`}
                        >
                          {r.boutsWon - r.boutsLost > 0 ? '+' : ''}
                          {r.boutsWon - r.boutsLost}
                        </td>
                        <td className="px-3 py-2 text-center font-mono">{r.pointsFor}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-400">
                          {r.pointsAgainst}
                        </td>
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
