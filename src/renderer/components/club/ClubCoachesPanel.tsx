/**
 * BellePoule Modern - Mode Club : maîtres d'armes du club (encadrement des séances).
 * Ajout, fiche (fonction, contact, armes enseignées), archivage, suppression.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ClubCoach, ClubCoachInput } from '../../../shared/types/club';
import type { Weapon } from '../../../shared/types';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { CLUB_WEAPONS } from './ClubWeaponSelect';
import { coachName } from './ClubCoachPicker';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const EMPTY_DRAFT = { firstName: '', lastName: '', title: '' };

/** Fiche d'un maître d'armes */
const CoachEditor: React.FC<{
  coach: ClubCoach;
  onSave: (data: Partial<ClubCoachInput>) => void;
  onClose: () => void;
}> = ({ coach, onSave, onClose }) => {
  const { t } = useTranslation();
  const [d, setD] = useState({
    firstName: coach.firstName,
    lastName: coach.lastName,
    title: coach.title ?? '',
    phone: coach.phone ?? '',
    email: coach.email ?? '',
    notes: coach.notes ?? '',
  });
  const [weapons, setWeapons] = useState<Weapon[]>(coach.weapons);
  const field = (key: keyof typeof d, label: string, type = 'text') => (
    <label className="form-label club-grow">
      {label}
      <input
        className="form-input"
        type={type}
        value={d[key]}
        maxLength={key === 'email' ? 120 : 100}
        onChange={e => setD(cur => ({ ...cur, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <Modal
      title={t('clubCoach.edit_title', { name: coachName(coach) })}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!d.firstName.trim() && !d.lastName.trim()}
            onClick={() => onSave({ ...d, weapons })}
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="club-row">
        {field('firstName', t('club.first_name'))}
        {field('lastName', t('club.last_name'))}
      </div>
      {field('title', t('clubCoach.title_label'))}
      <div className="club-row">
        {field('phone', t('clubCoach.phone'), 'tel')}
        {field('email', t('clubCoach.email'), 'email')}
      </div>
      <fieldset className="club-coach-picker">
        <legend className="form-label">{t('clubCoach.weapons')}</legend>
        <div className="club-coach-weapons">
          {CLUB_WEAPONS.map(w => (
            <label key={w} className="club-nowrap">
              <input
                type="checkbox"
                checked={weapons.includes(w)}
                onChange={e =>
                  setWeapons(cur => (e.target.checked ? [...cur, w] : cur.filter(x => x !== w)))
                }
              />{' '}
              {weaponLabel(w, t)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="form-label">
        {t('clubCoach.notes')}
        <textarea
          className="form-input club-textarea"
          rows={3}
          value={d.notes}
          onChange={e => setD(cur => ({ ...cur, notes: e.target.value }))}
        />
      </label>
    </Modal>
  );
};

export const ClubCoachesPanel: React.FC<{ clubId: string }> = ({ clubId }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editing, setEditing] = useState<ClubCoach | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setCoaches(await api.listCoaches(clubId, true));
  }, [api, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast(errText(e), 'error');
    }
    await load();
  };

  if (!api) return null;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.firstName.trim() && !draft.lastName.trim()) return;
    void run(async () => {
      await api.createCoach(clubId, draft);
      setDraft(EMPTY_DRAFT);
    });
  };

  const remove = async (c: ClubCoach) => {
    const ok = await confirm({
      message: t('clubCoach.delete_confirm', { name: coachName(c) }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteCoach(c.id));
  };

  const shown = coaches.filter(c => showArchived || c.active);

  return (
    <div className="club-members">
      <section className="club-card" aria-labelledby="club-coaches-title">
        <h2 id="club-coaches-title" className="club-card-title">
          {t('clubCoach.title')}
        </h2>
        <p className="club-muted">{t('clubCoach.intro')}</p>

        <form className="club-row club-row--end" onSubmit={add}>
          <label className="form-label">
            {t('club.first_name')}
            <input
              className="form-input"
              value={draft.firstName}
              maxLength={100}
              onChange={e => setDraft(d => ({ ...d, firstName: e.target.value }))}
            />
          </label>
          <label className="form-label">
            {t('club.last_name')}
            <input
              className="form-input"
              value={draft.lastName}
              maxLength={100}
              onChange={e => setDraft(d => ({ ...d, lastName: e.target.value }))}
            />
          </label>
          <label className="form-label">
            {t('clubCoach.title_label')}
            <input
              className="form-input"
              value={draft.title}
              maxLength={100}
              placeholder={t('clubCoach.title_ph')}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            />
          </label>
          <Button type="submit" variant="success" icon={<Plus size={15} aria-hidden="true" />}>
            {t('actions.add')}
          </Button>
        </form>

        <label className="club-nowrap">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />{' '}
          {t('club.show_archived')}
        </label>

        {shown.length === 0 ? (
          <EmptyState title={t('clubCoach.none')} description={t('clubCoach.none_desc')} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('fencerList.col_last_name')}</th>
                <th scope="col">{t('fencerList.col_first_name')}</th>
                <th scope="col">{t('clubCoach.title_label')}</th>
                <th scope="col">{t('clubCoach.weapons')}</th>
                <th scope="col">{t('clubCoach.contact')}</th>
                <th scope="col">
                  <span className="sr-only">{t('club.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id} className={c.active ? undefined : 'club-row-archived'}>
                  <td className="font-medium">{c.lastName}</td>
                  <td>{c.firstName}</td>
                  <td className="text-sm">{c.title || '-'}</td>
                  <td className="text-sm text-muted">
                    {c.weapons.length
                      ? c.weapons.map(w => weaponLabel(w, t)).join(', ')
                      : t('clubCoach.all_weapons')}
                  </td>
                  <td className="text-sm text-muted">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || '-'}
                  </td>
                  <td className="club-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil size={14} aria-hidden="true" />}
                      aria-label={t('clubCoach.edit')}
                      title={t('clubCoach.edit')}
                      onClick={() => setEditing(c)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={
                        c.active ? (
                          <Archive size={14} aria-hidden="true" />
                        ) : (
                          <ArchiveRestore size={14} aria-hidden="true" />
                        )
                      }
                      aria-label={c.active ? t('club.archive') : t('club.unarchive')}
                      title={c.active ? t('club.archive') : t('club.unarchive')}
                      onClick={() => void run(() => api.updateCoach(c.id, { active: !c.active }))}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      aria-label={t('actions.delete')}
                      title={t('actions.delete')}
                      onClick={() => void remove(c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editing && (
        <CoachEditor
          coach={editing}
          onClose={() => setEditing(null)}
          onSave={data => {
            const id = editing.id;
            setEditing(null);
            void run(() => api.updateCoach(id, data));
          }}
        />
      )}
    </div>
  );
};
