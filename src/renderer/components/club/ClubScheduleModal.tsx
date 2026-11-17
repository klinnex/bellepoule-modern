/**
 * Mode Club : séances automatiques sur jours d'ouverture, et fermetures (suppression des
 * séances prévues sur une période, ex. vacances scolaires).
 */
import React, { useMemo, useState } from 'react';
import type {
  ClubCoach,
  ClubDateRange,
  ClubScheduleOptions,
  ClubSession,
  ClubSessionInput,
} from '../../../shared/types/club';
import {
  addDays,
  MAX_SCHEDULE_DATES,
  MAX_SCHEDULE_DAYS,
  MAX_SCHEDULE_PERIODS,
  weekdayDates,
  type AgeRange,
} from '../../../shared/utils/clubAge';
import { AgeRangeSelect } from './ClubAgeRange';
import { ClubCoachPicker } from './ClubCoachPicker';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

type Mode = 'generate' | 'close';

/** Semaine affichée lundi → dimanche (valeurs Date.getUTCDay : 0 = dimanche) */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Libellé court du jour, dans la langue du système (5 janvier 2026 = lundi) */
const dayLabel = (weekday: number): string => {
  const offset = (weekday + 6) % 7;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 0, 5 + offset))
  );
};

interface ClubScheduleModalProps {
  coaches: ClubCoach[];
  /** Séances du club (toutes) : dates occupées et séances prévues à supprimer */
  sessions: ClubSession[];
  /** Date du jour (AAAA-MM-JJ) : début de période par défaut */
  today: string;
  /** Nombre de séances par défaut pour un nouveau cours (poste) */
  stripCount: number;
  onClose: () => void;
  onGenerate: (data: ClubSessionInput, options: ClubScheduleOptions) => void;
  onClosePeriod: (periods: ClubDateRange[], count: number) => void;
}

export const ClubScheduleModal: React.FC<ClubScheduleModalProps> = ({
  coaches,
  sessions,
  today,
  stripCount,
  onClose,
  onGenerate,
  onClosePeriod,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('generate');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [periods, setPeriods] = useState<ClubDateRange[]>(() => [
    { from: today, until: addDays(today, 90) },
  ]);
  const [label, setLabel] = useState('');
  const [range, setRange] = useState<AgeRange>({});
  const [coachIds, setCoachIds] = useState<string[]>([]);

  const valid = periods.every(p => p.from <= p.until);
  const toggleDay = (d: number) =>
    setWeekdays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  const setPeriod = (i: number, patch: Partial<ClubDateRange>) =>
    setPeriods(prev => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const removePeriod = (i: number) => setPeriods(prev => prev.filter((_, j) => j !== i));
  const addPeriod = () =>
    setPeriods(prev => {
      const last = prev[prev.length - 1];
      const from = last ? addDays(last.until, 1) : today;
      return [...prev, { from, until: addDays(from, 30) }];
    });

  const preview = useMemo(() => {
    if (!valid) return { dates: 0, skipped: 0, tooLong: false, tooMany: false };
    const dateSet = new Set<string>();
    for (const p of periods)
      for (const d of weekdayDates(p.from, p.until, weekdays)) dateSet.add(d);
    const all = [...dateSet];
    const taken = new Set(
      sessions
        .filter(s => periods.some(p => s.date >= p.from && s.date <= p.until))
        .map(s => s.date)
    );
    const dates = all.filter(d => !taken.has(d)).length;
    const tooLong = periods.some(p => {
      const span = Math.round((Date.parse(p.until) - Date.parse(p.from)) / 86_400_000) + 1;
      return span > MAX_SCHEDULE_DAYS;
    });
    return {
      dates,
      skipped: all.length - dates,
      tooLong,
      tooMany: periods.length > MAX_SCHEDULE_PERIODS || dates > MAX_SCHEDULE_DATES,
    };
  }, [periods, weekdays, sessions, valid]);

  const planned = useMemo(
    () =>
      sessions.filter(
        s => s.status === 'planned' && periods.some(p => s.date >= p.from && s.date <= p.until)
      ).length,
    [sessions, periods]
  );

  const canGenerate =
    mode === 'generate' &&
    valid &&
    weekdays.length > 0 &&
    preview.dates > 0 &&
    !preview.tooLong &&
    !preview.tooMany;
  const canClose = mode === 'close' && valid && planned > 0;

  const submit = () => {
    if (mode === 'generate') {
      onGenerate(
        {
          date: periods[0].from,
          label: label.trim() || undefined,
          coachIds,
          stripCount,
          ageFrom: range.ageFrom ?? null,
          ageTo: range.ageTo ?? null,
        },
        { weekdays, periods }
      );
    } else {
      onClosePeriod(periods, planned);
    }
  };

  return (
    <Modal
      title={t('clubSchedule.title')}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant={mode === 'close' ? 'danger' : 'primary'}
            disabled={mode === 'generate' ? !canGenerate : !canClose}
            onClick={submit}
          >
            {mode === 'generate' ? t('clubSchedule.create') : t('clubSchedule.close_btn')}
          </Button>
        </>
      }
    >
      <fieldset className="club-repeat">
        <label className="club-nowrap">
          <input
            type="radio"
            name="club-schedule-mode"
            checked={mode === 'generate'}
            onChange={() => setMode('generate')}
          />{' '}
          {t('clubSchedule.mode_generate')}
        </label>{' '}
        <label className="club-nowrap">
          <input
            type="radio"
            name="club-schedule-mode"
            checked={mode === 'close'}
            onChange={() => setMode('close')}
          />{' '}
          {t('clubSchedule.mode_close')}
        </label>
      </fieldset>

      {periods.map((p, i) => (
        <div className="club-row" key={i}>
          <span className="font-medium">{t('clubSchedule.period_n', { n: i + 1 })}</span>
          <label className="form-label">
            {t('clubSchedule.from')}
            <input
              className="form-input"
              type="date"
              value={p.from}
              onChange={e => setPeriod(i, { from: e.target.value })}
            />
          </label>
          <label className="form-label">
            {t('clubSchedule.until')}
            <input
              className="form-input"
              type="date"
              value={p.until}
              onChange={e => setPeriod(i, { until: e.target.value })}
            />
          </label>
          {periods.length > 1 && (
            <Button onClick={() => removePeriod(i)}>{t('clubSchedule.remove_period')}</Button>
          )}
        </div>
      ))}
      {periods.length < MAX_SCHEDULE_PERIODS && (
        <Button onClick={addPeriod}>{t('clubSchedule.add_period')}</Button>
      )}
      {!valid && <p className="club-muted">{t('clubSchedule.period_invalid')}</p>}

      {mode === 'generate' ? (
        <>
          <fieldset className="club-repeat">
            <legend className="form-label">{t('clubSchedule.days')}</legend>
            <div className="club-row">
              {WEEK_ORDER.map(d => (
                <label key={d} className="club-nowrap">
                  <input
                    type="checkbox"
                    checked={weekdays.includes(d)}
                    onChange={() => toggleDay(d)}
                  />{' '}
                  {dayLabel(d)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="form-label">
            {t('clubSchedule.label')}
            <input
              className="form-input"
              value={label}
              placeholder={t('clubSchedule.label_ph')}
              onChange={e => setLabel(e.target.value)}
            />
          </label>
          <AgeRangeSelect value={range} onChange={setRange} />
          <ClubCoachPicker coaches={coaches} value={coachIds} onChange={setCoachIds} />
          <p className="club-muted" role="status">
            {preview.tooLong
              ? t('clubSchedule.too_long', { max: MAX_SCHEDULE_DAYS })
              : preview.tooMany
                ? t('clubSchedule.too_many', { max: MAX_SCHEDULE_PERIODS })
                : weekdays.length === 0
                  ? t('clubSchedule.choose_days')
                  : t('clubSchedule.preview', { count: preview.dates, skipped: preview.skipped })}
          </p>
        </>
      ) : (
        <p className="club-muted" role="status">
          {valid
            ? t('clubSchedule.close_preview', { count: planned })
            : t('clubSchedule.period_invalid')}
        </p>
      )}
    </Modal>
  );
};
