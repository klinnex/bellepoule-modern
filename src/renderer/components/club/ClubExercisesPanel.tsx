/**
 * BellePoule Modern - Mode Club (#1872) : bibliothèque d'exercices (échauffements,
 * technique, tactique…) réutilisable dans les plans de séance ; partagée entre clubs,
 * exportable / importable (fichier JSON) pour l'échange entre utilisateurs.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import type { ClubExercise, ClubExerciseCategory } from '../../../shared/types/club';
import { EXERCISE_CATEGORIES, formatMinutes } from '../../../shared/utils/clubPlan';
import {
  ClubShareError,
  buildExercisesFile,
  parseExercisesFile,
  shareFileName,
} from '../../../shared/utils/clubShare';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { ClubExerciseEditor } from './ClubExerciseEditor';
import { openTextFile, saveTextFile } from './clubFiles';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const ClubExercisesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;
  const [list, setList] = useState<ClubExercise[]>([]);
  const [category, setCategory] = useState<ClubExerciseCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ exercise: ClubExercise | null } | null>(null);

  const load = useCallback(async () => {
    if (api) setList(await api.listExercises());
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(
      e =>
        (category === 'all' || e.category === category) &&
        (!q || `${e.title} ${e.details ?? ''}`.toLowerCase().includes(q))
    );
  }, [list, category, search]);

  if (!api) return null;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast(errText(e), 'error');
    }
    await load();
  };

  const exportVisible = async () => {
    if (visible.length === 0) return;
    const label = category === 'all' ? '' : t(`clubExercises.cat_${category}`);
    try {
      if (
        await saveTextFile(
          shareFileName('exercises', label),
          buildExercisesFile(visible),
          t('clubExercises.export')
        )
      ) {
        showToast(t('clubExercises.exported', { count: visible.length }), 'success');
      }
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const importFile = async () => {
    try {
      const text = await openTextFile(t('clubExercises.import'));
      if (text === null) return;
      const r = await api.importExercises(parseExercisesFile(text));
      showToast(t('clubExercises.imported', { ...r }), 'success');
      await load();
    } catch (e) {
      showToast(e instanceof ClubShareError ? t(`clubShare.error_${e.code}`) : errText(e), 'error');
    }
  };

  const remove = async (e: ClubExercise) => {
    const ok = await confirm({
      message: t('clubExercises.delete_confirm', { title: e.title }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteExercise(e.id));
  };

  return (
    <div className="club-members">
      <section className="club-card" aria-labelledby="club-exercises-title">
        <div className="club-row club-row--between">
          <h2 id="club-exercises-title" className="club-card-title">
            {t('clubExercises.title', { count: list.length })}
          </h2>
          <Button icon={<Upload size={15} aria-hidden="true" />} onClick={() => void importFile()}>
            {t('clubExercises.import')}
          </Button>
          <Button
            icon={<Download size={15} aria-hidden="true" />}
            disabled={visible.length === 0}
            onClick={() => void exportVisible()}
          >
            {t('clubExercises.export')}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            onClick={() => setEditing({ exercise: null })}
          >
            {t('clubExercises.add')}
          </Button>
        </div>
        <p className="club-muted">{t('clubExercises.help')}</p>
        <div className="club-row">
          <label className="form-label">
            {t('clubExercises.category')}
            <select
              className="form-input"
              value={category}
              onChange={e => setCategory(e.target.value as ClubExerciseCategory | 'all')}
            >
              <option value="all">{t('clubExercises.cat_all')}</option>
              {EXERCISE_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {t(`clubExercises.cat_${c}`)}
                </option>
              ))}
            </select>
          </label>
          <input
            className="form-input club-grow"
            type="search"
            value={search}
            placeholder={t('club.search')}
            aria-label={t('club.search')}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {visible.length === 0 ? (
          <EmptyState
            title={t('clubExercises.empty')}
            description={t('clubExercises.empty_desc')}
          />
        ) : (
          <ul className="club-exercise-list">
            {visible.map(e => (
              <li key={e.id} className="club-exercise-item">
                <div className="club-grow">
                  <span className="font-medium">{e.title}</span>{' '}
                  <span className="badge">{t(`clubExercises.cat_${e.category}`)}</span>{' '}
                  <span className="club-muted">{formatMinutes(e.minutes)}</span>
                  {e.details && <p className="club-plan-details">{e.details}</p>}
                  {e.images.length > 0 && (
                    <div className="club-images">
                      {e.images.map((src, i) => (
                        <img key={i} className="club-exercise-thumb" src={src} alt="" />
                      ))}
                    </div>
                  )}
                </div>
                <span className="club-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={14} aria-hidden="true" />}
                    aria-label={t('actions.edit')}
                    title={t('actions.edit')}
                    onClick={() => setEditing({ exercise: e })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={14} aria-hidden="true" />}
                    aria-label={t('actions.delete')}
                    title={t('actions.delete')}
                    onClick={() => void remove(e)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && (
        <ClubExerciseEditor
          exercise={editing.exercise}
          defaultCategory={category === 'all' ? 'warmup' : category}
          onClose={() => setEditing(null)}
          onSave={data => {
            const target = editing.exercise;
            setEditing(null);
            void run(() =>
              target ? api.updateExercise(target.id, data) : api.createExercise(data)
            );
          }}
        />
      )}
    </div>
  );
};
