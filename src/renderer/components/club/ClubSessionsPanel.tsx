/**
 * BellePoule Modern - Mode Club (#1872) : séances. Ouverture, pointage des présents,
 * combats libres sur les pistes (appariement manuel ou scan webcam), scores, fermeture.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Lock,
  Play,
  QrCode,
  Radio,
  ScanLine,
  Unlock,
  WifiOff,
  X,
} from 'lucide-react';
import type { ClubBout, ClubMember, ClubSession, ClubSettings } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { ClubScanModal } from './ClubScanModal';
import ArenaQrCodesModal from '../ArenaQrCodesModal';

interface RemoteState {
  active: boolean;
  url: string | null;
  strips: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isLive = (b: ClubBout) => b.status === 'pending' || b.status === 'in_progress';

interface ClubSessionsPanelProps {
  clubId: string;
  settings: ClubSettings;
}

/** Combat en cours sur une piste : saisie du score par le maître d'armes */
const LiveBout: React.FC<{
  bout: ClubBout;
  name: (id: string) => string;
  onFinish: (scoreA: number, scoreB: number) => void;
  onCancel: () => void;
}> = ({ bout, name, onFinish, onCancel }) => {
  const { t } = useTranslation();
  const [a, setA] = useState(bout.scoreA);
  const [b, setB] = useState(bout.scoreB);
  return (
    <div className="club-bout-live">
      <label className="club-bout-side">
        <span className="font-medium">{name(bout.memberAId)}</span>
        <input
          className="form-input club-score-input"
          type="number"
          min={0}
          max={99}
          value={a}
          onChange={e => setA(Number(e.target.value))}
        />
      </label>
      <span className="club-vs">VS</span>
      <label className="club-bout-side">
        <span className="font-medium">{name(bout.memberBId)}</span>
        <input
          className="form-input club-score-input"
          type="number"
          min={0}
          max={99}
          value={b}
          onChange={e => setB(Number(e.target.value))}
        />
      </label>
      <Button variant="success" size="sm" onClick={() => onFinish(a, b)}>
        {t('clubSession.finish')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={<X size={14} aria-hidden="true" />}
        aria-label={t('clubSession.cancel_bout')}
        title={t('clubSession.cancel_bout')}
        onClick={onCancel}
      />
    </div>
  );
};

/** Piste libre : appariement manuel parmi les présents */
const FreeStrip: React.FC<{
  candidates: ClubMember[];
  strip: number;
  onLaunch: (a: string, b: string) => void;
}> = ({ candidates, strip, onLaunch }) => {
  const { t } = useTranslation();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const options = (exclude: string) =>
    candidates
      .filter(m => m.id !== exclude)
      .map(m => (
        <option key={m.id} value={m.id}>
          {m.lastName} {m.firstName}
        </option>
      ));
  return (
    <div className="club-bout-free">
      <select
        className="form-input"
        value={a}
        aria-label={t('clubSession.fencer_n', { n: 1, strip })}
        onChange={e => setA(e.target.value)}
      >
        <option value="">{t('clubSession.choose_fencer')}</option>
        {options(b)}
      </select>
      <span className="club-vs">VS</span>
      <select
        className="form-input"
        value={b}
        aria-label={t('clubSession.fencer_n', { n: 2, strip })}
        onChange={e => setB(e.target.value)}
      >
        <option value="">{t('clubSession.choose_fencer')}</option>
        {options(a)}
      </select>
      <Button
        variant="primary"
        size="sm"
        icon={<Play size={14} aria-hidden="true" />}
        disabled={!a || !b}
        onClick={() => onLaunch(a, b)}
      >
        {t('clubSession.launch')}
      </Button>
    </div>
  );
};

export const ClubSessionsPanel: React.FC<ClubSessionsPanelProps> = ({ clubId, settings }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;

  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [bouts, setBouts] = useState<ClubBout[]>([]);
  const [label, setLabel] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [remote, setRemote] = useState<RemoteState>({ active: false, url: null, strips: 0 });
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const current = sessions.find(s => s.status === 'open') ?? null;

  const load = useCallback(async () => {
    if (!api) return;
    const [list, mem] = await Promise.all([api.listSessions(clubId), api.listMembers(clubId)]);
    setSessions(list);
    setMembers(mem);
    const open = list.find(s => s.status === 'open');
    setBouts(open ? await api.listBouts({ sessionId: open.id, includeUnfinished: true }) : []);
    setRemote(await api.remoteStatus());
  }, [api, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Score validé sur une tablette arbitre : la séance se met à jour
  useEffect(() => window.electronAPI?.onTrainingMatchFinished?.(() => void load()), [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast(errText(e), 'error');
    }
    await load();
  };

  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const name = (id: string) => {
    const m = byId.get(id);
    return m ? `${m.lastName} ${m.firstName}` : '?';
  };

  if (!api) return null;

  if (!current) {
    return (
      <div className="club-members">
        <section className="club-card" aria-labelledby="club-open-title">
          <h2 id="club-open-title" className="club-card-title">
            {t('clubSession.open_title')}
          </h2>
          <div className="club-row">
            <label className="form-label club-grow">
              {t('clubSession.label')}
              <input
                className="form-input"
                value={label}
                maxLength={100}
                placeholder={t('clubSession.label_ph')}
                onChange={e => setLabel(e.target.value)}
              />
            </label>
            <Button
              variant="primary"
              data-tour="club-open-session"
              icon={<CalendarPlus size={15} aria-hidden="true" />}
              onClick={() =>
                void run(async () => {
                  await api.createSession(clubId, {
                    date: today(),
                    label,
                    stripCount: settings.stripCount,
                  });
                  setLabel('');
                })
              }
            >
              {t('clubSession.open')}
            </Button>
          </div>
        </section>
        <section className="club-card" aria-labelledby="club-past-title">
          <h2 id="club-past-title" className="club-card-title">
            {t('clubSession.past')}
          </h2>
          {sessions.length === 0 ? (
            <EmptyState title={t('clubSession.none')} />
          ) : (
            <table className="table">
              <tbody>
                {sessions.slice(0, 20).map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.date}</td>
                    <td>{s.label ?? ''}</td>
                    <td className="text-sm text-muted">
                      {t('clubSession.present_count', { count: s.attendeeIds.length })}
                    </td>
                    <td className="club-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Unlock size={14} aria-hidden="true" />}
                        onClick={() => void run(() => api.reopenSession(s.id))}
                      >
                        {t('clubSession.reopen')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    );
  }

  /** Combat lancé : envoyé à la tablette de sa piste si la saisie distante est active */
  const pushToTablet = async (boutId: string) => {
    if (!remote.active) return;
    const r = await api.pushBout(boutId);
    if (r === 'busy') showToast(t('clubSession.remote_busy'), 'warning');
  };

  const startRemote = async () => {
    const training = window.electronAPI?.training;
    if (!training) return;
    setRemoteBusy(true);
    try {
      const srv = await training.startServer(undefined, undefined, true);
      if (!srv.success && srv.error !== 'training_already_started') {
        throw new Error(srv.error ?? t('clubSession.remote_error'));
      }
      const ses = await training.startSession(current.stripCount, current.weapon ?? 'E');
      if (!ses.success && !(await api.remoteStatus()).active) {
        throw new Error(ses.error ?? t('clubSession.remote_error'));
      }
      for (const b of bouts.filter(isLive)) await api.pushBout(b.id);
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setRemoteBusy(false);
      await load();
    }
  };

  const stopRemote = async () => {
    const training = window.electronAPI?.training;
    if (!training) return;
    setRemoteBusy(true);
    await training.stopSession().catch(() => undefined);
    await training.stopServer().catch(() => undefined);
    setRemoteBusy(false);
    await load();
  };

  const present = new Set(current.attendeeIds);
  const candidates = members.filter(m => present.has(m.id));
  const live = bouts.filter(isLive);
  const finished = bouts.filter(b => b.status === 'finished').reverse();
  const strips = Array.from({ length: current.stripCount }, (_, i) => i + 1);

  const closeSession = async () => {
    const ok = await confirm({
      message: t('clubSession.close_confirm', { count: live.length }),
      confirmLabel: t('clubSession.close'),
    });
    if (ok) await run(() => api.closeSession(current.id));
  };

  return (
    <div className="club-members">
      <section className="club-card">
        <div className="club-row club-row--between">
          <h2 className="club-card-title">
            {t('clubSession.current', { date: current.date })}
            {current.label ? ` · ${current.label}` : ''}
          </h2>
          <Button
            variant="primary"
            data-tour="club-scan"
            icon={<ScanLine size={15} aria-hidden="true" />}
            onClick={() => setScanOpen(true)}
          >
            {t('clubSession.scan')}
          </Button>
          <Button
            variant="ghost"
            icon={<Lock size={15} aria-hidden="true" />}
            onClick={() => void closeSession()}
          >
            {t('clubSession.close')}
          </Button>
        </div>
      </section>

      <section className="club-card" aria-labelledby="club-remote-title">
        <div className="club-row club-row--between">
          <h2 id="club-remote-title" className="club-card-title">
            {t('clubSession.remote')}
          </h2>
          {remote.active ? (
            <>
              <Button
                icon={<QrCode size={15} aria-hidden="true" />}
                onClick={() => setQrOpen(true)}
              >
                {t('clubSession.remote_qr')}
              </Button>
              <Button
                variant="danger"
                icon={<WifiOff size={15} aria-hidden="true" />}
                loading={remoteBusy}
                onClick={() => void stopRemote()}
              >
                {t('clubSession.remote_stop')}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              data-tour="club-remote"
              icon={<Radio size={15} aria-hidden="true" />}
              loading={remoteBusy}
              onClick={() => void startRemote()}
            >
              {t('clubSession.remote_start')}
            </Button>
          )}
        </div>
        <p className="club-muted">
          {remote.active && remote.url
            ? t('clubSession.remote_on', { url: remote.url })
            : t('clubSession.remote_off')}
        </p>
      </section>

      <section className="club-card" aria-labelledby="club-strips-title">
        <h2 id="club-strips-title" className="club-card-title">
          {t('clubSession.strips')}
        </h2>
        {candidates.length < 2 && live.length === 0 && (
          <p className="club-muted">{t('clubSession.need_two')}</p>
        )}
        <ul className="club-strips">
          {strips.map(n => {
            const bout = live.find(b => b.strip === n);
            return (
              <li key={n} className="club-strip">
                <span className="club-strip-label">{t('clubSession.strip_n', { n })}</span>
                {bout ? (
                  <LiveBout
                    key={bout.id}
                    bout={bout}
                    name={name}
                    onFinish={(a, b) =>
                      void run(() => api.finishBout(bout.id, { scoreA: a, scoreB: b }))
                    }
                    onCancel={() =>
                      void run(async () => {
                        await api.cancelBout(bout.id);
                        await api.releaseBout(bout.id);
                      })
                    }
                  />
                ) : (
                  <FreeStrip
                    candidates={candidates}
                    strip={n}
                    onLaunch={(a, b) =>
                      void run(async () => {
                        const created = await api.createBout({
                          sessionId: current.id,
                          memberAId: a,
                          memberBId: b,
                          strip: n,
                        });
                        await api.startBout(created.id);
                        await pushToTablet(created.id);
                      })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="club-card" aria-labelledby="club-attendance-title">
        <h2 id="club-attendance-title" className="club-card-title">
          {t('clubSession.attendance', { count: present.size })}
        </h2>
        {members.length === 0 ? (
          <p className="club-muted">{t('club.no_members_desc')}</p>
        ) : (
          <div className="club-attendance">
            {members.map(m => (
              <label key={m.id} className="club-nowrap">
                <input
                  type="checkbox"
                  checked={present.has(m.id)}
                  onChange={e =>
                    void run(() => api.setAttendance(current.id, m.id, e.target.checked))
                  }
                />{' '}
                {m.lastName} {m.firstName}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="club-card" aria-labelledby="club-results-title">
        <h2 id="club-results-title" className="club-card-title">
          {t('clubSession.results', { count: finished.length })}
        </h2>
        {finished.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('clubSession.col_strip')}</th>
                <th scope="col">{t('clubSession.col_bout')}</th>
                <th scope="col">{t('clubSession.col_score')}</th>
              </tr>
            </thead>
            <tbody>
              {finished.map(b => (
                <tr key={b.id}>
                  <td className="text-sm text-muted">{b.strip ?? '-'}</td>
                  <td>
                    <span className={b.winnerId === b.memberAId ? 'font-medium' : undefined}>
                      {name(b.memberAId)}
                    </span>
                    {' – '}
                    <span className={b.winnerId === b.memberBId ? 'font-medium' : undefined}>
                      {name(b.memberBId)}
                    </span>
                  </td>
                  <td>
                    {b.scoreA} – {b.scoreB}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {scanOpen && (
        <ClubScanModal
          session={current}
          onClose={() => setScanOpen(false)}
          onLaunched={boutId => void pushToTablet(boutId).finally(() => void load())}
        />
      )}
      {qrOpen && remote.url && (
        <ArenaQrCodesModal
          arenas={strips.map(n => ({
            number: n,
            refereeUrl: `${remote.url}/arene${n}/arbitre`,
            matchOrderUrl: `${remote.url}/arene${n}/matchs`,
          }))}
          competitionTitle={settings.name}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
};
