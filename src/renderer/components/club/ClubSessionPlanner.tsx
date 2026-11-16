/**
 * BellePoule Modern - Mode Club (#1872) : préparation d'une séance de cours.
 * Date, intitulé, objectifs, plan (exercices avec durée et consignes), notes.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ClubPlanItem, ClubSession, ClubSessionInput } from '../../../shared/types/club';
import { formatMinutes, planDuration } from '../../../shared/utils/clubPlan';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubSessionPlannerProps {
  /** Séance à modifier ; absente = nouvelle séance préparée */
  session?: ClubSession | null;
  defaultDate: string;
  onSave: (data: ClubSessionInput) => void;
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
  defaultDate,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [date, setDate] = useState(session?.date ?? defaultDate);
  const [label, setLabel] = useState(session?.label ?? '');
  const [objectives, setObjectives] = useState(session?.objectives ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [plan, setPlan] = useState<ClubPlanItem[]>(
    session?.plan.length ? session.plan : [newItem()]
  );

  const patch = (i: number, p: Partial<ClubPlanItem>) =>
    setPlan(list => list.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const move = (i: number, d: -1 | 1) =>
    setPlan(list => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

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
            disabled={!date}
            onClick={() =>
              onSave({
                date,
                label,
                objectives,
                notes,
                plan: plan.filter(it => it.title.trim()),
              })
            }
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="club-row">
        <label className="form-label">
          {t('clubPlan.date')}
          <input
            className="form-input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>
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
      <ol className="club-plan-edit">
        {plan.map((it, i) => (
          <li key={it.id} className="club-plan-edit-item">
            <div className="club-row">
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
          </li>
        ))}
      </ol>
      <Button
        icon={<Plus size={15} aria-hidden="true" />}
        onClick={() => setPlan(list => [...list, newItem()])}
      >
        {t('clubPlan.add_exercise')}
      </Button>

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
