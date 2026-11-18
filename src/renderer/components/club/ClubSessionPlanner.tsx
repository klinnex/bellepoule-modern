/**
 * BellePoule Modern - Mode Club (#1872) : préparation d'une séance de cours.
 * Date, intitulé, objectifs, plan (exercices avec durée et consignes), notes.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  GripVertical,
  Library,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ClubCoach,
  ClubExercise,
  ClubPlanItem,
  ClubRecurrence,
  ClubSession,
  ClubSessionInput,
} from '../../../shared/types/club';
import {
  MAX_SERIES_OCCURRENCES,
  recurrenceDates,
  type AgeRange,
} from '../../../shared/utils/clubAge';
import { AgeRangeSelect } from './ClubAgeRange';
import { ClubCoachPicker } from './ClubCoachPicker';
import { formatMinutes, planDuration } from '../../../shared/utils/clubPlan';
import { useTranslation } from '../../hooks/useTranslation';
import { ToggleChip } from '../common/ToggleChip';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ClubWeaponSelect } from './ClubWeaponSelect';
import { ClubImagesField } from './ClubImagesField';
import { ClubExercisePicker } from './ClubExercisePicker';
import { CategorySelect } from './ClubExerciseEditor';
import { useToast } from '../Toast';
import { MiniCalendar, type DayMark } from './MiniCalendar';
import type { Weapon } from '../../../shared/types';

interface ClubSessionPlannerProps {
  /** Séance à modifier ; absente = nouvelle séance préparée */
  session?: ClubSession | null;
  /** Nouvelle séance pré-remplie (plan importé d'un fichier partagé) */
  prefill?: Omit<ClubSessionInput, 'date'> | null;
  defaultDate: string;
  defaultWeapon?: Weapon;
  /** Jours déjà occupés par une séance (marqués dans le calendrier) */
  marks?: Readonly<Record<string, DayMark>>;
  /** Séances de la même série (suivi des exercices d'une semaine à l'autre) */
  series?: readonly ClubSession[];
  /** Maîtres d'armes du club (encadrement de la séance) */
  coaches?: readonly ClubCoach[];
  /** recurrence : nouvelle séance répétée (série) */
  onSave: (data: ClubSessionInput, recurrence?: ClubRecurrence) => void;
  onClose: () => void;
}

let seq = 0;
const newItem = (): ClubPlanItem => ({
  id: `n${Date.now().toString(36)}${seq++}`,
  title: '',
  minutes: 10,
});

export const ClubSessionPlanner: React.FC<ClubSessionPlannerProps> = ({
  session,
  prefill,
  defaultDate,
  defaultWeapon,
  marks,
  series = [],
  coaches = [],
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [date, setDate] = useState(session?.date ?? defaultDate);
  const src = session ?? prefill ?? null;
  const [label, setLabel] = useState(src?.label ?? '');
  const [weapon, setWeapon] = useState<Weapon | undefined>(src?.weapon ?? defaultWeapon);
  const [startTime, setStartTime] = useState(src?.startTime ?? '');
  const [objectives, setObjectives] = useState(src?.objectives ?? '');
  const [notes, setNotes] = useState(src?.notes ?? '');
  const [plan, setPlan] = useState<ClubPlanItem[]>(src?.plan?.length ? src.plan : [newItem()]);
  // Glisser-déposer des exercices : index de départ et de survol
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [coachIds, setCoachIds] = useState<string[]>(session?.coachIds ?? []);
  const [range, setRange] = useState<AgeRange>({
    ageFrom: src?.ageFrom ?? undefined,
    ageTo: src?.ageTo ?? undefined,
  });
  // Répétition (nouvelle séance seulement) : tous les N jours, N fois ou jusqu'à une date
  const [repeat, setRepeat] = useState(false);
  const [everyDays, setEveryDays] = useState(7);
  const [repeatEnd, setRepeatEnd] = useState<'count' | 'until'>('count');
  const [count, setCount] = useState(10);
  const [until, setUntil] = useState('');
  const recurrence: ClubRecurrence | undefined =
    repeat && !session
      ? repeatEnd === 'count'
        ? { everyDays, count }
        : { everyDays, until }
      : undefined;
  const occurrences =
    recurrence && (repeatEnd === 'count' || until)
      ? recurrenceDates(date, everyDays, recurrence)
      : [];
  /** Autres séances de la série, de la plus récente à la plus ancienne */
  const history = series
    .filter(x => x.id !== session?.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const { showToast } = useToast();

  /** Exercices de la bibliothèque ajoutés au plan (ligne vide initiale remplacée) */
  const addFromLibrary = (list: ClubExercise[]) => {
    setPicker(false);
    const items = list.map(e => ({
      ...newItem(),
      title: e.title,
      minutes: e.minutes,
      category: e.category,
      ...(e.details ? { details: e.details } : {}),
      ...(e.images.length ? { images: [...e.images] } : {}),
    }));
    setPlan(cur => [...cur.filter(it => it.title.trim()), ...items]);
  };

  const saveToLibrary = async (it: ClubPlanItem) => {
    try {
      await window.electronAPI?.club?.createExercise({
        title: it.title,
        category: it.category ?? 'other',
        minutes: it.minutes,
        details: it.details,
        images: it.images ?? [],
      });
      showToast(t('clubExercises.saved_to_library', { title: it.title }), 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const patch = (i: number, p: Partial<ClubPlanItem>) =>
    setPlan(list => list.map((it, j) => (j === i ? { ...it, ...p } : it)));
  /** Déplace l'exercice `from` à la position `to` (décalage des autres) */
  const reorder = (from: number, to: number) =>
    setPlan(list => {
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
        return list;
      }
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  const move = (i: number, d: -1 | 1) => reorder(i, i + d);
  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const total = planDuration(plan.filter(it => it.title.trim()));

  return (
    <Modal
      title={session ? t('clubPlan.edit_title') : t('clubPlan.new_title')}
      onClose={onClose}
      size="xl"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!date || (!!recurrence && occurrences.length === 0)}
            onClick={() =>
              onSave(
                {
                  date,
                  label,
                  weapon,
                  objectives,
                  notes,
                  ageFrom: range.ageFrom ?? null,
                  ageTo: range.ageTo ?? null,
                  coachIds,
                  plan: plan.filter(it => it.title.trim()),
                  startTime: startTime || null,
                },
                recurrence
              )
            }
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="club-open-form">
        <div className="form-label">
          <MiniCalendar
            value={date}
            today={defaultDate}
            marks={marks}
            label={t('clubPlan.date')}
            onChange={setDate}
          />
        </div>
        <div className="club-open-fields">
          <div className="club-row">
            <ClubWeaponSelect value={weapon} onChange={setWeapon} />
            <div className="form-label">
              <label>
                {t('clubSession.start_time')}
                <input
                  className="form-input club-time-input"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </label>
              {startTime && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={14} aria-hidden="true" />}
                  aria-label={t('clubSession.start_time_clear')}
                  title={t('clubSession.start_time_clear')}
                  onClick={() => setStartTime('')}
                />
              )}
            </div>
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
          </div>
          {!session && (
            <fieldset className="club-repeat">
              <div className="club-row">
                <ToggleChip pressed={repeat} onToggle={setRepeat}>
                  <Repeat size={14} aria-hidden="true" /> {t('clubPlan.repeat')}
                </ToggleChip>
              </div>
              {repeat && (
                <div className="club-row">
                  <label className="form-label">
                    {t('clubPlan.every_days')}
                    <input
                      className="form-input club-score-input"
                      type="number"
                      min={1}
                      max={365}
                      value={everyDays}
                      onChange={e => setEveryDays(Number(e.target.value))}
                    />
                  </label>
                  <label className="form-label">
                    {t('clubPlan.repeat_end')}
                    <select
                      className="form-input"
                      value={repeatEnd}
                      onChange={e => setRepeatEnd(e.target.value as 'count' | 'until')}
                    >
                      <option value="count">{t('clubPlan.repeat_count')}</option>
                      <option value="until">{t('clubPlan.repeat_until')}</option>
                    </select>
                  </label>
                  {repeatEnd === 'count' ? (
                    <label className="form-label">
                      {t('clubPlan.occurrences')}
                      <input
                        className="form-input club-score-input"
                        type="number"
                        min={1}
                        max={MAX_SERIES_OCCURRENCES}
                        value={count}
                        onChange={e => setCount(Number(e.target.value))}
                      />
                    </label>
                  ) : (
                    <label className="form-label">
                      {t('clubPlan.until_date')}
                      <input
                        className="form-input"
                        type="date"
                        min={date}
                        value={until}
                        onChange={e => setUntil(e.target.value)}
                      />
                    </label>
                  )}
                  <span className="club-muted">
                    {occurrences.length > 0
                      ? t('clubPlan.repeat_summary', {
                          count: occurrences.length,
                          last: occurrences[occurrences.length - 1],
                        })
                      : t('clubPlan.repeat_none')}
                  </span>
                </div>
              )}
            </fieldset>
          )}
        </div>
      </div>
      <AgeRangeSelect value={range} onChange={setRange} />
      <ClubCoachPicker coaches={coaches} value={coachIds} onChange={setCoachIds} />
      {history.length > 0 && (
        <details className="club-series-history">
          <summary>{t('clubPlan.series_history', { count: history.length })}</summary>
          <ul>
            {history.slice(0, 12).map(x => (
              <li key={x.id}>
                <span className="font-medium">{x.date}</span>{' '}
                <span className="club-muted">
                  {x.plan.length === 0
                    ? t('clubPlan.series_empty')
                    : x.plan.map(it => `${it.title} (${formatMinutes(it.minutes)})`).join(' · ')}
                </span>
                {x.notes ? <span className="club-plan-details">{x.notes}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="form-label">
        {t('clubPlan.objectives')}
        <textarea
          className="form-input club-textarea"
          rows={2}
          value={objectives}
          placeholder={t('clubPlan.objectives_ph')}
          onChange={e => setObjectives(e.target.value)}
        />
      </label>

      <div className="club-row club-row--between">
        <h3 className="club-card-title">{t('clubPlan.plan')}</h3>
        <span className="club-muted">
          {t('clubPlan.total', { duration: formatMinutes(total) })}
        </span>
      </div>
      <p className="club-muted">{t('clubPlan.drag_hint')}</p>
      <ol className="club-plan-edit">
        {plan.map((it, i) => (
          <li
            key={it.id}
            className={`club-plan-edit-item${dragOver === i && dragFrom !== null && dragFrom !== i ? ' club-plan-edit-item--drop' : ''}`}
            draggable={dragFrom === i}
            onDragOver={e => {
              if (dragFrom === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOver(i);
            }}
            onDrop={e => {
              if (dragFrom === null) return;
              e.preventDefault();
              reorder(dragFrom, i);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <div className="club-row">
              <span
                className="club-drag-handle"
                role="button"
                tabIndex={-1}
                aria-label={t('clubPlan.drag_n', { n: i + 1 })}
                title={t('clubPlan.drag_n', { n: i + 1 })}
                onMouseDown={() => setDragFrom(i)}
                onMouseUp={() => setDragFrom(null)}
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', it.id);
                }}
              >
                <GripVertical size={16} aria-hidden="true" />
              </span>
              <label className="form-label club-grow">
                {t('clubPlan.exercise_n', { n: i + 1 })}
                <input
                  className="form-input"
                  value={it.title}
                  maxLength={120}
                  placeholder={t('clubPlan.exercise_ph')}
                  onChange={e => patch(i, { title: e.target.value })}
                />
              </label>
              <label className="form-label">
                {t('clubPlan.minutes')}
                <input
                  className="form-input club-score-input"
                  type="number"
                  min={0}
                  max={600}
                  value={it.minutes}
                  onChange={e => patch(i, { minutes: Number(e.target.value) })}
                />
              </label>
              <CategorySelect
                value={it.category ?? 'other'}
                onChange={c => patch(i, { category: c })}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowUp size={14} aria-hidden="true" />}
                aria-label={t('clubPlan.move_up')}
                title={t('clubPlan.move_up')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowDown size={14} aria-hidden="true" />}
                aria-label={t('clubPlan.move_down')}
                title={t('clubPlan.move_down')}
                disabled={i === plan.length - 1}
                onClick={() => move(i, 1)}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} aria-hidden="true" />}
                aria-label={t('clubPlan.remove', { n: i + 1 })}
                title={t('clubPlan.remove', { n: i + 1 })}
                onClick={() => setPlan(list => list.filter((_, j) => j !== i))}
              />
            </div>
            <textarea
              className="form-input club-textarea"
              rows={2}
              value={it.details ?? ''}
              placeholder={t('clubPlan.details_ph')}
              aria-label={t('clubPlan.details_n', { n: i + 1 })}
              onChange={e => patch(i, { details: e.target.value })}
            />
            <div className="club-row club-row--between">
              <ClubImagesField
                images={it.images ?? []}
                onChange={images => patch(i, { images })}
                label={t('clubImages.label_n', { n: i + 1 })}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<BookmarkPlus size={14} aria-hidden="true" />}
                disabled={!it.title.trim()}
                onClick={() => void saveToLibrary(it)}
              >
                {t('clubExercises.save_to_library')}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="club-row">
        <Button
          icon={<Plus size={15} aria-hidden="true" />}
          onClick={() => setPlan(list => [...list, newItem()])}
        >
          {t('clubPlan.add_exercise')}
        </Button>
        <Button
          variant="primary"
          icon={<Library size={15} aria-hidden="true" />}
          onClick={() => setPicker(true)}
        >
          {t('clubExercises.from_library')}
        </Button>
      </div>
      {picker && (
        <ClubExercisePicker
          initialCategory={plan.some(it => it.title.trim()) ? 'all' : 'warmup'}
          ageRange={range}
          onPick={addFromLibrary}
          onClose={() => setPicker(false)}
        />
      )}

      <label className="form-label club-notes-label">
        {t('clubPlan.notes')}
        <textarea
          className="form-input club-textarea"
          rows={3}
          value={notes}
          placeholder={t('clubPlan.notes_ph')}
          onChange={e => setNotes(e.target.value)}
        />
      </label>
    </Modal>
  );
};
