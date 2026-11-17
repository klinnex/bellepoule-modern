/**
 * Mode Club : séances automatiques sur jours d'ouverture, et fermetures (suppression des
 * séances prévues sur une période, ex. vacances scolaires).
 */
import React, { useMemo, useState } from 'react';
import type {
  ClubCoach,
  ClubScheduleOptions,
  ClubSession,
  ClubSessionInput,
} from '../../../shared/types/club';
import {
  addDays,
  MAX_SCHEDULE_DAYS,
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
  onClosePeriod: (from: string, until: string, count: number) => void;
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
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(() => addDays(today, 90));
  const [label, setLabel] = useState('');
  const [range, setRange] = useState<AgeRange>({});
  const [coachIds, setCoachIds] = useState<string[]>([]);

  const valid = from <= until;
  const toggleDay = (d: number) =>
    setWeekdays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));

  const preview = useMemo(() => {
    if (!valid) return { dates: 0, skipped: 0, tooLong: false };
    const all = weekdayDates(from, until, weekdays);
    const taken = new Set(sessions.filter(s => s.date >= from && s.date <= until).map(s => s.date));
    const dates = all.filter(d => !taken.has(d)).length;
    const span = Math.round((Date.parse(until) - Date.parse(from)) / 86_400_000) + 1;
    return { dates, skipped: all.length - dates, tooLong: span > MAX_SCHEDULE_DAYS };
  }, [from, until, weekdays, sessions, valid]);

  const planned = useMemo(
    () => sessions.filter(s => s.status === 'planned' && s.date >= from && s.date <= until).length,
    [sessions, from, until]
  );

  const canGenerate =
    mode === 'generate' && valid && weekdays.length > 0 && preview.dates > 0 && !preview.tooLong;
  const canClose = mode === 'close' && valid && planned > 0;

  const submit = () => {
    if (mode === 'generate') {
      onGenerate(
        {
          date: from,
          label: label.trim() || undefined,
          coachIds,
          stripCount,
          ageFrom: range.ageFrom ?? null,
          ageTo: range.ageTo ?? null,
        },
        { weekdays, from, until }
      );
    } else {
      onClosePeriod(from, until, planned);
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

      <div className="club-row">
        <label className="form-label">
          {t('clubSchedule.from')}
          <input
            className="form-input"
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubSchedule.until')}
          <input
            className="form-input"
            type="date"
            value={until}
            onChange={e => setUntil(e.target.value)}
          />
        </label>
      </div>
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
