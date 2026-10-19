/**
 * BellePoule Modern - Tournoi des rapières : vue de la compétition (#1118)
 * Équipes (binômes), poules par niveau, vagues lancées par le DT, classements, tableau.
 * L'état est enregistré dans `session_state` (clé `rapieres`).
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Competition } from '../../shared/types';
import type { SessionState } from '../../shared/types/preload';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import { useToast } from '../../renderer/components/Toast';
import { useConfirm } from '../../renderer/components/ConfirmDialog';
import {
  RAPIERES_AGE_CATEGORIES,
  RAPIERES_LEVELS,
  RapieresAgeCategory,
  RapieresFencer,
  RapieresLevel,
  RapieresState,
  RapieresTeam,
  RapieresTeamStatus,
  createRapieresState,
} from './rapieres.types';
import {
  activeBouts,
  arePoolsComplete,
  buildBouts,
  checkedInTeams,
  canLaunchNextWave,
  computeFinalRanking,
  computeOverallRanking,
  computePoolRankings,
  computeTeamStats,
  createTableau,
  defaultPoolCount,
  distributeTeams,
  filterRanking,
  isBoutDone,
  isBoutVoid,
  isPlayable,
  isTableauComplete,
  RapieresRankingFilter,
  resolveTableau,
  selectQualifiers,
  setTableauScore,
  teamStatus,
  waveCount,
  withdrawnTeamIds,
} from './rapieresCalculations';
import { exportRapieresRankingToPDF } from './rapieresPdf';

type Tab = 'teams' | 'pools' | 'waves' | 'rankings' | 'tableau';

interface RapieresViewProps {
  competition: Competition;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const emptyFencer = (): RapieresFencer => ({ firstName: '', lastName: '', category: 'SENIOR' });

const fencerName = (f: RapieresFencer) => `${f.lastName.toUpperCase()} ${f.firstName}`.trim();

/** Libellé et pastille d'un statut, mêmes que pour les tireurs en compétition classique */
const STATUS_BADGES: Record<RapieresTeamStatus, { key: string; color: string }> = {
  not_checked_in: { key: 'status.not_checked_in', color: 'badge-warning' },
  checked_in: { key: 'status.checked_in', color: 'badge-success' },
  abandoned: { key: 'status.abandoned', color: 'badge-danger' },
  forfait: { key: 'status.forfeit', color: 'badge-danger' },
  excluded: { key: 'status.excluded', color: 'badge-danger' },
};

const StatusBadge: React.FC<{ status: RapieresTeamStatus }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <span className={`badge ${STATUS_BADGES[status].color}`}>{t(STATUS_BADGES[status].key)}</span>
  );
};

/** Saisie d'un score : enregistré quand les deux valeurs sont valides (pas d'égalité, ≤ max) */
const ScoreEntry: React.FC<{
  scoreA: number | null;
  scoreB: number | null;
  max: number;
  invalidLabel: string;
  disabled?: boolean;
  onSave: (score: { scoreA: number; scoreB: number } | null) => void;
}> = ({ scoreA, scoreB, max, invalidLabel, disabled, onSave }) => {
  const [a, setA] = useState(scoreA === null ? '' : String(scoreA));
  const [b, setB] = useState(scoreB === null ? '' : String(scoreB));
  useEffect(() => {
    setA(scoreA === null ? '' : String(scoreA));
    setB(scoreB === null ? '' : String(scoreB));
  }, [scoreA, scoreB]);
  const na = Number(a);
  const nb = Number(b);
  const valid =
    a !== '' &&
    b !== '' &&
    Number.isInteger(na) &&
    Number.isInteger(nb) &&
    na >= 0 &&
    nb >= 0 &&
    na <= max &&
    nb <= max &&
    na !== nb;
  const invalid = a !== '' && b !== '' && !valid;
  const commit = () => {
    if (valid && (na !== scoreA || nb !== scoreB)) onSave({ scoreA: na, scoreB: nb });
    else if (a === '' && b === '' && scoreA !== null) onSave(null);
  };
  const style: React.CSSProperties = {
    width: '3.5rem',
    textAlign: 'center',
    borderColor: invalid ? 'var(--color-danger, #dc2626)' : undefined,
  };
  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
      <input
        type="number"
        min={0}
        max={max}
        value={a}
        disabled={disabled}
        style={style}
        onChange={e => setA(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        title={invalid ? invalidLabel : undefined}
      />
      <span aria-hidden="true">–</span>
      <input
        type="number"
        min={0}
        max={max}
        value={b}
        disabled={disabled}
        style={style}
        onChange={e => setB(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        title={invalid ? invalidLabel : undefined}
      />
    </span>
  );
};

const RapieresView: React.FC<RapieresViewProps> = ({ competition }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [state, setState] = useState<RapieresState | null>(null);
  const [tab, setTab] = useState<Tab>('teams');

  // ─── Persistance ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const saved = (await window.electronAPI?.db?.getSessionState?.(competition.id)) as
        (SessionState & { rapieres?: RapieresState }) | null | undefined;
      if (!cancelled) setState(saved?.rapieres ?? createRapieresState());
    };
    load().catch(() => !cancelled && setState(createRapieresState()));
    return () => {
      cancelled = true;
    };
  }, [competition.id]);

  const update = useCallback(
    (next: RapieresState) => {
      setState(next);
      void window.electronAPI?.db?.saveSessionState?.(competition.id, {
        rapieres: next,
      } as SessionState);
    },
    [competition.id]
  );

  if (!state) return null;

  const teamById = new Map(state.teams.map(t => [t.id, t]));
  const teamName = (id: string | null) =>
    id ? (teamById.get(id)?.name ?? '?') : t('rapieres.tbd');
  const levelLabel = (l: RapieresLevel) => t(`rapieres.level_${l}`);
  const categoryLabel = (c: RapieresAgeCategory) => t(`rapieres.cat_${c}`);
  const locked = state.launchedWave > 0;

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'teams', label: t('rapieres.tab_teams') },
    { id: 'pools', label: t('rapieres.tab_pools') },
    { id: 'waves', label: t('rapieres.tab_waves'), disabled: state.bouts.length === 0 },
    { id: 'rankings', label: t('rapieres.tab_rankings'), disabled: state.bouts.length === 0 },
    { id: 'tableau', label: t('rapieres.tab_tableau'), disabled: state.bouts.length === 0 },
  ];

  return (
    <div className="content" style={{ padding: '1rem' }}>
      <h1 className="page-title">
        {competition.title}
        <span className="badge" style={{ marginLeft: '0.75rem', fontSize: '0.8rem' }}>
          {t('rapieres.mode_rapieres')}
        </span>
      </h1>
      <div className="phase-nav" role="navigation">
        {tabs.map((tb, i) => (
          <div
            key={tb.id}
            className={`phase-step ${tab === tb.id ? 'phase-step-active' : ''} ${tb.disabled ? 'phase-step-disabled' : ''}`}
            role="button"
            tabIndex={tb.disabled ? -1 : 0}
            aria-current={tab === tb.id ? 'step' : undefined}
            aria-disabled={tb.disabled || undefined}
            onClick={() => !tb.disabled && setTab(tb.id)}
            onKeyDown={e => {
              if (!tb.disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setTab(tb.id);
              }
            }}
          >
            <span className="phase-step-number" aria-hidden="true">
              {i + 1}
            </span>
            <span>{tb.label}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        {tab === 'teams' && (
          <TeamsTab
            state={state}
            locked={locked}
            update={update}
            levelLabel={levelLabel}
            categoryLabel={categoryLabel}
            onInvalid={() => showToast(t('rapieres.team_incomplete'), 'warning')}
            confirm={confirm}
          />
        )}
        {tab === 'pools' && (
          <PoolsTab
            state={state}
            locked={locked}
            update={update}
            teamName={teamName}
            levelLabel={levelLabel}
            onGenerate={async poolCount => {
              const present = checkedInTeams(state.teams);
              if (present.length < 2) {
                showToast(t('rapieres.min_teams'), 'warning');
                return;
              }
              if (state.pools.length > 0 && !(await confirm(t('rapieres.confirm_regen_pools'))))
                return;
              const pools = distributeTeams(present, poolCount);
              update({
                ...state,
                pools,
                bouts: buildBouts(pools),
                launchedWave: 0,
                tableau: undefined,
              });
            }}
          />
        )}
        {tab === 'waves' && <WavesTab state={state} update={update} teamName={teamName} />}
        {tab === 'rankings' && (
          <RankingsTab
            competition={competition}
            state={state}
            levelLabel={levelLabel}
            categoryLabel={categoryLabel}
            onExportError={() => showToast(t('rapieres.pdf_error'), 'error')}
          />
        )}
        {tab === 'tableau' && (
          <TableauTab
            state={state}
            update={update}
            teamName={teamName}
            onGenerate={async () => {
              if (
                state.tableau?.scores.length &&
                !(await confirm(t('rapieres.confirm_reset_tableau')))
              )
                return;
              update({ ...state, tableau: createTableau(selectQualifiers(state)) });
            }}
          />
        )}
      </div>
    </div>
  );
};

// ─── Équipes ─────────────────────────────────────────────────────────────────

const TeamsTab: React.FC<{
  state: RapieresState;
  locked: boolean;
  update: (s: RapieresState) => void;
  levelLabel: (l: RapieresLevel) => string;
  categoryLabel: (c: RapieresAgeCategory) => string;
  onInvalid: () => void;
  confirm: (message: string) => Promise<boolean>;
}> = ({ state, locked, update, levelLabel, categoryLabel, onInvalid, confirm }) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [level, setLevel] = useState<RapieresLevel>('beginner');
  const [fencers, setFencers] = useState<[RapieresFencer, RapieresFencer]>([
    emptyFencer(),
    emptyFencer(),
  ]);

  const setFencer = (i: 0 | 1, patch: Partial<RapieresFencer>) =>
    setFencers(prev => {
      const next: [RapieresFencer, RapieresFencer] = [{ ...prev[0] }, { ...prev[1] }];
      next[i] = { ...next[i], ...patch };
      return next;
    });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setLevel('beginner');
    setFencers([emptyFencer(), emptyFencer()]);
  };

  const startEdit = (team: RapieresTeam) => {
    setEditingId(team.id);
    setName(team.name);
    setLevel(team.level);
    setFencers([{ ...team.fencers[0] }, { ...team.fencers[1] }]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = fencers.map(f => ({
      ...f,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
    })) as [RapieresFencer, RapieresFencer];
    if (!name.trim() || clean.some(f => !f.lastName)) {
      onInvalid();
      return;
    }
    if (editingId) {
      // Modification : poules conservées (le niveau ne sert qu'à la répartition initiale)
      update({
        ...state,
        teams: state.teams.map(tm =>
          tm.id === editingId ? { ...tm, name: name.trim(), level, fencers: clean } : tm
        ),
      });
    } else {
      const team: RapieresTeam = {
        id: newId(),
        name: name.trim(),
        level,
        fencers: clean,
        status: 'not_checked_in',
      };
      // Nouvelle équipe : poules à régénérer
      update({ ...state, teams: [...state.teams, team], pools: [], bouts: [], tableau: undefined });
    }
    resetForm();
  };

  const remove = (id: string) => {
    if (editingId === id) resetForm();
    update({
      ...state,
      teams: state.teams.filter(tm => tm.id !== id),
      pools: [],
      bouts: [],
      tableau: undefined,
    });
  };

  /** Pointage : modifie les équipes à répartir, les poules déjà générées sont effacées */
  const setCheckIn = async (ids: string[], checkedIn: boolean) => {
    if (state.pools.length > 0 && !(await confirm(t('rapieres.confirm_checkin_reset_pools'))))
      return;
    const target = new Set(ids);
    const status: RapieresTeamStatus = checkedIn ? 'checked_in' : 'not_checked_in';
    update({
      ...state,
      teams: state.teams.map(tm => (target.has(tm.id) ? { ...tm, status } : tm)),
      pools: [],
      bouts: [],
      tableau: undefined,
    });
  };

  /** Abandon, forfait, exclusion, réactivation : rencontres annulées, poules conservées */
  const setStatus = async (team: RapieresTeam, status: RapieresTeamStatus, messageKey: string) => {
    if (!(await confirm(t(messageKey, { name: team.name })))) return;
    update({
      ...state,
      teams: state.teams.map(tm => (tm.id === team.id ? { ...tm, status } : tm)),
    });
  };

  const notCheckedIn = state.teams.filter(tm => teamStatus(tm) === 'not_checked_in');
  const checkedInCount = checkedInTeams(state.teams).length;
  const showForm = !locked || editingId !== null;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {locked && <p className="text-muted">{t('rapieres.teams_locked')}</p>}
      {showForm && (
        <form
          className="card"
          style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}
          onSubmit={submit}
        >
          {editingId && (
            <p style={{ fontWeight: 600 }}>
              {t('rapieres.editing_team', {
                name: state.teams.find(tm => tm.id === editingId)?.name ?? '',
              })}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ flex: '2 1 14rem' }}>
              {t('rapieres.team_name')}
              <input type="text" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label style={{ flex: '1 1 10rem' }}>
              {t('rapieres.level')}
              <select value={level} onChange={e => setLevel(e.target.value as RapieresLevel)}>
                {RAPIERES_LEVELS.map(l => (
                  <option key={l} value={l}>
                    {levelLabel(l)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {([0, 1] as const).map(i => (
            <fieldset
              key={i}
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                border: 'none',
                padding: 0,
              }}
            >
              <legend style={{ fontWeight: 600 }}>
                {t('rapieres.fencer_n', { n: String(i + 1) })}
              </legend>
              <label style={{ flex: '1 1 10rem' }}>
                {t('rapieres.last_name')}
                <input
                  type="text"
                  value={fencers[i].lastName}
                  onChange={e => setFencer(i, { lastName: e.target.value })}
                />
              </label>
              <label style={{ flex: '1 1 10rem' }}>
                {t('rapieres.first_name')}
                <input
                  type="text"
                  value={fencers[i].firstName}
                  onChange={e => setFencer(i, { firstName: e.target.value })}
                />
              </label>
              <label style={{ flex: '1 1 10rem' }}>
                {t('rapieres.category')}
                <select
                  value={fencers[i].category}
                  onChange={e => setFencer(i, { category: e.target.value as RapieresAgeCategory })}
                >
                  {RAPIERES_AGE_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">
              {editingId ? t('rapieres.save_team') : t('rapieres.add_team')}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                {t('rapieres.cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      <div className="card" style={{ padding: '1rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '0.5rem',
          }}
        >
          <strong>{t('rapieres.teams_count', { count: String(state.teams.length) })}</strong>
          <span className="text-muted">
            {t('rapieres.checked_in_count', {
              checked: String(checkedInCount),
              count: String(state.teams.length),
            })}
          </span>
          {!locked && notCheckedIn.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setCheckIn(
                  notCheckedIn.map(tm => tm.id),
                  true
                )
              }
            >
              {t('rapieres.check_in_all')}
            </button>
          )}
        </div>
        {state.teams.length === 0 ? (
          <p className="text-muted">{t('rapieres.no_teams')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('rapieres.status')}</th>
                <th>{t('rapieres.team')}</th>
                <th>{t('rapieres.level')}</th>
                <th>{t('rapieres.fencers')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.teams.map(tm => {
                const status = teamStatus(tm);
                return (
                  <tr key={tm.id} style={{ opacity: status === 'checked_in' ? 1 : 0.7 }}>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td>{tm.name}</td>
                    <td>{levelLabel(tm.level)}</td>
                    <td>
                      {tm.fencers
                        .map(f => `${fencerName(f)} (${categoryLabel(f.category)})`)
                        .join(' · ')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(tm)}
                        >
                          {t('rapieres.edit')}
                        </button>
                        {!locked && (status === 'not_checked_in' || status === 'checked_in') && (
                          <button
                            type="button"
                            className={`btn btn-sm ${status === 'checked_in' ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => setCheckIn([tm.id], status !== 'checked_in')}
                          >
                            {status === 'checked_in'
                              ? t('rapieres.uncheck')
                              : t('rapieres.check_in')}
                          </button>
                        )}
                        {status === 'checked_in' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-warning btn-sm"
                              onClick={() => setStatus(tm, 'abandoned', 'rapieres.confirm_abandon')}
                            >
                              {t('rapieres.abandon')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-warning btn-sm"
                              onClick={() => setStatus(tm, 'forfait', 'rapieres.confirm_forfait')}
                            >
                              {t('rapieres.forfait')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setStatus(tm, 'excluded', 'rapieres.confirm_exclude')}
                            >
                              {t('rapieres.exclude')}
                            </button>
                          </>
                        )}
                        {(status === 'abandoned' || status === 'forfait') && (
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() =>
                              setStatus(tm, 'checked_in', 'rapieres.confirm_reactivate')
                            }
                          >
                            {t('rapieres.reactivate')}
                          </button>
                        )}
                        {!locked && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => remove(tm.id)}
                          >
                            {t('rapieres.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── Poules ──────────────────────────────────────────────────────────────────

const PoolsTab: React.FC<{
  state: RapieresState;
  locked: boolean;
  update: (s: RapieresState) => void;
  teamName: (id: string | null) => string;
  levelLabel: (l: RapieresLevel) => string;
  onGenerate: (poolCount: number) => void;
}> = ({ state, locked, update, teamName, levelLabel, onGenerate }) => {
  const { t } = useTranslation();
  const presentCount = checkedInTeams(state.teams).length;
  const [poolCount, setPoolCount] = useState(state.pools.length || defaultPoolCount(presentCount));
  const teamById = new Map(state.teams.map(tm => [tm.id, tm]));

  const move = (teamId: string, to: number) => {
    const pools = state.pools.map((p, i) => ({
      teamIds:
        i === to
          ? [...p.teamIds.filter(id => id !== teamId), teamId]
          : p.teamIds.filter(id => id !== teamId),
    }));
    update({ ...state, pools, bouts: buildBouts(pools), launchedWave: 0, tableau: undefined });
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {locked ? (
        <p className="text-muted">{t('rapieres.pools_locked')}</p>
      ) : (
        <div
          className="card"
          style={{
            padding: '1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <label>
            {t('rapieres.pool_count')}
            <input
              type="number"
              min={1}
              max={Math.max(1, presentCount)}
              value={poolCount}
              onChange={e => setPoolCount(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: '5rem' }}
            />
          </label>
          <label>
            {t('rapieres.pool_max_score')}
            <input
              type="number"
              min={1}
              max={50}
              value={state.poolMaxScore}
              onChange={e =>
                update({ ...state, poolMaxScore: Math.max(1, Number(e.target.value) || 1) })
              }
              style={{ width: '5rem' }}
            />
          </label>
          <label>
            {t('rapieres.tableau_max_score')}
            <input
              type="number"
              min={1}
              max={50}
              value={state.tableauMaxScore}
              onChange={e =>
                update({ ...state, tableauMaxScore: Math.max(1, Number(e.target.value) || 1) })
              }
              style={{ width: '5rem' }}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => onGenerate(poolCount)}>
            {t('rapieres.generate_pools')}
          </button>
        </div>
      )}
      {state.pools.length === 0 ? (
        <p className="text-muted">{t('rapieres.no_pools')}</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))',
          }}
        >
          {state.pools.map((pool, poolIndex) => (
            <div key={poolIndex} className="card" style={{ padding: '1rem' }}>
              <h3>
                {t('rapieres.pool_n', { n: String(poolIndex + 1) })}
                <span className="text-muted" style={{ marginLeft: '0.5rem', fontWeight: 400 }}>
                  {t('rapieres.teams_count', { count: String(pool.teamIds.length) })}
                </span>
              </h3>
              <table className="table">
                <tbody>
                  {pool.teamIds.map(id => (
                    <tr key={id}>
                      <td>
                        {teamName(id)}
                        {teamById.get(id) && teamStatus(teamById.get(id)!) !== 'checked_in' && (
                          <span style={{ marginLeft: '0.5rem' }}>
                            <StatusBadge status={teamStatus(teamById.get(id)!)} />
                          </span>
                        )}
                      </td>
                      <td className="text-muted">
                        {levelLabel(teamById.get(id)?.level ?? 'beginner')}
                      </td>
                      <td>
                        {!locked && state.pools.length > 1 && (
                          <select
                            aria-label={t('rapieres.move_to')}
                            value={poolIndex}
                            onChange={e => move(id, Number(e.target.value))}
                          >
                            {state.pools.map((_, i) => (
                              <option key={i} value={i}>
                                {t('rapieres.pool_n', { n: String(i + 1) })}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Vagues ──────────────────────────────────────────────────────────────────

const WavesTab: React.FC<{
  state: RapieresState;
  update: (s: RapieresState) => void;
  teamName: (id: string | null) => string;
}> = ({ state, update, teamName }) => {
  const { t } = useTranslation();
  const total = waveCount(state.bouts);
  const next = state.launchedWave + 1;
  const done = state.launchedWave >= total && arePoolsComplete(state);
  const withdrawn = withdrawnTeamIds(state.teams);

  const saveScore = (id: string, score: { scoreA: number; scoreB: number } | null) =>
    update({
      ...state,
      bouts: state.bouts.map(b =>
        b.id === id ? { ...b, scoreA: score?.scoreA ?? null, scoreB: score?.scoreB ?? null } : b
      ),
      tableau: undefined,
    });

  const waves = Array.from({ length: state.launchedWave }, (_, i) => state.launchedWave - i);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div
        className="card"
        style={{
          padding: '1rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <strong>
          {state.launchedWave === 0
            ? t('rapieres.no_wave')
            : t('rapieres.waves_progress', {
                current: String(state.launchedWave),
                total: String(total),
              })}
        </strong>
        {state.launchedWave < total && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canLaunchNextWave(state)}
            onClick={() => update({ ...state, launchedWave: next })}
          >
            {t('rapieres.launch_wave', { n: String(next) })}
          </button>
        )}
        {state.launchedWave > 0 && state.launchedWave < total && !canLaunchNextWave(state) && (
          <span className="text-muted">{t('rapieres.wave_incomplete')}</span>
        )}
        {done && <span className="text-muted">{t('rapieres.all_waves_done')}</span>}
      </div>
      {waves.map(wave => (
        <div key={wave} className="card" style={{ padding: '1rem' }}>
          <h3>{t('rapieres.wave_n', { n: String(wave) })}</h3>
          <table className="table">
            <tbody>
              {state.bouts
                .filter(b => b.wave === wave)
                .sort((a, b) => a.poolIndex - b.poolIndex)
                .map(b => (
                  <tr
                    key={b.id}
                    style={{ opacity: isBoutDone(b) || isBoutVoid(b, withdrawn) ? 0.75 : 1 }}
                  >
                    <td className="text-muted">
                      {t('rapieres.pool_n', { n: String(b.poolIndex + 1) })}
                    </td>
                    <td style={{ textAlign: 'right' }}>{teamName(b.teamAId)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {isBoutVoid(b, withdrawn) ? (
                        <span className="text-muted">{t('rapieres.bout_void')}</span>
                      ) : (
                        <ScoreEntry
                          scoreA={b.scoreA}
                          scoreB={b.scoreB}
                          max={state.poolMaxScore}
                          invalidLabel={t('rapieres.score_invalid', {
                            max: String(state.poolMaxScore),
                          })}
                          onSave={score => saveScore(b.id, score)}
                        />
                      )}
                    </td>
                    <td>{teamName(b.teamBId)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

// ─── Classements ─────────────────────────────────────────────────────────────

const RankingsTab: React.FC<{
  competition: Competition;
  state: RapieresState;
  levelLabel: (l: RapieresLevel) => string;
  categoryLabel: (c: RapieresAgeCategory) => string;
  onExportError: () => void;
}> = ({ competition, state, levelLabel, categoryLabel, onExportError }) => {
  const { t } = useTranslation();
  const finalAvailable =
    !!state.tableau && isTableauComplete(state.tableau, withdrawnTeamIds(state.teams));
  const [stage, setStage] = useState<'intermediate' | 'final'>(
    finalAvailable ? 'final' : 'intermediate'
  );
  const [filterKey, setFilterKey] = useState('teams');

  const filters = useMemo(() => {
    const list: { key: string; label: string; filter: RapieresRankingFilter }[] = [
      { key: 'teams', label: t('rapieres.ranking_teams'), filter: { kind: 'teams' } },
    ];
    for (const level of RAPIERES_LEVELS)
      list.push({
        key: `level:${level}`,
        label: t('rapieres.ranking_level', { level: levelLabel(level) }),
        filter: { kind: 'level', level },
      });
    for (const category of RAPIERES_AGE_CATEGORIES)
      list.push({
        key: `category:${category}`,
        label: t('rapieres.ranking_category', { category: categoryLabel(category) }),
        filter: { kind: 'category', category },
      });
    return list;
  }, [t, levelLabel, categoryLabel]);

  const selected = filters.find(f => f.key === filterKey) ?? filters[0];
  const effectiveStage = finalAvailable ? stage : 'intermediate';
  const ranked =
    effectiveStage === 'final'
      ? computeFinalRanking(state)
      : computeOverallRanking(state).map(r => ({ teamId: r.teamId, rank: r.rank }));
  const stats = computeTeamStats(activeBouts(state));
  const rows = filterRanking(ranked, state.teams, selected.filter);
  const teamById = new Map(state.teams.map(tm => [tm.id, tm]));
  const individual = selected.filter.kind === 'category';
  const stageLabel =
    effectiveStage === 'final' ? t('rapieres.ranking_final') : t('rapieres.ranking_intermediate');

  const headers = [
    t('rapieres.rank'),
    individual ? t('rapieres.fencer') : t('rapieres.team'),
    individual ? t('rapieres.team') : t('rapieres.fencers'),
    t('rapieres.victories'),
    t('rapieres.matches'),
    t('rapieres.indice'),
    t('rapieres.touches_given'),
  ];
  const tableRows = rows.map(r => {
    const team = teamById.get(r.teamId)!;
    const s = stats.get(r.teamId) ?? {
      matches: 0,
      victories: 0,
      touchesGiven: 0,
      touchesReceived: 0,
    };
    const ind = s.touchesGiven - s.touchesReceived;
    return [
      r.rank,
      individual ? fencerName(team.fencers[r.fencerIndex ?? 0]) : team.name,
      individual ? team.name : team.fencers.map(fencerName).join(' · '),
      s.victories,
      s.matches,
      ind > 0 ? `+${ind}` : String(ind),
      s.touchesGiven,
    ];
  });

  const exportPdf = async () => {
    try {
      await exportRapieresRankingToPDF(
        {
          title: competition.title,
          subtitle: `${stageLabel} — ${selected.label}`,
          headers,
          rows: tableRows,
        },
        `classement-${selected.key.replace(':', '-')}.pdf`
      );
    } catch {
      onExportError();
    }
  };

  return (
    <div className="card" style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {finalAvailable && (
          <select
            value={stage}
            onChange={e => setStage(e.target.value as 'intermediate' | 'final')}
          >
            <option value="intermediate">{t('rapieres.ranking_intermediate')}</option>
            <option value="final">{t('rapieres.ranking_final')}</option>
          </select>
        )}
        <select
          aria-label={t('rapieres.ranking_select')}
          value={selected.key}
          onChange={e => setFilterKey(e.target.value)}
        >
          {filters.map(f => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rows.length === 0}
          onClick={exportPdf}
        >
          {t('rapieres.export_pdf')}
        </button>
      </div>
      <h3>{`${stageLabel} — ${selected.label}`}</h3>
      {rows.length === 0 ? (
        <p className="text-muted">{t('rapieres.no_ranking')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r, i) => (
              <tr key={`${rows[i].teamId}-${rows[i].fencerIndex ?? ''}`}>
                {r.map((c, j) => (
                  <td key={j} style={j === 0 ? { fontWeight: 700 } : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {effectiveStage === 'intermediate' &&
        computePoolRankings(state).length > 1 &&
        selected.filter.kind === 'teams' && (
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
            }}
          >
            {computePoolRankings(state).map((ranking, i) => (
              <div key={i}>
                <h4>{t('rapieres.pool_n', { n: String(i + 1) })}</h4>
                <table className="table">
                  <tbody>
                    {ranking.map(r => (
                      <tr key={r.teamId}>
                        <td style={{ fontWeight: 700 }}>{r.rank}</td>
                        <td>{teamById.get(r.teamId)?.name}</td>
                        <td>{`${r.stats.victories}/${r.stats.matches}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

// ─── Tableau ─────────────────────────────────────────────────────────────────

const TableauTab: React.FC<{
  state: RapieresState;
  update: (s: RapieresState) => void;
  teamName: (id: string | null) => string;
  onGenerate: () => void;
}> = ({ state, update, teamName, onGenerate }) => {
  const { t } = useTranslation();
  const ready = arePoolsComplete(state);
  const roundLabel = (round: number) =>
    round === 0
      ? t('rapieres.third_place')
      : round === 1
        ? t('rapieres.round_final')
        : round === 2
          ? t('rapieres.round_semi')
          : round === 4
            ? t('rapieres.round_quarter')
            : t('rapieres.round_n', { n: String(round * 2) });

  if (!ready) return <p className="text-muted">{t('rapieres.tableau_waiting')}</p>;

  const tableau = state.tableau;
  const matches = tableau ? resolveTableau(tableau, withdrawnTeamIds(state.teams)) : [];
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) =>
    a === 0 ? 1 : b === 0 ? -1 : b - a
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div
        className="card"
        style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}
      >
        <button type="button" className="btn btn-primary" onClick={onGenerate}>
          {t('rapieres.generate_tableau')}
        </button>
        {tableau && (
          <span className="text-muted">
            {t('rapieres.qualifiers', { count: String(tableau.seeds.length) })}
          </span>
        )}
      </div>
      {tableau &&
        rounds.map(round => (
          <div key={round} className="card" style={{ padding: '1rem' }}>
            <h3>{roundLabel(round)}</h3>
            <table className="table">
              <tbody>
                {matches
                  .filter(m => m.round === round && (m.teamAId || m.teamBId || round <= 1))
                  .map(m => (
                    <tr key={`${m.round}-${m.position}`}>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: m.winnerId && m.winnerId === m.teamAId ? 700 : 400,
                        }}
                      >
                        {m.isBye && !m.teamAId ? t('rapieres.bye') : teamName(m.teamAId)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isPlayable(m) ? (
                          <ScoreEntry
                            scoreA={m.scoreA}
                            scoreB={m.scoreB}
                            max={state.tableauMaxScore}
                            invalidLabel={t('rapieres.score_invalid', {
                              max: String(state.tableauMaxScore),
                            })}
                            onSave={score =>
                              update({
                                ...state,
                                tableau: setTableauScore(tableau, m.round, m.position, score),
                              })
                            }
                          />
                        ) : m.walkover ? (
                          <span className="text-muted">{t('rapieres.walkover')}</span>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                      <td
                        style={{ fontWeight: m.winnerId && m.winnerId === m.teamBId ? 700 : 400 }}
                      >
                        {m.isBye && !m.teamBId ? t('rapieres.bye') : teamName(m.teamBId)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
};

export default RapieresView;
