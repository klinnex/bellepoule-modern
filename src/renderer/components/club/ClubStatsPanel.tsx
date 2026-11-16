/**
 * BellePoule Modern - Mode Club (#1872) : statistiques des membres par période
 * (séance, mois, trimestre, saison sportive, tout) — classement du club, puis fiche
 * d'un membre : bilan, progression et face-à-face.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type {
  ClubBoutFilter,
  ClubMember,
  ClubMemberReport,
  ClubMemberStats,
  ClubPeriodKind,
  ClubSession,
} from '../../../shared/types/club';
import { periodOf } from '../../../shared/utils/clubStats';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';

type Scope = 'season' | 'quarter' | 'month' | 'session' | 'all';

const today = () => new Date().toISOString().slice(0, 10);
const pct = (r: number) => `${Math.round(r * 100)} %`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Filtre des combats pour la portée choisie */
export function scopeFilter(scope: Scope, sessionId: string, date = today()): ClubBoutFilter {
  if (scope === 'all') return {};
  if (scope === 'session') return sessionId ? { sessionId } : {};
  const p = periodOf(date, scope);
  return { from: p.from, to: p.to };
}

/** Colonnes statistiques communes (classement, progression) */
const StatCells: React.FC<{ s: ClubMemberStats }> = ({ s }) => (
  <>
    <td>{s.bouts}</td>
    <td>{s.victories}</td>
    <td>{s.defeats}</td>
    <td>{s.draws}</td>
    <td className="font-medium">{pct(s.winRate)}</td>
    <td>{s.touchesScored}</td>
    <td>{s.touchesReceived}</td>
    <td>{signed(s.indice)}</td>
  </>
);

const StatHeaders: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <th scope="col">{t('clubStats.col_bouts')}</th>
      <th scope="col">{t('pdf.col_v')}</th>
      <th scope="col">{t('pdf.col_d')}</th>
      <th scope="col">{t('clubStats.col_draws')}</th>
      <th scope="col">{t('clubStats.col_win_rate')}</th>
      <th scope="col">{t('pdf.col_td')}</th>
      <th scope="col">{t('pdf.col_tr')}</th>
      <th scope="col">{t('pdf.col_index')}</th>
    </>
  );
};

export const ClubStatsPanel: React.FC = () => {
  const { t } = useTranslation();
  const api = window.electronAPI?.club;
  const [scope, setScope] = useState<Scope>('season');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [board, setBoard] = useState<ClubMemberStats[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<ClubPeriodKind>('month');
  const [report, setReport] = useState<ClubMemberReport | null>(null);

  const filter = useMemo(() => scopeFilter(scope, sessionId), [scope, sessionId]);

  useEffect(() => {
    if (!api) return;
    void (async () => {
      const [list, mem] = await Promise.all([api.listSessions(), api.listMembers(true)]);
      setSessions(list);
      setMembers(mem);
      setSessionId(prev => prev || list[0]?.id || '');
    })();
  }, [api]);

  const loadBoard = useCallback(async () => {
    if (api) setBoard(await api.getLeaderboard(filter));
  }, [api, filter]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!api || !selected) return;
    void api.getMemberReport(selected, filter, groupBy).then(setReport);
  }, [api, selected, filter, groupBy]);

  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const name = (id: string) => {
    const m = byId.get(id);
    return m ? `${m.lastName} ${m.firstName}` : '?';
  };

  if (!api) return null;

  const scopeBar = (
    <div className="club-row">
      <label className="form-label">
        {t('clubStats.period')}
        <select
          className="form-input"
          value={scope}
          onChange={e => setScope(e.target.value as Scope)}
        >
          <option value="season">
            {t('clubStats.scope_season', { key: periodOf(today(), 'season').key })}
          </option>
          <option value="quarter">
            {t('clubStats.scope_quarter', { key: periodOf(today(), 'quarter').key })}
          </option>
          <option value="month">
            {t('clubStats.scope_month', { key: periodOf(today(), 'month').key })}
          </option>
          <option value="session">{t('clubStats.scope_session')}</option>
          <option value="all">{t('clubStats.scope_all')}</option>
        </select>
      </label>
      {scope === 'session' && (
        <label className="form-label">
          {t('clubStats.session')}
          <select
            className="form-input"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.date}
                {s.label ? ` · ${s.label}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  if (selected) {
    return (
      <div className="club-members">
        <section className="club-card">
          <div className="club-row club-row--between">
            <h2 className="club-card-title">{name(selected)}</h2>
            <Button
              variant="ghost"
              icon={<ArrowLeft size={15} aria-hidden="true" />}
              onClick={() => {
                setSelected(null);
                setReport(null);
              }}
            >
              {t('clubStats.back')}
            </Button>
          </div>
          {scopeBar}
          {report && (
            <dl className="club-kpis">
              <div>
                <dt>{t('clubStats.col_bouts')}</dt>
                <dd>{report.stats.bouts}</dd>
              </div>
              <div>
                <dt>{t('clubStats.col_win_rate')}</dt>
                <dd>{pct(report.stats.winRate)}</dd>
              </div>
              <div>
                <dt>{t('pdf.col_index')}</dt>
                <dd>{signed(report.stats.indice)}</dd>
              </div>
              <div>
                <dt>{t('clubStats.col_sessions')}</dt>
                <dd>{report.stats.sessions}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="club-card" aria-labelledby="club-progress-title">
          <div className="club-row club-row--between">
            <h2 id="club-progress-title" className="club-card-title">
              {t('clubStats.progression')}
            </h2>
            <label className="form-label">
              {t('clubStats.group_by')}
              <select
                className="form-input"
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as ClubPeriodKind)}
              >
                <option value="day">{t('clubStats.by_day')}</option>
                <option value="month">{t('clubStats.by_month')}</option>
                <option value="quarter">{t('clubStats.by_quarter')}</option>
                <option value="season">{t('clubStats.by_season')}</option>
              </select>
            </label>
          </div>
          {!report || report.progression.length === 0 ? (
            <EmptyState title={t('clubStats.no_bouts')} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('clubStats.col_period')}</th>
                  <StatHeaders />
                </tr>
              </thead>
              <tbody>
                {report.progression.map(p => (
                  <tr key={p.period.key}>
                    <td className="font-medium">{p.period.key}</td>
                    <StatCells s={p.stats} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="club-card" aria-labelledby="club-h2h-title">
          <h2 id="club-h2h-title" className="club-card-title">
            {t('clubStats.head_to_head')}
          </h2>
          {report && report.headToHead.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('clubStats.col_opponent')}</th>
                  <th scope="col">{t('clubStats.col_bouts')}</th>
                  <th scope="col">{t('pdf.col_v')}</th>
                  <th scope="col">{t('pdf.col_d')}</th>
                  <th scope="col">{t('clubStats.col_draws')}</th>
                  <th scope="col">{t('pdf.col_td')}</th>
                  <th scope="col">{t('pdf.col_tr')}</th>
                </tr>
              </thead>
              <tbody>
                {report.headToHead.map(h => (
                  <tr key={h.opponentId}>
                    <td className="font-medium">{name(h.opponentId)}</td>
                    <td>{h.bouts}</td>
                    <td>{h.victories}</td>
                    <td>{h.defeats}</td>
                    <td>{h.draws}</td>
                    <td>{h.touchesScored}</td>
                    <td>{h.touchesReceived}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="club-members">
      <section className="club-card" aria-labelledby="club-board-title">
        <h2 id="club-board-title" className="club-card-title">
          {t('clubStats.leaderboard')}
        </h2>
        {scopeBar}
        {board.length === 0 ? (
          <EmptyState title={t('clubStats.no_bouts')} description={t('clubStats.no_bouts_desc')} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('pdf.col_rank')}</th>
                <th scope="col">{t('fencerList.col_last_name')}</th>
                <th scope="col">{t('fencerList.col_first_name')}</th>
                <StatHeaders />
                <th scope="col">{t('clubStats.col_sessions')}</th>
              </tr>
            </thead>
            <tbody>
              {board.map((s, i) => {
                const m = byId.get(s.memberId);
                return (
                  <tr
                    key={s.memberId}
                    className="club-clickable"
                    tabIndex={0}
                    onClick={() => setSelected(s.memberId)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') setSelected(s.memberId);
                    }}
                  >
                    <td className="text-muted">{i + 1}</td>
                    <td className="font-medium">{m?.lastName ?? '?'}</td>
                    <td>{m?.firstName ?? ''}</td>
                    <StatCells s={s} />
                    <td className="text-sm text-muted">{s.sessions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
