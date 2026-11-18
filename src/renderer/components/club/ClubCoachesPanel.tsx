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
import { ToggleChip, ToggleChipGroup } from '../common/ToggleChip';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { CLUB_WEAPONS } from './ClubWeaponSelect';
import { coachName } from './ClubCoachPicker';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Fiche d'un maître d'armes (création si `coach` est absent) */
const CoachEditor: React.FC<{
  coach?: ClubCoach;
  onSave: (data: ClubCoachInput) => void;
  onClose: () => void;
}> = ({ coach, onSave, onClose }) => {
  const { t } = useTranslation();
  const [d, setD] = useState({
    firstName: coach?.firstName ?? '',
    lastName: coach?.lastName ?? '',
    title: coach?.title ?? '',
    phone: coach?.phone ?? '',
    email: coach?.email ?? '',
    notes: coach?.notes ?? '',
  });
  const [weapons, setWeapons] = useState<Weapon[]>(coach?.weapons ?? []);
  const field = (key: keyof typeof d, label: string, type = 'text') => (
    <label className="form-label club-grow">
      {label}
      <input
        className="form-input"
        type={type}
        value={d[key]}
        maxLength={key === 'email' ? 120 : 100}
        placeholder={key === 'title' ? t('clubCoach.title_ph') : undefined}
        onChange={e => setD(cur => ({ ...cur, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <Modal
      title={
        coach ? t('clubCoach.edit_title', { name: coachName(coach) }) : t('clubCoach.new_title')
      }
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
      <ToggleChipGroup legend={t('clubCoach.weapons')}>
        {CLUB_WEAPONS.map(w => (
          <ToggleChip
            key={w}
            pressed={weapons.includes(w)}
            onToggle={on => setWeapons(cur => (on ? [...cur, w] : cur.filter(x => x !== w)))}
          >
            {weaponLabel(w, t)}
          </ToggleChip>
        ))}
      </ToggleChipGroup>
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
  const [creating, setCreating] = useState(false);
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
        <div className="club-row">
          <div className="club-title-group">
            <h2 id="club-coaches-title" className="club-card-title">
              {t('clubCoach.title')}
            </h2>
            <Button
              variant="success"
              icon={<Plus size={15} aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              {t('actions.add')}
            </Button>
          </div>
        </div>
        <p className="club-muted">{t('clubCoach.intro')}</p>

        <div className="club-row">
          <ToggleChip pressed={showArchived} onToggle={setShowArchived}>
            {t('club.show_archived')}
          </ToggleChip>
        </div>

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
      {creating && (
        <CoachEditor
          onClose={() => setCreating(false)}
          onSave={data => {
            setCreating(false);
            void run(() => api.createCoach(clubId, data));
          }}
        />
      )}
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
