/**
 * BellePoule Modern - Referee Manager Component
 * Interface for managing referee assignments
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Referee, Match, Pool, Competition, MatchStatus } from '../../shared/types';
import { RefereeManager, RefereeRotationConfig } from '../../shared/services/refereeManager';
import { parseEngardeRefereeFile } from '../../shared/utils/fileParser';
import { computeRefereeMatchStats, TableauMatchLike } from '../../shared/utils/refereeStats';
import {
  TD,
  TD_BOLD,
  INPUT,
  SMALL_INPUT,
  TABLE,
  TH,
  HEADING,
  SUB_TEXT,
  MUTED_ITALIC,
  FLEX_GAP,
  ROW_BORDER,
  ROW_ALT,
} from './refereeManager.styles';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

interface RefereeManagerProps {
  competition: Competition;
  referees: Referee[];
  pools: Pool[];
  matches: Match[];
  /** Matchs de poule de tous les tours (statistiques) ; défaut : matches */
  statsPoolMatches?: Match[];
  /** Matchs de tableau + consolantes (statistiques) */
  statsTableauMatches?: TableauMatchLike[];
  onRefereesChange: (referees: Referee[]) => void;
  onAssignmentsChange: (assignments: Map<string, Referee>) => void;
}

export const RefereeManagerComponent: React.FC<RefereeManagerProps> = ({
  competition,
  referees,
  pools,
  matches,
  statsPoolMatches,
  statsTableauMatches,
  onRefereesChange,
  onAssignmentsChange,
}) => {
  const [config, setConfig] = useState<RefereeRotationConfig>({
    maxConsecutiveMatches: 3,
    minRestTimeMinutes: 15,
    avoidSameClub: true,
    balanceAssignment: true,
  });
  const [assignments, setAssignments] = useState<Map<string, Referee>>(new Map());
  const [showReport, setShowReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'referees' | 'assignments' | 'history' | 'stats'>(
    'referees'
  );
  const [newReferee, setNewReferee] = useState({
    name: '',
    club: '',
    license: '',
    category: '',
    nationality: 'FRA',
  });
  const [addError, setAddError] = useState('');
  const [importStatus, setImportStatus] = useState<{ count: number; errors: string[] } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [historyRows, setHistoryRows] = useState<
    Array<{
      matchId: string;
      matchNumber: number;
      poolName: string | null;
      fencerAName: string;
      fencerBName: string;
      scoreA: number | null;
      scoreB: number | null;
      status: string;
      refereeId: string | null;
      refereeName: string | null;
    }>
  >([]);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await window.electronAPI.db.getMatchesWithReferees(competition.id);
      setHistoryRows(rows);
    } catch {
      /* silencieux */
    }
  }, [competition.id]);

  useEffect(() => {
    const initial = new Map<string, Referee>();
    for (const m of matches) {
      if (m.referee) initial.set(m.id, m.referee);
    }
    setAssignments(initial);
  }, [matches]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  // Instance recréée à chaque assignation auto : l'historique interne (compteur de matchs
  // consécutifs, assignedMatches) d'un run précédent bloquait tous les arbitres au run suivant.
  const [manager, setManager] = useState(
    () =>
      new RefereeManager(
        referees.map(r => ({ ...r })),
        config
      )
  );
  useEffect(() => {
    setManager(
      new RefereeManager(
        referees.map(r => ({ ...r })),
        config
      )
    );
  }, [referees, config]);

  const persistAssignments = async (map: Map<string, Referee>) => {
    for (const [matchId, referee] of map.entries()) {
      // Matchs de tableau (ID « 64-0 ») : persistés via l'état du tableau (onAssignmentsChange)
      if (!isUuid(matchId)) continue;
      try {
        await window.electronAPI.db.updateMatch(matchId, { refereeId: referee.id });
      } catch {
        /* non bloquant */
      }
    }
  };

  const handleAutoAssign = () => {
    // Copies : le service mute les arbitres (assignedMatches, status) — ne pas toucher l'état React
    const fresh = new RefereeManager(
      referees.map(r => ({ ...r })),
      config
    );
    const newAssignments = fresh.assignRefereesToMatches(pendingMatches, pools);
    setManager(fresh);
    setAssignments(newAssignments);
    onAssignmentsChange(newAssignments);
    persistAssignments(newAssignments);
  };

  const handleManualAssign = (matchId: string, refereeId: string) => {
    const referee = referees.find(r => r.id === refereeId);
    if (referee) {
      const newAssignments = new Map(assignments);
      newAssignments.set(matchId, referee);
      setAssignments(newAssignments);
      onAssignmentsChange(newAssignments);
      if (isUuid(matchId)) {
        window.electronAPI.db.updateMatch(matchId, { refereeId: referee.id }).catch(() => {});
      }
    }
  };

  const getRefereeStats = (refereeId: string) => {
    return manager.getRefereeStats(refereeId);
  };

  const rotationReport = useMemo(() => {
    return manager.generateRotationReportDetailed();
  }, [manager, assignments]);

  const getConflictWarning = (match: Match, referee: Referee): string | null => {
    const fencerAClub = match.fencerA?.club;
    const fencerBClub = match.fencerB?.club;

    if (referee.club && (fencerAClub === referee.club || fencerBClub === referee.club)) {
      return `⚠️ Conflit: Arbitre du club ${referee.club}`;
    }
    return null;
  };

  const handleExportFile = useCallback(() => {
    if (referees.length === 0) return;
    const lines = referees.map(r => {
      const sexe = r.gender === 'F' ? 'F' : 'M';
      return [
        r.lastName,
        r.firstName,
        sexe,
        r.category ?? '',
        r.club ?? '',
        r.region ?? '',
        r.nationality,
      ].join(';');
    });
    const content = 'NOM;Prenom;Sexe;Categorie;Club;Region;Nationalite\n' + lines.join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arbitres.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [referees]);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const content = await file.text();
      const parsed = parseEngardeRefereeFile(content);
      const errors: string[] = [...parsed.errors];
      const created: typeof referees = [];
      for (const ref of parsed.referees) {
        try {
          const name = `${ref.firstName} ${ref.lastName}`.trim();
          const newRef = await window.electronAPI.db.createReferee(competition.id, {
            name,
            club: ref.club,
            license: ref.license,
            category: ref.category,
            nationality: ref.nationality,
            gender: ref.gender,
          });
          created.push(newRef);
        } catch (err: any) {
          errors.push(err?.message ?? 'Erreur import');
        }
      }
      if (created.length > 0) onRefereesChange([...referees, ...created]);
      setImportStatus({ count: created.length, errors });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [competition.id, referees, onRefereesChange]
  );

  const matchStats = useMemo(
    () =>
      computeRefereeMatchStats(referees, statsPoolMatches ?? matches, statsTableauMatches ?? []),
    [referees, statsPoolMatches, matches, statsTableauMatches]
  );

  const pendingMatches = useMemo(
    () =>
      matches.filter(
        m =>
          m.status !== MatchStatus.FINISHED &&
          m.status !== MatchStatus.CANCELLED &&
          !!m.fencerA &&
          !!m.fencerB
      ),
    [matches]
  );

  return (
    <div
      className="referee-manager"
      style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}
    >
      <h2
        style={{
          marginBottom: '1rem',
          color: '#1f2937',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '0.5rem',
        }}
      >
        👨‍⚖️ Gestion des Arbitres
      </h2>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['referees', 'assignments', 'history', 'stats'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? '700' : '400',
              background: activeTab === tab ? '#3b82f6' : '#e5e7eb',
              color: activeTab === tab ? 'white' : '#374151',
            }}
          >
            {tab === 'referees'
              ? '👥 Arbitres'
              : tab === 'assignments'
                ? '📋 Assignations'
                : tab === 'history'
                  ? '📜 Historique'
                  : '📊 Statistiques'}
          </button>
        ))}
      </div>

      {activeTab === 'referees' && (
        <div>
          {/* Formulaire ajout */}
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', color: '#374151' }}>
              Ajouter un arbitre
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <input
                placeholder="Prénom Nom *"
                value={newReferee.name}
                onChange={e => setNewReferee({ ...newReferee, name: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder="Club"
                value={newReferee.club}
                onChange={e => setNewReferee({ ...newReferee, club: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder="Licence"
                value={newReferee.license}
                onChange={e => setNewReferee({ ...newReferee, license: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder="Catégorie (Régional…)"
                value={newReferee.category}
                onChange={e => setNewReferee({ ...newReferee, category: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder="Nationalité (FRA)"
                value={newReferee.nationality}
                onChange={e => setNewReferee({ ...newReferee, nationality: e.target.value })}
                style={INPUT}
              />
            </div>
            {addError && (
              <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                {addError}
              </p>
            )}
            <button
              onClick={async () => {
                if (!newReferee.name.trim()) {
                  setAddError('Le nom est obligatoire');
                  return;
                }
                try {
                  const created = await window.electronAPI.db.createReferee(competition.id, {
                    name: newReferee.name.trim(),
                    club: newReferee.club || undefined,
                    license: newReferee.license || undefined,
                    category: newReferee.category || undefined,
                    nationality: newReferee.nationality || 'FRA',
                  });
                  onRefereesChange([...referees, created]);
                  setNewReferee({
                    name: '',
                    club: '',
                    license: '',
                    category: '',
                    nationality: 'FRA',
                  });
                  setAddError('');
                } catch (e: any) {
                  setAddError(e?.message ?? 'Erreur');
                }
              }}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              ＋ Ajouter
            </button>
          </div>

          {/* Import fichier Arbitres */}
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Format attendu : NOM;Prénom;Sexe(M/F);Catégorie;Club;Région;Nationalité — une ligne par arbitre, séparateur « ; », .txt ou .csv"
              style={{
                background: '#6d28d9',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              📂 Importer fichier Arbitres
            </button>
            <button
              onClick={handleExportFile}
              disabled={referees.length === 0}
              title="Exporte la liste en CSV — même format que l'import : NOM;Prénom;Sexe(M/F);Catégorie;Club;Région;Nationalité"
              style={{
                background: '#059669',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                cursor: referees.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                opacity: referees.length === 0 ? 0.5 : 1,
              }}
            >
              💾 Exporter fichier Arbitres
            </button>
            {importStatus && (
              <span
                style={{
                  fontSize: '0.875rem',
                  color: importStatus.errors.length ? '#dc2626' : '#166534',
                }}
              >
                {importStatus.count} arbitre(s) importé(s)
                {importStatus.errors.length > 0 && ` — ${importStatus.errors.length} erreur(s)`}
              </span>
            )}
          </div>

          {/* Liste arbitres */}
          {referees.length === 0 ? (
            <p style={MUTED_ITALIC}>Aucun arbitre enregistré.</p>
          ) : (
            <table style={TABLE}>
              <thead>
                <tr style={ROW_ALT}>
                  {['#', 'Nom', 'Club', 'Licence', 'Catégorie', 'Nationalité', 'Statut', ''].map(
                    h => (
                      <th key={h} style={TH}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {referees.map(ref => (
                  <tr key={ref.id} style={ROW_BORDER}>
                    <td style={{ padding: '0.45rem 0.75rem', color: '#9ca3af' }}>{ref.ref}</td>
                    <td style={TD_BOLD}>
                      {ref.firstName} {ref.lastName}
                    </td>
                    <td style={TD}>{ref.club ?? '—'}</td>
                    <td style={TD}>{ref.license ?? '—'}</td>
                    <td style={TD}>{ref.category ?? '—'}</td>
                    <td style={TD}>{ref.nationality}</td>
                    <td style={TD}>
                      <span style={{ color: ref.status === 'available' ? '#166534' : '#9ca3af' }}>
                        {ref.status === 'available' ? '✓ Disponible' : ref.status}
                      </span>
                    </td>
                    <td style={TD}>
                      <button
                        onClick={async () => {
                          try {
                            await window.electronAPI.db.deleteReferee(ref.id);
                            onRefereesChange(referees.filter(r => r.id !== ref.id));
                          } catch {
                            /* silencieux */
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#ef4444',
                          fontSize: '1rem',
                        }}
                        title="Supprimer"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'stats' && (
        <div>
          {matchStats.length === 0 ? (
            <p style={MUTED_ITALIC}>Aucun arbitre enregistré.</p>
          ) : (
            <table style={TABLE}>
              <thead>
                <tr style={ROW_ALT}>
                  {['Arbitre', 'Club', 'Poules', 'Tableau', 'Total arbitrés', 'En attente'].map(
                    h => (
                      <th key={h} style={TH}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {matchStats.map(s => (
                  <tr key={s.refereeId} style={ROW_BORDER}>
                    <td style={TD_BOLD}>{s.refereeName}</td>
                    <td style={TD}>{s.club ?? '—'}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{s.poolMatches}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{s.tableauMatches}</td>
                    <td style={{ ...TD_BOLD, textAlign: 'center' }}>{s.totalMatches}</td>
                    <td style={{ ...TD, textAlign: 'center', color: '#6b7280' }}>
                      {s.pendingMatches}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={ROW_ALT}>
                  <td style={TD_BOLD} colSpan={2}>
                    Total
                  </td>
                  {(
                    ['poolMatches', 'tableauMatches', 'totalMatches', 'pendingMatches'] as const
                  ).map(k => (
                    <td key={k} style={{ ...TD_BOLD, textAlign: 'center' }}>
                      {matchStats.reduce((sum, s) => sum + s[k], 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={loadHistory}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '5px',
                border: '1px solid #d1d5db',
                cursor: 'pointer',
                background: 'white',
              }}
            >
              ↻ Actualiser
            </button>
          </div>
          {historyRows.length === 0 ? (
            <p style={MUTED_ITALIC}>Aucun match avec arbitre assigné.</p>
          ) : (
            <table style={TABLE}>
              <thead>
                <tr style={ROW_ALT}>
                  {['Poule', 'Match', 'Tireur A', 'Tireur B', 'Score', 'Statut', 'Arbitre'].map(
                    h => (
                      <th key={h} style={TH}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {historyRows.map(row => (
                  <tr key={row.matchId} style={ROW_BORDER}>
                    <td style={TD}>{row.poolName ?? '—'}</td>
                    <td style={TD}>#{row.matchNumber}</td>
                    <td style={TD}>{row.fencerAName}</td>
                    <td style={TD}>{row.fencerBName}</td>
                    <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center' }}>
                      {row.scoreA !== null && row.scoreB !== null
                        ? `${row.scoreA} – ${row.scoreB}`
                        : '—'}
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: row.status === 'finished' ? '#166534' : '#6b7280',
                      }}
                    >
                      {row.status === 'finished' ? '✓ Terminé' : row.status}
                    </td>
                    <td style={TD_BOLD}>{row.refereeName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'assignments' && (
        <>
          {/* Configuration */}
          <div
            style={{
              background: '#f9fafb',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: '#374151' }}>
              Configuration de Rotation
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
              }}
            >
              <label style={FLEX_GAP}>
                <input
                  type="checkbox"
                  checked={config.avoidSameClub}
                  onChange={e => setConfig({ ...config, avoidSameClub: e.target.checked })}
                />
                Éviter les arbitres du même club
              </label>
              <label style={FLEX_GAP}>
                <input
                  type="checkbox"
                  checked={config.balanceAssignment}
                  onChange={e => setConfig({ ...config, balanceAssignment: e.target.checked })}
                />
                Équilibrer les assignations
              </label>
              <label>
                Matchs consécutifs max:
                <input
                  type="number"
                  value={config.maxConsecutiveMatches}
                  onChange={e =>
                    setConfig({ ...config, maxConsecutiveMatches: parseInt(e.target.value) || 3 })
                  }
                  style={SMALL_INPUT}
                  min="1"
                  max="10"
                />
              </label>
              <label>
                Temps de repos min (min):
                <input
                  type="number"
                  value={config.minRestTimeMinutes}
                  onChange={e =>
                    setConfig({ ...config, minRestTimeMinutes: parseInt(e.target.value) || 15 })
                  }
                  style={SMALL_INPUT}
                  min="0"
                  max="60"
                />
              </label>
            </div>
          </div>

          {/* Actions */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleAutoAssign}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
              }}
            >
              🔄 Assignation Automatique
            </button>
            <button
              onClick={() => setShowReport(!showReport)}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
              }}
            >
              📊 {showReport ? 'Masquer' : 'Afficher'} le Rapport
            </button>
          </div>

          {/* Rotation Report */}
          {showReport && (
            <div
              style={{
                background: '#f0fdf4',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid #86efac',
              }}
            >
              <h3 style={{ marginBottom: '1rem', color: '#166534' }}>Rapport de Rotation</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#dcfce7' }}>
                    {['Arbitre', 'Matchs', 'Consécutifs', 'Fatigue', 'Violations', 'Conflits'].map(
                      h => (
                        <th
                          key={h}
                          style={{
                            padding: '0.5rem',
                            textAlign: h === 'Arbitre' ? 'left' : 'center',
                            borderBottom: '2px solid #86efac',
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rotationReport.map((row, idx) => {
                    const fatigueColor =
                      row.fatigueScore >= 80
                        ? '#dc2626'
                        : row.fatigueScore >= 50
                          ? '#d97706'
                          : '#166534';
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #bbf7d0',
                          background: row.needsRest ? '#fef9c3' : undefined,
                        }}
                      >
                        <td style={{ padding: '0.5rem' }}>
                          {row.needsRest && <span title="Repos recommandé">⚠️ </span>}
                          {row.refereeName}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          {row.matchesAssigned}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          {row.consecutiveMatches}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          <span
                            style={{
                              color: fatigueColor,
                              fontWeight: row.fatigueScore >= 80 ? 700 : 400,
                            }}
                          >
                            {row.fatigueScore}%
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '0.5rem',
                            textAlign: 'center',
                            color: row.restViolations > 0 ? '#dc2626' : '#166534',
                          }}
                        >
                          {row.restViolations}
                        </td>
                        <td
                          style={{
                            padding: '0.5rem',
                            textAlign: 'center',
                            color: row.conflicts > 0 ? '#dc2626' : '#166534',
                          }}
                        >
                          {row.conflicts}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Arbitres List */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={HEADING}>Arbitres Disponibles</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
              }}
            >
              {referees.map(referee => {
                const stats = getRefereeStats(referee.id);
                return (
                  <div
                    key={referee.id}
                    style={{
                      background: referee.status === 'available' ? '#f0fdf4' : '#fef2f2',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: referee.status === 'available' ? '#86efac' : '#fecaca',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                      {referee.firstName} {referee.lastName}
                    </div>
                    <div style={SUB_TEXT}>
                      {referee.category} • {referee.club || 'Sans club'}
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      <span style={{ color: '#374151' }}>
                        Matchs aujourd'hui: {stats.todayMatches}
                      </span>
                      <br />
                      <span style={{ color: '#374151' }}>Total: {stats.totalMatches}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Match Assignments */}
          <div>
            <h3 style={HEADING}>Assignations des Matchs</h3>
            {pendingMatches.length === 0 && (
              <p style={MUTED_ITALIC}>Aucun match en attente d'arbitre.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pendingMatches.map(match => {
                const assignedReferee = assignments.get(match.id);
                const conflictWarning = assignedReferee
                  ? getConflictWarning(match, assignedReferee)
                  : null;

                return (
                  <div
                    key={match.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      background: conflictWarning ? '#fef3c7' : '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: conflictWarning ? '#fbbf24' : '#e5e7eb',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500' }}>
                        {match.fencerA?.firstName} {match.fencerA?.lastName} vs{' '}
                        {match.fencerB?.firstName} {match.fencerB?.lastName}
                      </div>
                      {match.poolId ? (
                        <div style={SUB_TEXT}>
                          Poule {pools.find(p => p.id === match.poolId)?.number}
                        </div>
                      ) : match.round ? (
                        <div style={SUB_TEXT}>
                          Tableau{' '}
                          {match.round === 2
                            ? 'Finale'
                            : match.round === 3
                              ? '3e place'
                              : `T${match.round}`}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {conflictWarning && (
                        <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>
                          {conflictWarning}
                        </span>
                      )}
                      <select
                        value={assignedReferee?.id || ''}
                        onChange={e => handleManualAssign(match.id, e.target.value)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #d1d5db',
                          background: 'white',
                        }}
                      >
                        <option value="">-- Choisir un arbitre --</option>
                        {referees.map(referee => (
                          <option key={referee.id} value={referee.id}>
                            {referee.firstName} {referee.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(RefereeManagerComponent);
