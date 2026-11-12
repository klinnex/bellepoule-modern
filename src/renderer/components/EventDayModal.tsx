/**
 * BellePoule Modern - Journée multi-épreuves (#1714) : épreuves d'une même salle,
 * pistes de la salle, groupe d'arbitres partagé (armes, statut commun, conflits).
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2, TriangleAlert, Users } from 'lucide-react';
import { Competition, Weapon } from '../../shared/types';
import type {
  DayReferee,
  DayRefereeConflict,
  DayRefereeStatus,
  EventDay,
} from '../../shared/types/eventDay';
import { weaponLabel } from '../../shared/utils/categoryLabel';
import { dayRefereeFullName } from '../../shared/utils/eventDay';
import { useTranslation } from '../hooks/useTranslation';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import { formatAssignment } from './eventDayFormat';
import { useConfirm } from './ConfirmDialog';

const REFEREE_WEAPONS: Weapon[] = [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER];
const POLL_MS = 10_000;

const today = () => new Date().toISOString().slice(0, 10);

interface EventDayModalProps {
  competitions: Competition[];
  onClose: () => void;
}

const WeaponChecks: React.FC<{
  value: Weapon[];
  onChange: (w: Weapon[]) => void;
  idPrefix: string;
}> = ({ value, onChange, idPrefix }) => {
  const { t } = useTranslation();
  return (
    <span className="event-day-weapons">
      {REFEREE_WEAPONS.map(w => (
        <label key={w} htmlFor={`${idPrefix}-${w}`} className="event-day-nowrap">
          <input
            id={`${idPrefix}-${w}`}
            type="checkbox"
            checked={value.includes(w)}
            onChange={e => onChange(e.target.checked ? [...value, w] : value.filter(x => x !== w))}
          />{' '}
          {weaponLabel(w, t)}
        </label>
      ))}
    </span>
  );
};

export const EventDayModal: React.FC<EventDayModalProps> = ({ competitions, onClose }) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.eventDay;
  const [days, setDays] = useState<EventDay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', date: today(), stripCount: 16 });
  // Saisie en cours sur la journée sélectionnée (id = journée éditée)
  const [editDraft, setEditDraft] = useState<{
    id: string;
    name: string;
    date: string;
    stripCount: number;
  } | null>(null);
  const [referees, setReferees] = useState<DayReferee[]>([]);
  const [statuses, setStatuses] = useState<DayRefereeStatus[]>([]);
  const [conflicts, setConflicts] = useState<DayRefereeConflict[]>([]);
  const [newRef, setNewRef] = useState({
    firstName: '',
    lastName: '',
    club: '',
    weapons: [] as Weapon[],
  });
  const [message, setMessage] = useState('');

  const selected = days.find(d => d.id === selectedId) ?? null;
  const edit =
    editDraft && editDraft.id === selected?.id
      ? editDraft
      : {
          id: selected?.id ?? '',
          name: selected?.name ?? '',
          date: selected?.date ?? today(),
          stripCount: selected?.stripCount ?? 0,
        };
  const setEdit = (v: typeof edit) => setEditDraft(v);
  const selectDay = (id: string | null) => {
    setSelectedId(id);
    setMessage('');
  };

  const loadDays = useCallback(
    () =>
      api
        ?.list()
        .then(list => {
          setDays(list);
          setSelectedId(prev => prev ?? list[0]?.id ?? null);
        })
        .catch(() => undefined),
    [api]
  );

  const loadDay = useCallback(
    () =>
      api && selectedId
        ? Promise.all([api.listReferees(selectedId), api.getOverview(selectedId)])
            .then(([refs, overview]) => {
              setReferees(refs);
              setStatuses(overview.statuses);
              setConflicts(overview.conflicts);
            })
            .catch(() => undefined)
        : Promise.resolve(),
    [api, selectedId]
  );

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  // Statut commun rafraîchi périodiquement (tablettes, autres épreuves)
  useEffect(() => {
    void loadDay();
    const timer = setInterval(() => void loadDay(), POLL_MS);
    return () => clearInterval(timer);
  }, [loadDay]);

  const refName = useMemo(
    () => new Map(referees.map(r => [r.id, dayRefereeFullName(r)])),
    [referees]
  );
  const statusOf = useMemo(() => new Map(statuses.map(s => [s.dayRefereeId, s])), [statuses]);
  const dayName = useMemo(() => new Map(days.map(d => [d.id, d.name])), [days]);
  const dayOfCompetition = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of days) for (const c of d.competitionIds) m.set(c, d.id);
    return m;
  }, [days]);

  if (!api) return null;

  const createDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const day = await api.create(draft);
    setDraft({ name: '', date: today(), stripCount: 16 });
    selectDay(day.id);
    await loadDays();
  };

  const saveDay = async () => {
    if (!selected || !edit.name.trim()) return;
    const { name, date, stripCount } = edit;
    await api.update(selected.id, { name, date, stripCount });
    setEditDraft(null);
    await loadDays();
  };

  const deleteDay = async () => {
    if (!selected) return;
    const ok = await confirm({
      message: t('eventDay.delete_confirm', { name: selected.name }),
      confirmLabel: t('actions.delete'),
    });
    if (!ok) return;
    await api.delete(selected.id);
    selectDay(null);
    await loadDays();
  };

  const toggleCompetition = async (c: Competition, attach: boolean) => {
    if (!selected) return;
    const r = await api.setCompetitionDay(c.id, attach ? selected.id : null);
    if (attach) setMessage(t('eventDay.sync_done', { added: r.added, updated: r.updated }));
    await loadDays();
    await loadDay();
  };

  const addReferee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !(newRef.firstName.trim() || newRef.lastName.trim())) return;
    await api.createReferee(selected.id, newRef);
    setNewRef({ firstName: '', lastName: '', club: '', weapons: newRef.weapons });
    await loadDay();
  };

  const updateWeapons = async (ref: DayReferee, weapons: Weapon[]) => {
    setReferees(prev => prev.map(r => (r.id === ref.id ? { ...r, weapons } : r)));
    await api.updateReferee(ref.id, { weapons });
    await loadDay();
  };

  const deleteReferee = async (ref: DayReferee) => {
    const ok = await confirm({
      message: t('eventDay.referee_delete_confirm', { name: dayRefereeFullName(ref) }),
      confirmLabel: t('actions.delete'),
    });
    if (!ok) return;
    await api.deleteReferee(ref.id);
    await loadDay();
  };

  const sync = async () => {
    if (!selected) return;
    const r = await api.syncReferees(selected.id);
    setMessage(t('eventDay.sync_done', { added: r.added, updated: r.updated }));
  };

  return (
    <Modal title={t('eventDay.title')} onClose={onClose} size="xl" scroll>
      <div className="event-day">
        <aside className="event-day-aside">
          <ul className="event-day-list event-day-list--days">
            {days.length === 0 && <li className="text-muted">{t('eventDay.empty')}</li>}
            {days.map(d => (
              <li key={d.id}>
                <Button
                  type="button"
                  variant={d.id === selectedId ? 'primary' : undefined}
                  onClick={() => selectDay(d.id)}
                  className="event-day-day-btn"
                >
                  {d.name} · {d.date}
                </Button>
              </li>
            ))}
          </ul>
          <form onSubmit={createDay}>
            <h3 className="form-label">{t('eventDay.new_day')}</h3>
            <input
              className="form-input"
              aria-label={t('eventDay.name')}
              placeholder={t('eventDay.name')}
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className="form-input"
              type="date"
              aria-label={t('eventDay.date')}
              value={draft.date}
              onChange={e => setDraft({ ...draft, date: e.target.value })}
            />
            <label className="form-label">
              {t('eventDay.strips')}
              <input
                className="form-input"
                type="number"
                min={0}
                value={draft.stripCount}
                onChange={e => setDraft({ ...draft, stripCount: Number(e.target.value) })}
              />
            </label>
            <Button type="submit" variant="primary" disabled={!draft.name.trim()}>
              {t('eventDay.create')}
            </Button>
          </form>
        </aside>

        <section className="event-day-main">
          {!selected ? (
            <p className="text-muted">{t('eventDay.select_hint')}</p>
          ) : (
            <>
              <div className="event-day-row event-day-row--end">
                <label className="form-label">
                  {t('eventDay.name')}
                  <input
                    className="form-input"
                    value={edit.name}
                    onChange={e => setEdit({ ...edit, name: e.target.value })}
                  />
                </label>
                <label className="form-label">
                  {t('eventDay.date')}
                  <input
                    className="form-input"
                    type="date"
                    value={edit.date}
                    onChange={e => setEdit({ ...edit, date: e.target.value })}
                  />
                </label>
                <label className="form-label">
                  {t('eventDay.strips')}
                  <input
                    className="form-input event-day-input--sm"
                    type="number"
                    min={0}
                    value={edit.stripCount}
                    onChange={e => setEdit({ ...edit, stripCount: Number(e.target.value) })}
                  />
                </label>
                <Button type="button" variant="primary" onClick={() => void saveDay()}>
                  {t('eventDay.save')}
                </Button>
                <Button type="button" variant="danger" onClick={() => void deleteDay()}>
                  {t('actions.delete')}
                </Button>
              </div>

              <h3>{t('eventDay.competitions')}</h3>
              <p className="text-muted">{t('eventDay.competitions_hint')}</p>
              <ul className="event-day-list">
                {competitions.map(c => {
                  const owner = dayOfCompetition.get(c.id);
                  const checked = owner === selected.id;
                  return (
                    <li key={c.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => void toggleCompetition(c, e.target.checked)}
                        />{' '}
                        <strong>{c.title}</strong> · {weaponLabel(c.weapon, t)}
                        {owner && !checked && (
                          <span className="text-muted">
                            {' '}
                            ({t('eventDay.other_day', { name: dayName.get(owner) ?? '' })})
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="event-day-row">
                <h3 className="event-day-h3-inline">
                  {t('eventDay.referees')} ({referees.length})
                </h3>
                <Button
                  type="button"
                  size="sm"
                  className="btn-icon-label"
                  onClick={() => void sync()}
                  title={t('eventDay.sync_title')}
                >
                  <Icon icon={Users} />
                  {t('eventDay.sync')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void loadDay()}
                  aria-label={t('eventDay.refresh')}
                  title={t('eventDay.refresh')}
                >
                  <Icon icon={RefreshCw} />
                </Button>
              </div>
              <p className="text-muted">{t('eventDay.referees_hint')}</p>
              {message && (
                <p role="status" className="event-day-ok">
                  {message}
                </p>
              )}

              <form onSubmit={addReferee} className="event-day-row">
                <input
                  className="form-input event-day-input--md"
                  aria-label={t('eventDay.first_name')}
                  placeholder={t('eventDay.first_name')}
                  value={newRef.firstName}
                  onChange={e => setNewRef({ ...newRef, firstName: e.target.value })}
                />
                <input
                  className="form-input event-day-input--md"
                  aria-label={t('eventDay.last_name')}
                  placeholder={t('eventDay.last_name')}
                  value={newRef.lastName}
                  onChange={e => setNewRef({ ...newRef, lastName: e.target.value })}
                />
                <input
                  className="form-input event-day-input--md"
                  aria-label={t('eventDay.club')}
                  placeholder={t('eventDay.club')}
                  value={newRef.club}
                  onChange={e => setNewRef({ ...newRef, club: e.target.value })}
                />
                <WeaponChecks
                  idPrefix="new-ref"
                  value={newRef.weapons}
                  onChange={weapons => setNewRef({ ...newRef, weapons })}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!(newRef.firstName.trim() || newRef.lastName.trim())}
                >
                  {t('eventDay.add_referee')}
                </Button>
              </form>

              <table className="table event-day-table">
                <thead>
                  <tr>
                    <th>{t('eventDay.referee')}</th>
                    <th>{t('eventDay.club')}</th>
                    <th>{t('eventDay.weapons')}</th>
                    <th>{t('eventDay.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {referees.map(r => {
                    const st = statusOf.get(r.id);
                    return (
                      <tr key={r.id}>
                        <td>{dayRefereeFullName(r)}</td>
                        <td>{r.club ?? '—'}</td>
                        <td>
                          <WeaponChecks
                            idPrefix={`ref-${r.id}`}
                            value={r.weapons}
                            onChange={w => void updateWeapons(r, w)}
                          />
                          {r.weapons.length === 0 && (
                            <span className="text-muted"> ({t('eventDay.weapons_all')})</span>
                          )}
                        </td>
                        <td>
                          {st && st.state === 'busy' ? (
                            <span className="event-day-busy">
                              {st.assignments.map(a => formatAssignment(a, t)).join(' ; ')}
                            </span>
                          ) : (
                            <span className="event-day-free">{t('eventDay.free')}</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="is-54fefa"
                            aria-label={t('actions.delete')}
                            title={t('actions.delete')}
                            onClick={() => void deleteReferee(r)}
                          >
                            <Icon icon={Trash2} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <h3>{t('eventDay.conflicts')}</h3>
              {conflicts.length === 0 ? (
                <p className="text-muted">{t('eventDay.no_conflicts')}</p>
              ) : (
                <ul>
                  {conflicts.map(c => (
                    <li key={`${c.dayRefereeId}-${c.kind}`} className="event-day-conflict">
                      <Icon icon={TriangleAlert} />{' '}
                      {t(`eventDay.conflict_${c.kind}`, {
                        name: refName.get(c.dayRefereeId) ?? '?',
                      })}{' '}
                      — {c.assignments.map(a => formatAssignment(a, t)).join(' ; ')}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default EventDayModal;
