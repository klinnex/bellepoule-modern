/**
 * BellePoule Modern - Mode Club (#1872) : séances. Ouverture, pointage des présents,
 * combats libres sur les pistes (appariement manuel ou scan webcam), scores, fermeture.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CalendarDays,
  CalendarPlus,
  Eye,
  List,
  ClipboardList,
  FileDown,
  Lock,
  MessageSquare,
  Network,
  UserCheck,
  Pencil,
  Play,
  Printer,
  Share2,
  Upload,
  QrCode,
  Radio,
  ScanLine,
  Trash2,
  Unlock,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  ClubBout,
  ClubCoach,
  ClubMember,
  ClubSession,
  ClubSessionFeedback,
  ClubSessionInput,
  ClubRecurrence,
  ClubScheduleOptions,
  ClubSettings,
} from '../../../shared/types/club';
import { inAgeRange, type AgeRange } from '../../../shared/utils/clubAge';
import { AgeCategoryFilter, AgeRangeSelect, ageRangeText } from './ClubAgeRange';
import { ClubAttendanceModal } from './ClubAttendanceModal';
import { ClubLobbyQr } from './ClubLobbyQr';
import { ClubSessionFeedbackModal } from './ClubSessionFeedback';
import { ClubWeaponSelect } from './ClubWeaponSelect';
import { MiniCalendar, type DayMark } from './MiniCalendar';
import { openTextFile, saveTextFile } from './clubFiles';
import {
  ClubShareError,
  buildPlanFile,
  parsePlanFile,
  shareFileName,
} from '../../../shared/utils/clubShare';
import { exportClubPlanToPDF, printClubPlan } from '../../../shared/utils/pdfExport/clubPlanPdf';
import { Weapon } from '../../../shared/types';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { formatMinutes, planDuration } from '../../../shared/utils/clubPlan';
import { ClubSessionPlanner } from './ClubSessionPlanner';
import { ClubScheduleModal } from './ClubScheduleModal';
import { ClubCoachPicker, coachNames } from './ClubCoachPicker';
import { ClubSessionPlanCard } from './ClubSessionPlanCard';
import { activeSession, openClubSession, openSessions } from './clubSessionSwitch';
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
const ALL_INTERFACES = '0.0.0.0';
/** Interface réseau mémorisée (partagée avec le mode entraînement) */
const INTERFACE_STORAGE_KEY = 'bellepoule-training-interface';
const loadInterface = (): string => {
  try {
    return localStorage.getItem(INTERFACE_STORAGE_KEY) ?? ALL_INTERFACES;
  } catch {
    return ALL_INTERFACES;
  }
};
/** Séance pour la catégorie choisie : plage du cours contenant la catégorie ('' = toutes) */
const forCategory = (s: ClubSession, cat: string) => !cat || inAgeRange(cat, s);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isLive = (b: ClubBout) => b.status === 'pending' || b.status === 'in_progress';

interface ClubSessionsPanelProps {
  clubId: string;
  settings: ClubSettings;
  /** Change quand le menu global a modifié les séances */
  revision?: number;
  /** Séances modifiées depuis l'onglet (menu global à recharger) */
  onChanged?: () => void;
  /** Séance affichée parmi les ouvertes (null : la plus récente) */
  activeSessionId?: string | null;
  onActiveChange?: (id: string | null) => void;
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

export const ClubSessionsPanel: React.FC<ClubSessionsPanelProps> = ({
  clubId,
  settings,
  revision = 0,
  onChanged,
  activeSessionId = null,
  onActiveChange,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;

  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [openCoachIds, setOpenCoachIds] = useState<string[]>([]);
  const [bouts, setBouts] = useState<ClubBout[]>([]);
  const [label, setLabel] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [remote, setRemote] = useState<RemoteState>({ active: false, url: null, strips: 0 });
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [planner, setPlanner] = useState<{
    session: ClubSession | null;
    prefill?: Omit<ClubSessionInput, 'date'>;
  } | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<ClubSession | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [openRange, setOpenRange] = useState<AgeRange>({});
  const [switchTo, setSwitchTo] = useState('');
  // Vue liste (ouverture, séances prévues et passées) alors que des séances sont ouvertes
  const [listMode, setListMode] = useState(false);
  const [listCategory, setListCategory] = useState('');
  const [iface, setIface] = useState(loadInterface);
  const [interfaces, setInterfaces] = useState<{ name: string; address: string }[]>([]);
  const [openDate, setOpenDate] = useState(today);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Arme de la séance à ouvrir : celle du club par défaut
  const [weaponChoice, setWeaponChoice] = useState<Weapon | undefined>(undefined);
  const openWeapon = weaponChoice ?? settings.weapon;
  const setOpenWeapon = (w: Weapon) => setWeaponChoice(w);

  const current = activeSession(sessions, activeSessionId);
  const opened = openSessions(sessions);

  const load = useCallback(async () => {
    if (!api) return;
    const [list, mem, coachList] = await Promise.all([
      api.listSessions(clubId),
      api.listMembers(clubId),
      api.listCoaches(clubId, true),
    ]);
    setSessions(list);
    setMembers(mem);
    setCoaches(coachList);
    const open = activeSession(list, activeSessionId);
    setBouts(open ? await api.listBouts({ sessionId: open.id, includeUnfinished: true }) : []);
    setRemote(await api.remoteStatus());
  }, [api, clubId, activeSessionId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  // Interfaces réseau proposées pour la saisie distante (comme le mode entraînement)
  useEffect(() => {
    window.electronAPI?.remote
      ?.getNetworkInterfaces?.()
      .then(res => {
        const list = res?.success ? res.interfaces : undefined;
        if (list?.length) {
          setInterfaces(list);
          setIface(prev => (list.some(i => i.address === prev) ? prev : ALL_INTERFACES));
        }
      })
      .catch(() => undefined);
  }, []);

  const currentId = current?.id ?? null;
  // Saisie distante active : séance reliée (cartes scannées sur les tablettes) et
  // rafraîchissement régulier (combats lancés ou terminés depuis les tablettes)
  useEffect(() => {
    if (!api || !remote.active || !currentId) return;
    void api.linkRemote(currentId);
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [api, remote.active, currentId, load]);

  // Score validé sur une tablette arbitre : la séance se met à jour
  useEffect(() => window.electronAPI?.onTrainingMatchFinished?.(() => void load()), [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast(errText(e), 'error');
    }
    await load();
    onChanged?.();
  };

  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const name = (id: string) => {
    const m = byId.get(id);
    return m ? `${m.lastName} ${m.firstName}` : '?';
  };

  if (!api) return null;

  const planned = sessions
    .filter(s => s.status === 'planned' && forCategory(s, listCategory))
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = sessions.filter(s => s.status === 'closed' && forCategory(s, listCategory));
  /** Intitulé + catégories du cours + maîtres d'armes + série */
  const coachText = (s: ClubSession) => {
    const names = coachNames(s.coachIds ?? [], coaches);
    return names ? t('clubCoach.by', { names }) : '';
  };
  const sessionLabel = (s: ClubSession) =>
    [s.label ?? '', ageRangeText(s, t), coachText(s), s.seriesId ? t('clubPlan.series_badge') : '']
      .filter(Boolean)
      .join(' · ');

  const savePlan = (data: ClubSessionInput, recurrence?: ClubRecurrence) => {
    const target = planner?.session;
    setPlanner(null);
    const input = { ...data, planned: true, stripCount: settings.stripCount };
    void run(async () => {
      if (target) await api.updateSession(target.id, data);
      else if (recurrence) {
        const created = await api.createSeries(clubId, input, recurrence);
        showToast(t('clubPlan.series_created', { count: created.length }), 'success');
      } else await api.createSession(clubId, input);
    });
  };

  /** Séances sur jours d'ouverture (une série), puis fermetures (suppression des prévues) */
  const generateSchedule = (data: ClubSessionInput, options: ClubScheduleOptions) => {
    setScheduleOpen(false);
    void run(async () => {
      const res = await api.generateSessions(
        clubId,
        { ...data, planned: true, stripCount: settings.stripCount },
        options
      );
      showToast(
        t('clubSchedule.created', { count: res.created.length, skipped: res.skipped }),
        'success'
      );
    });
  };

  const closePeriod = async (from: string, until: string, count: number) => {
    setScheduleOpen(false);
    if (count === 0) return;
    const ok = await confirm({
      message: t('clubSchedule.close_confirm', { count, from, until }),
      confirmLabel: t('actions.delete'),
    });
    if (!ok) return;
    void run(async () => {
      const n = await api.deletePlannedBetween(clubId, from, until);
      showToast(t('clubSchedule.deleted', { count: n }), 'success');
    });
  };

  const removePlanned = async (s: ClubSession) => {
    const ok = await confirm({
      message: t('clubPlan.delete_confirm', { date: s.date }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteSession(s.id));
  };

  const saveFeedback = (
    s: ClubSession,
    feedback: ClubSessionFeedback,
    perMember: Record<string, string>
  ) => {
    setFeedbackFor(null);
    void run(async () => {
      await api.updateSession(s.id, { feedback });
      for (const memberId of s.attendeeIds) {
        const text = (perMember[memberId] ?? '').trim();
        if (text !== (s.memberFeedback[memberId] ?? '')) {
          await api.setMemberFeedback(s.id, memberId, text);
        }
      }
      showToast(t('clubFeedback.saved'), 'success');
    });
  };

  const feedbackModal = feedbackFor && (
    <ClubSessionFeedbackModal
      session={feedbackFor}
      members={members}
      onSave={(fb, per) => saveFeedback(feedbackFor, fb, per)}
      onClose={() => setFeedbackFor(null)}
    />
  );

  /** Plan de cours : export PDF ou impression, avec l'identité du club */
  const planOutput = async (s: ClubSession, mode: 'pdf' | 'print') => {
    const opts = {
      clubName: settings.name,
      logo: settings.logo,
      weaponLabel: s.weapon ? weaponLabel(s.weapon, t) : undefined,
    };
    try {
      if (mode === 'pdf') await exportClubPlanToPDF(s, opts);
      else await printClubPlan(s, opts);
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  /** Plan partageable (fichier JSON sans date, présents ni bilan) */
  const exportPlan = async (s: ClubSession) => {
    try {
      if (
        await saveTextFile(
          shareFileName('plan', s.label),
          buildPlanFile(s),
          t('clubPlan.export_plan')
        )
      ) {
        showToast(t('clubPlan.plan_exported'), 'success');
      }
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  /** Plan reçu d'un autre utilisateur : ouvert dans l'éditeur pour choisir la date */
  const importPlan = async () => {
    try {
      const text = await openTextFile(t('clubPlan.import_plan'));
      if (text === null) return;
      setPlanner({ session: null, prefill: parsePlanFile(text) });
    } catch (e) {
      showToast(e instanceof ClubShareError ? t(`clubShare.error_${e.code}`) : errText(e), 'error');
    }
  };

  /** Jours ayant déjà une séance, marqués dans les calendriers */
  const dayMarks: Record<string, DayMark> = {};
  for (const s of sessions)
    if (!dayMarks[s.date] || s.status === 'open') dayMarks[s.date] = s.status;

  const scheduleModal = scheduleOpen && (
    <ClubScheduleModal
      coaches={coaches}
      sessions={sessions}
      today={today()}
      stripCount={settings.stripCount}
      onClose={() => setScheduleOpen(false)}
      onGenerate={generateSchedule}
      onClosePeriod={(from, until, count) => void closePeriod(from, until, count)}
    />
  );
  const plannerModal = planner && (
    <ClubSessionPlanner
      session={planner.session}
      series={
        planner.session?.seriesId
          ? sessions.filter(s => s.seriesId === planner.session?.seriesId)
          : []
      }
      prefill={planner.prefill}
      defaultDate={today()}
      defaultWeapon={settings.weapon}
      coaches={coaches}
      marks={dayMarks}
      onSave={savePlan}
      onClose={() => setPlanner(null)}
    />
  );

  /** Affiche une séance ouverte */
  const showSession = (id: string) => {
    setListMode(false);
    onActiveChange?.(id);
  };

  if (!current || listMode) {
    return (
      <div className="club-members">
        {opened.length > 0 && (
          <section className="club-card" aria-labelledby="club-opened-title">
            <h2 id="club-opened-title" className="club-card-title">
              {t('clubSessionMenu.opened_list', { count: opened.length })}
            </h2>
            <table className="table">
              <tbody>
                {opened.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.date}</td>
                    <td>{sessionLabel(s)}</td>
                    <td className="club-actions">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Eye size={14} aria-hidden="true" />}
                        onClick={() => showSession(s.id)}
                      >
                        {t('clubSessionMenu.show')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section className="club-card" aria-labelledby="club-open-title">
          <h2 id="club-open-title" className="club-card-title">
            {t('clubSession.open_title')}
          </h2>
          <div className="club-open-form">
            <div className="form-label">
              {t('clubPlan.date')}
              <MiniCalendar
                value={openDate}
                today={today()}
                marks={dayMarks}
                label={t('clubPlan.date')}
                onChange={setOpenDate}
              />
            </div>
            <div className="club-open-fields">
              <label className="form-label">
                {t('clubSession.label')}
                <input
                  className="form-input"
                  value={label}
                  maxLength={100}
                  placeholder={t('clubSession.label_ph')}
                  onChange={e => setLabel(e.target.value)}
                />
              </label>
              <div className="club-row">
                <ClubWeaponSelect value={openWeapon} onChange={setOpenWeapon} />
                <AgeRangeSelect value={openRange} onChange={setOpenRange} />
              </div>
              <ClubCoachPicker coaches={coaches} value={openCoachIds} onChange={setOpenCoachIds} />
              <div className="club-open-actions">
                <Button
                  variant="primary"
                  data-tour="club-open-session"
                  icon={<CalendarPlus size={15} aria-hidden="true" />}
                  onClick={() =>
                    void run(async () => {
                      const created = await api.createSession(clubId, {
                        date: openDate,
                        label,
                        weapon: openWeapon,
                        stripCount: settings.stripCount,
                        ageFrom: openRange.ageFrom,
                        ageTo: openRange.ageTo,
                        coachIds: openCoachIds,
                      });
                      setLabel('');
                      setOpenCoachIds([]);
                      showSession(created.id);
                    })
                  }
                >
                  {t('clubSession.open')}
                </Button>
              </div>
            </div>
          </div>
        </section>
        <section className="club-card" aria-labelledby="club-planned-title">
          <div className="club-row club-row--between">
            <h2 id="club-planned-title" className="club-card-title">
              {t('clubPlan.upcoming')}
            </h2>
            <AgeCategoryFilter
              value={listCategory}
              onChange={setListCategory}
              label={t('clubAge.course_for')}
            />
            <Button
              icon={<Upload size={15} aria-hidden="true" />}
              onClick={() => void importPlan()}
            >
              {t('clubPlan.import_plan')}
            </Button>
            <Button
              icon={<CalendarDays size={15} aria-hidden="true" />}
              onClick={() => setScheduleOpen(true)}
            >
              {t('clubSchedule.open_btn')}
            </Button>
            <Button
              data-tour="club-plan-session"
              icon={<ClipboardList size={15} aria-hidden="true" />}
              onClick={() => setPlanner({ session: null })}
            >
              {t('clubPlan.prepare')}
            </Button>
          </div>
          {planned.length === 0 ? (
            <p className="club-muted">{t('clubPlan.none_planned')}</p>
          ) : (
            <table className="table">
              <tbody>
                {planned.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.date}</td>
                    <td>{sessionLabel(s)}</td>
                    <td className="text-sm text-muted">
                      {t('clubPlan.summary', {
                        count: s.plan.length,
                        duration: formatMinutes(planDuration(s.plan)),
                      })}
                    </td>
                    <td className="club-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil size={14} aria-hidden="true" />}
                        onClick={() => setPlanner({ session: s })}
                      >
                        {t('clubPlan.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<FileDown size={14} aria-hidden="true" />}
                        aria-label={t('clubPlan.export_pdf')}
                        title={t('clubPlan.export_pdf')}
                        onClick={() => void planOutput(s, 'pdf')}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Share2 size={14} aria-hidden="true" />}
                        aria-label={t('clubPlan.export_plan')}
                        title={t('clubPlan.export_plan')}
                        onClick={() => void exportPlan(s)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Printer size={14} aria-hidden="true" />}
                        aria-label={t('clubPlan.print')}
                        title={t('clubPlan.print')}
                        onClick={() => void planOutput(s, 'print')}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Play size={14} aria-hidden="true" />}
                        onClick={() =>
                          void run(async () => {
                            await api.startSession(s.id);
                            showSession(s.id);
                          })
                        }
                      >
                        {t('clubPlan.start')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        aria-label={t('actions.delete')}
                        title={t('actions.delete')}
                        onClick={() => void removePlanned(s)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="club-card" aria-labelledby="club-past-title">
          <h2 id="club-past-title" className="club-card-title">
            {t('clubSession.past')}
          </h2>
          {past.length === 0 ? (
            <EmptyState title={t('clubSession.none')} />
          ) : (
            <table className="table">
              <tbody>
                {past.slice(0, 20).map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.date}</td>
                    <td>{sessionLabel(s)}</td>
                    <td className="text-sm text-muted">
                      {t('clubSession.present_count', { count: s.attendeeIds.length })}
                      {s.feedback?.rating ? ` · ${'★'.repeat(s.feedback.rating)}` : ''}
                    </td>
                    <td className="club-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<MessageSquare size={14} aria-hidden="true" />}
                        onClick={() => setFeedbackFor(s)}
                      >
                        {t('clubFeedback.button')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Unlock size={14} aria-hidden="true" />}
                        onClick={() =>
                          void run(async () => {
                            await api.reopenSession(s.id);
                            showSession(s.id);
                          })
                        }
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
        {plannerModal}
        {scheduleModal}
        {feedbackModal}
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
      const srv = await training.startServer(undefined, iface, true);
      if (!srv.success && srv.error !== 'training_already_started') {
        throw new Error(srv.error ?? t('clubSession.remote_error'));
      }
      const ses = await training.startSession(
        current.stripCount,
        current.weapon ?? settings.weapon ?? Weapon.EPEE
      );
      if (!ses.success && !(await api.remoteStatus()).active) {
        throw new Error(ses.error ?? t('clubSession.remote_error'));
      }
      await api.linkRemote(current.id);
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
    await api.linkRemote(null).catch(() => undefined);
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
    if (!ok) return;
    await run(() => api.closeSession(current.id));
    // Fin de séance : proposer le bilan
    setFeedbackFor({ ...current, status: 'closed' });
  };

  /** Autres séances : ouvertes, prévues (par date) puis passées récentes */
  const switchTargets = [
    ...opened.filter(s => s.id !== current.id),
    ...sessions.filter(s => s.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)),
    ...sessions
      .filter(s => s.status === 'closed')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10),
  ];

  /** Bascule sans fermer la séance en cours : elle reste ouverte jusqu'à sa fermeture */
  const switchSession = async () => {
    const target = sessions.find(s => s.id === switchTo);
    if (!target) return;
    setSwitchTo('');
    await run(async () => {
      await openClubSession(api, target);
      showSession(target.id);
    });
  };

  return (
    <div className="club-members">
      <section className="club-card">
        <div className="club-row club-row--between">
          <h2 className="club-card-title">
            {t('clubSession.current', { date: current.date })}
            {current.label ? ` · ${current.label}` : ''}
            {ageRangeText(current, t) ? ` · ${ageRangeText(current, t)}` : ''}
            {coachText(current) ? ` · ${coachText(current)}` : ''}
            {current.weapon ? ` · ${weaponLabel(current.weapon, t)}` : ''}
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
            icon={<UserCheck size={15} aria-hidden="true" />}
            data-tour="club-attendance"
            onClick={() => setAttendanceOpen(true)}
          >
            {t('clubAttendance.button', { count: present.size })}
          </Button>
          <Button
            icon={<MessageSquare size={15} aria-hidden="true" />}
            onClick={() => setFeedbackFor(current)}
          >
            {t('clubFeedback.button')}
          </Button>
          <Button
            variant="ghost"
            icon={<List size={15} aria-hidden="true" />}
            onClick={() => setListMode(true)}
          >
            {t('clubSessionMenu.all_sessions')}
          </Button>
          <Button
            variant="ghost"
            icon={<Lock size={15} aria-hidden="true" />}
            onClick={() => void closeSession()}
          >
            {t('clubSession.close')}
          </Button>
        </div>
        {switchTargets.length > 0 && (
          <div className="club-row">
            <select
              className="form-input"
              value={switchTo}
              aria-label={t('clubSessionMenu.switch_to')}
              onChange={e => setSwitchTo(e.target.value)}
            >
              <option value="">{t('clubSessionMenu.switch_to')}</option>
              {switchTargets.map(s => (
                <option key={s.id} value={s.id}>
                  {s.date}
                  {sessionLabel(s) ? ` · ${sessionLabel(s)}` : ''}
                  {s.status === 'closed' ? ` (${t('clubSessionMenu.past_tag')})` : ''}
                  {s.status === 'open' ? ` (${t('clubSessionMenu.open_tag')})` : ''}
                </option>
              ))}
            </select>
            <Button
              icon={<ArrowRightLeft size={15} aria-hidden="true" />}
              disabled={!switchTo}
              onClick={() => void switchSession()}
            >
              {t('clubSessionMenu.switch')}
            </Button>
          </div>
        )}
      </section>

      <ClubSessionPlanCard
        key={current.id}
        session={current}
        onEdit={() => setPlanner({ session: current })}
        onExportPdf={() => void planOutput(current, 'pdf')}
        onPrint={() => void planOutput(current, 'print')}
        onExportPlan={() => void exportPlan(current)}
        onToggle={(itemId, done) =>
          void run(() =>
            api.updateSession(current.id, {
              plan: current.plan.map(it => (it.id === itemId ? { ...it, done } : it)),
            })
          )
        }
        onSaveNotes={notes => void run(() => api.updateSession(current.id, { notes }))}
      />

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
            <div className="club-row">
              <label className="form-label">
                <span>
                  <Network size={13} aria-hidden="true" /> {t('trainingLauncher.network')}
                </span>
                <select
                  className="form-input"
                  value={iface}
                  disabled={remoteBusy}
                  onChange={e => {
                    setIface(e.target.value);
                    try {
                      localStorage.setItem(INTERFACE_STORAGE_KEY, e.target.value);
                    } catch {
                      /* stockage indisponible */
                    }
                  }}
                >
                  <option value={ALL_INTERFACES}>{t('trainingLauncher.all_interfaces')}</option>
                  {interfaces
                    .filter(i => i.address !== ALL_INTERFACES)
                    .map(i => (
                      <option key={i.address} value={i.address}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                variant="primary"
                data-tour="club-remote"
                icon={<Radio size={15} aria-hidden="true" />}
                loading={remoteBusy}
                onClick={() => void startRemote()}
              >
                {t('clubSession.remote_start')}
              </Button>
            </div>
          )}
        </div>
        <p className="club-muted">
          {remote.active && remote.url
            ? t('clubSession.remote_on', { url: remote.url })
            : t('clubSession.remote_off')}
        </p>
        {remote.active && remote.url && (
          <>
            <p className="club-muted">{t('clubSession.remote_cards_hint')}</p>
            <ClubLobbyQr url={`${remote.url}/entrainement-lobby`} />
          </>
        )}
      </section>

      <section className="club-card" aria-labelledby="club-strips-title">
        <h2 id="club-strips-title" className="club-card-title">
          {t('clubSession.strips')}
        </h2>
        {candidates.length < 2 && live.length === 0 && (
          <p className="club-muted">
            {members.length === 0 ? t('club.no_members_desc') : t('clubSession.need_two')}
          </p>
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

      {plannerModal}
      {scheduleModal}
      {feedbackModal}
      {attendanceOpen && (
        <ClubAttendanceModal
          session={current}
          members={members}
          onToggle={(memberId, on) => void run(() => api.setAttendance(current.id, memberId, on))}
          onRangeChange={r =>
            void run(() =>
              api.updateSession(current.id, { ageFrom: r.ageFrom ?? null, ageTo: r.ageTo ?? null })
            )
          }
          onClose={() => setAttendanceOpen(false)}
        />
      )}
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
