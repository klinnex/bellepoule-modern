/**
 * BellePoule Modern - Referee Manager Component
 * Interface for managing referee assignments
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Referee, Match, Pool, Competition, MatchStatus } from '../../shared/types';
import { RefereeManager, RefereeRotationConfig } from '../../shared/services/refereeManager';
import { parseEngardeRefereeFile } from '../../shared/utils/fileParser';
import {
  computeRefereeMatchStats,
  getRefereePresence,
  REFEREE_PRESENCE_LABELS,
  RefereePresence,
  TableauMatchLike,
} from '../../shared/utils/refereeStats';
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
import { useTranslation } from '../hooks/useTranslation';

const PRESENCE_COLORS: Record<RefereePresence, string> = {
  not_checked_in: '#9ca3af',
  checked_in: '#166534',
  busy: '#b45309',
  free: '#166534',
};

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
  const { t } = useTranslation();
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
  const [editingId, setEditingId] = useState<string | null>(null);
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

  // Pointage depuis l'application (même effet que l'appel distant, #1016)
  const toggleRefereeCheckin = async (referee: Referee) => {
    const status: Referee['status'] =
      referee.status === 'unavailable' ? 'available' : 'unavailable';
    try {
      await window.electronAPI.db.updateReferee(referee.id, { status });
      onRefereesChange(referees.map(r => (r.id === referee.id ? { ...r, status } : r)));
    } catch {
      /* silencieux */
    }
  };

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
    <div className="referee-manager is-da3621">
      <h2 className="is-5a6e65">{t('refereeManager.title')}</h2>

      {/* Onglets */}
      <div className="is-c6beb3">
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
              background: activeTab === tab ? 'var(--color-primary)' : 'var(--color-surface-2)',
              color: activeTab === tab ? 'white' : 'var(--color-text)',
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
          <div className="is-2afd08">
            <h3 className="is-29c898">
              {editingId ? 'Modifier un arbitre' : 'Ajouter un arbitre'}
            </h3>
            <div className="is-886621">
              <input
                placeholder={t('refereeManager.ph_name')}
                value={newReferee.name}
                onChange={e => setNewReferee({ ...newReferee, name: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder={t('refereeManager.ph_club')}
                value={newReferee.club}
                onChange={e => setNewReferee({ ...newReferee, club: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder={t('refereeManager.ph_license')}
                value={newReferee.license}
                onChange={e => setNewReferee({ ...newReferee, license: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder={t('refereeManager.ph_category')}
                value={newReferee.category}
                onChange={e => setNewReferee({ ...newReferee, category: e.target.value })}
                style={INPUT}
              />
              <input
                placeholder={t('refereeManager.ph_nationality')}
                value={newReferee.nationality}
                onChange={e => setNewReferee({ ...newReferee, nationality: e.target.value })}
                style={INPUT}
              />
            </div>
            {addError && <p className="is-72cabb">{addError}</p>}
            <div className="is-52d632">
              <button
                onClick={async () => {
                  if (!newReferee.name.trim()) {
                    setAddError('Le nom est obligatoire');
                    return;
                  }
                  try {
                    if (editingId) {
                      const updates = {
                        name: newReferee.name.trim(),
                        club: newReferee.club,
                        license: newReferee.license,
                        category: newReferee.category,
                        nationality: newReferee.nationality || 'FRA',
                      };
                      await window.electronAPI.db.updateReferee(editingId, updates);
                      const parts = updates.name.split(/\s+/);
                      const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
                      const lastName = parts[parts.length - 1];
                      onRefereesChange(
                        referees.map(r =>
                          r.id === editingId
                            ? {
                                ...r,
                                firstName,
                                lastName,
                                club: updates.club || undefined,
                                license: updates.license || undefined,
                                category: updates.category || undefined,
                                nationality: updates.nationality,
                              }
                            : r
                        )
                      );
                      setEditingId(null);
                    } else {
                      const created = await window.electronAPI.db.createReferee(competition.id, {
                        name: newReferee.name.trim(),
                        club: newReferee.club || undefined,
                        license: newReferee.license || undefined,
                        category: newReferee.category || undefined,
                        nationality: newReferee.nationality || 'FRA',
                      });
                      onRefereesChange([...referees, created]);
                    }
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
                className="is-e1038a"
              >
                {editingId ? '💾 Enregistrer' : '＋ Ajouter'}
              </button>
              {editingId && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingId(null);
                    setAddError('');
                    setNewReferee({
                      name: '',
                      club: '',
                      license: '',
                      category: '',
                      nationality: 'FRA',
                    });
                  }}
                >
                  {t('actions.cancel')}
                </button>
              )}
            </div>
          </div>

          {/* Import fichier Arbitres */}
          <div className="is-dd1407">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              className="is-f2892a"
              onChange={handleImportFile}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title={t('refereeManager.import_title')}
              className="is-e1de04"
            >
              {t('refereeManager.import_btn')}
            </button>
            <button
              onClick={handleExportFile}
              disabled={referees.length === 0}
              title={t('refereeManager.export_title')}
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
              {t('refereeManager.export_btn')}
            </button>
            {importStatus && (
              <span
                style={{
                  fontSize: '0.875rem',
                  color: importStatus.errors.length ? '#dc2626' : '#166534',
                }}
              >
                {t('plural.referees_imported', { count: importStatus.count })}
                {importStatus.errors.length > 0 &&
                  ` — ${t('plural.errors', { count: importStatus.errors.length })}`}
              </span>
            )}
          </div>

          {/* Liste arbitres */}
          {referees.length === 0 ? (
            <p style={MUTED_ITALIC}>{t('refereeManager.none')}</p>
          ) : (
            <table style={TABLE}>
              <thead>
                <tr style={ROW_ALT}>
                  {[
                    '#',
                    t('refereeManager.h_name'),
                    t('refereeManager.ph_club'),
                    t('refereeManager.ph_license'),
                    t('refereeManager.h_category'),
                    t('refereeManager.h_nationality'),
                    t('refereeManager.h_status'),
                    '',
                  ].map(h => (
                    <th key={h} style={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referees.map(ref => (
                  <tr key={ref.id} style={ROW_BORDER}>
                    <td className="is-fde728">{ref.ref}</td>
                    <td style={TD_BOLD}>
                      {ref.firstName} {ref.lastName}
                    </td>
                    <td style={TD}>{ref.club ?? '—'}</td>
                    <td style={TD}>{ref.license ?? '—'}</td>
                    <td style={TD}>{ref.category ?? '—'}</td>
                    <td style={TD}>{ref.nationality}</td>
                    <td style={TD}>
                      {(() => {
                        const presence = getRefereePresence(ref, matches);
                        return (
                          <span className="is-15cd68">
                            <span style={{ color: PRESENCE_COLORS[presence], fontWeight: 600 }}>
                              {REFEREE_PRESENCE_LABELS[presence]}
                            </span>
                            {presence !== 'busy' && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleRefereeCheckin(ref)}
                              >
                                {ref.status === 'unavailable' ? 'Pointer' : 'Dépointer'}
                              </button>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={TD}>
                      <button
                        onClick={() => {
                          setEditingId(ref.id);
                          setAddError('');
                          setNewReferee({
                            name: `${ref.firstName} ${ref.lastName}`.trim(),
                            club: ref.club ?? '',
                            license: ref.license ?? '',
                            category: ref.category ?? '',
                            nationality: ref.nationality ?? 'FRA',
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="is-54fefa"
                        title={t('actions.edit')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await window.electronAPI.db.deleteReferee(ref.id);
                            onRefereesChange(referees.filter(r => r.id !== ref.id));
                          } catch {
                            /* silencieux */
                          }
                        }}
                        className="is-b6f00b"
                        title={t('actions.delete')}
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
            <p style={MUTED_ITALIC}>{t('refereeManager.none')}</p>
          ) : (
            <table style={TABLE}>
              <thead>
                <tr style={ROW_ALT}>
                  {[
                    t('refereeManager.col_referee'),
                    t('refereeManager.ph_club'),
                    t('refereeManager.h_pools'),
                    t('refereeManager.tableau'),
                    t('refereeManager.h_total_refereed'),
                    t('refereeManager.h_pending'),
                  ].map(h => (
                    <th key={h} style={TH}>
                      {h}
                    </th>
                  ))}
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
                    <td style={{ ...TD, textAlign: 'center', color: 'var(--color-text-light)' }}>
                      {s.pendingMatches}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="referee-stats-total">
                  <td style={TD_BOLD} colSpan={2}>
                    {t('refereeManager.total')}
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
          <div className="is-0178f7">
            <button onClick={loadHistory} className="is-1c376e">
              {t('refereeManager.refresh')}
            </button>
          </div>
          {historyRows.length === 0 ? (
            <p style={MUTED_ITALIC}>{t('refereeManager.no_history')}</p>
          ) : (
            <table style={TABLE}>
              <thead>
                <tr style={ROW_ALT}>
                  {[
                    t('refereeManager.h_pool'),
                    t('refereeManager.h_match'),
                    t('refereeManager.h_fencer_a'),
                    t('refereeManager.h_fencer_b'),
                    t('refereeManager.h_score'),
                    t('refereeManager.h_status'),
                    t('refereeManager.col_referee'),
                  ].map(h => (
                    <th key={h} style={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyRows.map(row => (
                  <tr key={row.matchId} style={ROW_BORDER}>
                    <td style={TD}>{row.poolName ?? '—'}</td>
                    <td style={TD}>#{row.matchNumber}</td>
                    <td style={TD}>{row.fencerAName}</td>
                    <td style={TD}>{row.fencerBName}</td>
                    <td className="is-805c7a">
                      {row.scoreA !== null && row.scoreB !== null
                        ? `${row.scoreA} – ${row.scoreB}`
                        : '—'}
                    </td>
                    <td
                      style={{
                        padding: '0.45rem 0.75rem',
                        color: row.status === 'finished' ? '#166534' : 'var(--color-text-light)',
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
          <div className="is-4485f4">
            <h3 className="is-a90b40">{t('refereeManager.rotation_config')}</h3>
            <div className="is-1c64c7">
              <label style={FLEX_GAP}>
                <input
                  type="checkbox"
                  checked={config.avoidSameClub}
                  onChange={e => setConfig({ ...config, avoidSameClub: e.target.checked })}
                />
                {t('refereeManager.avoid_club')}
              </label>
              <label style={FLEX_GAP}>
                <input
                  type="checkbox"
                  checked={config.balanceAssignment}
                  onChange={e => setConfig({ ...config, balanceAssignment: e.target.checked })}
                />
                {t('refereeManager.balance')}
              </label>
              <label style={{ ...FLEX_GAP, whiteSpace: 'nowrap' }}>
                {t('refereeManager.max_consecutive')}
                <input
                  type="number"
                  value={config.maxConsecutiveMatches}
                  onChange={e =>
                    setConfig({ ...config, maxConsecutiveMatches: parseInt(e.target.value) || 3 })
                  }
                  style={{ ...SMALL_INPUT, width: '48px', marginLeft: 0, flexShrink: 0 }}
                  min="1"
                  max="10"
                />
              </label>
              <label style={{ ...FLEX_GAP, whiteSpace: 'nowrap' }}>
                {t('refereeManager.min_rest')}
                <input
                  type="number"
                  value={config.minRestTimeMinutes}
                  onChange={e =>
                    setConfig({ ...config, minRestTimeMinutes: parseInt(e.target.value) || 15 })
                  }
                  style={{ ...SMALL_INPUT, width: '48px', marginLeft: 0, flexShrink: 0 }}
                  min="0"
                  max="60"
                />
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="is-c79afc">
            <button onClick={handleAutoAssign} className="is-493f4c">
              {t('refereeManager.auto_assign')}
            </button>
            <button onClick={() => setShowReport(!showReport)} className="is-212c2e">
              {showReport ? t('refereeManager.hide_report') : t('refereeManager.show_report')}
            </button>
          </div>

          {/* Rotation Report */}
          {showReport && (
            <div className="is-09ba80">
              <h3 className="is-dc953f">{t('refereeManager.rotation_report')}</h3>
              <table className="is-70851d">
                <thead>
                  <tr className="is-5da7b0">
                    {(
                      [
                        'col_referee',
                        'col_matches',
                        'col_consecutive',
                        'col_fatigue',
                        'col_violations',
                        'col_conflicts',
                      ] as const
                    ).map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '0.5rem',
                          textAlign: h === 'col_referee' ? 'left' : 'center',
                          borderBottom: '2px solid #86efac',
                        }}
                      >
                        {t(`refereeManager.${h}`)}
                      </th>
                    ))}
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
                        <td className="is-986a03">
                          {row.needsRest && (
                            <span title={t('refereeManager.rest_recommended')}>⚠️ </span>
                          )}
                          {row.refereeName}
                        </td>
                        <td className="is-748511">{row.matchesAssigned}</td>
                        <td className="is-748511">{row.consecutiveMatches}</td>
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
            <h3 style={HEADING}>{t('refereeManager.available')}</h3>
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
                      background: referee.status !== 'unavailable' ? '#f0fdf4' : '#fef2f2',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: referee.status !== 'unavailable' ? '#86efac' : '#fecaca',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', color: 'var(--color-text)' }}>
                      {referee.firstName} {referee.lastName}
                    </div>
                    {/* Carte sur fond clair (vert/rouge) : texte sombre dans les deux thèmes */}
                    <div style={{ ...SUB_TEXT, color: 'var(--color-text-light)' }}>
                      {referee.category} • {referee.club || 'Sans club'}
                    </div>
                    <div
                      style={{
                        marginTop: '0.25rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: PRESENCE_COLORS[getRefereePresence(referee, matches)],
                      }}
                    >
                      {REFEREE_PRESENCE_LABELS[getRefereePresence(referee, matches)]}
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--color-text)' }}>
                        {t('refereeManager.today_matches', { n: stats.todayMatches })}
                      </span>
                      <br />
                      <span style={{ color: 'var(--color-text)' }}>
                        {t('refereeManager.total_n', { n: stats.totalMatches })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Match Assignments */}
          <div>
            <h3 style={HEADING}>{t('refereeManager.assignments')}</h3>
            {pendingMatches.length === 0 && (
              <p style={MUTED_ITALIC}>{t('refereeManager.no_pending')}</p>
            )}
            <div className="u-stack-2">
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
                      background: conflictWarning ? '#fef3c7' : 'var(--color-surface-2)',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: conflictWarning ? '#fbbf24' : 'var(--color-border)',
                      color: conflictWarning ? 'var(--color-text)' : 'var(--color-text)',
                    }}
                  >
                    <div className="flex-1">
                      <div style={{ fontWeight: '500' }}>
                        {match.fencerA?.firstName} {match.fencerA?.lastName}{' '}
                        {t('refereeManager.vs')} {match.fencerB?.firstName}{' '}
                        {match.fencerB?.lastName}
                      </div>
                      {match.poolId ? (
                        <div style={SUB_TEXT}>
                          {t('refereeManager.pool_n', {
                            n: pools.find(p => p.id === match.poolId)?.number ?? '',
                          })}
                        </div>
                      ) : match.round ? (
                        <div style={SUB_TEXT}>
                          {t('refereeManager.tableau')}{' '}
                          {match.round === 2
                            ? t('refereeManager.final')
                            : match.round === 3
                              ? t('refereeManager.third')
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
                          border: '1px solid var(--color-border-dark)',
                          background: 'var(--color-surface)',
                        }}
                      >
                        <option value="">{t('refereeManager.choose')}</option>
                        {referees
                          .filter(r => r.status !== 'unavailable' || r.id === assignedReferee?.id)
                          .map(referee => (
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
