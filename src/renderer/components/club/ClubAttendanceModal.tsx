/**
 * BellePoule Modern - Mode Club (#1872) : pointage des présents d'une séance.
 * Membres des catégories d'âge du cours (plage début → fin, modifiable), cases à cocher.
 * Licensed under GPL-3.0
 */
import React, { useMemo, useState } from 'react';
import type { ClubMember, ClubSession } from '../../../shared/types/club';
import {
  compareByAgeCategory,
  inAgeRange,
  memberAgeCategory,
  type AgeRange,
} from '../../../shared/utils/clubAge';
import { categoryLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { AgeRangeSelect } from './ClubAgeRange';

interface ClubAttendanceModalProps {
  session: ClubSession;
  members: readonly ClubMember[];
  /** Pointe / dépointe un membre */
  onToggle: (memberId: string, present: boolean) => void;
  /** Plage choisie retenue pour la séance */
  onRangeChange: (r: AgeRange) => void;
  onClose: () => void;
}

export const ClubAttendanceModal: React.FC<ClubAttendanceModalProps> = ({
  session,
  members,
  onToggle,
  onRangeChange,
  onClose,
}) => {
  const { t } = useTranslation();
  const [range, setRange] = useState<AgeRange>({ ageFrom: session.ageFrom, ageTo: session.ageTo });
  const [search, setSearch] = useState('');
  const present = new Set(session.attendeeIds);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cat = new Map(members.map(m => [m.id, memberAgeCategory(m)]));
    return members
      .filter(
        m =>
          // Déjà pointé : toujours visible, même hors de la plage
          (present.has(m.id) || inAgeRange(cat.get(m.id), range)) &&
          (!q || `${m.lastName} ${m.firstName}`.toLowerCase().includes(q))
      )
      .sort(compareByAgeCategory(m => cat.get(m.id)))
      .map(m => ({ m, cat: cat.get(m.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, range, search, session.attendeeIds]);

  const changeRange = (r: AgeRange) => {
    setRange(r);
    onRangeChange(r);
  };

  const absent = rows.filter(r => !present.has(r.m.id));

  return (
    <Modal
      title={t('clubAttendance.title', { count: present.size })}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('actions.close')}
        </Button>
      }
    >
      <div className="club-row">
        <AgeRangeSelect value={range} onChange={changeRange} />
        <input
          className="form-input club-grow"
          type="search"
          value={search}
          placeholder={t('club.search')}
          aria-label={t('club.search')}
          onChange={e => setSearch(e.target.value)}
        />
        <Button
          size="sm"
          disabled={absent.length === 0}
          onClick={() => absent.forEach(r => onToggle(r.m.id, true))}
        >
          {t('clubAttendance.check_all')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="club-muted">{t('clubAttendance.none')}</p>
      ) : (
        <ul className="club-attendance-list">
          {rows.map(({ m, cat }) => (
            <li key={m.id}>
              <label className="club-attendance-row">
                <input
                  type="checkbox"
                  checked={present.has(m.id)}
                  onChange={e => onToggle(m.id, e.target.checked)}
                />
                <span className="club-grow">
                  {m.lastName} {m.firstName}
                </span>
                <span className="club-muted">{cat ? categoryLabel(cat, t) : '-'}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
