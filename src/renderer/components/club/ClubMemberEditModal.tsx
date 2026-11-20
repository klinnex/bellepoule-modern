/**
 * BellePoule Modern - Mode Club (#1872) : fiche d'un membre, en création (« Nouveau membre »)
 * ou en correction (nom, prénom, licence, date de naissance, latéralité, catégorie d'âge).
 * Présences, combats et code carte sont conservés à la modification.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import type { ClubMember, ClubMemberInput } from '../../../shared/types/club';
import {
  AGE_CATEGORIES,
  memberAgeCategory,
  normalizeAgeCategory,
} from '../../../shared/utils/clubAge';
import { categoryLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubMemberEditModalProps {
  /** Membre à corriger ; absent = création */
  member?: ClubMember | null;
  /** Enregistre les champs modifiés ; lève une exception en cas d'échec (affichée ici) */
  onSave?: (id: string, data: Partial<ClubMemberInput>) => Promise<void>;
  /** Crée le membre ; lève une exception en cas d'échec (affichée ici) */
  onCreate?: (data: ClubMemberInput) => Promise<void>;
  onClose: () => void;
}

export const ClubMemberEditModal: React.FC<ClubMemberEditModalProps> = ({
  member,
  onSave,
  onCreate,
  onClose,
}) => {
  const { t } = useTranslation();
  const [lastName, setLastName] = useState(member?.lastName ?? '');
  const [firstName, setFirstName] = useState(member?.firstName ?? '');
  const [license, setLicense] = useState(member?.license ?? '');
  const [birthDate, setBirthDate] = useState(member?.birthDate ?? '');
  const [laterality, setLaterality] = useState<string>(member?.laterality ?? '');
  const [category, setCategory] = useState<string>(member?.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !saving && (lastName.trim() !== '' || firstName.trim() !== '');
  /** Catégorie calculée à partir de la date de naissance, sinon choisie à la main */
  const computedCategory = birthDate
    ? memberAgeCategory({ birthDate })
    : normalizeAgeCategory(category);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const data: ClubMemberInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        license: license.trim() || undefined,
        laterality: laterality === 'R' || laterality === 'L' ? laterality : undefined,
      };
      if (birthDate) data.birthDate = birthDate;
      else if (computedCategory) data.category = computedCategory;
      if (member && onSave) await onSave(member.id, data);
      else if (onCreate) await onCreate(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        member
          ? `${t('actions.edit')} : ${member.firstName} ${member.lastName}`
          : t('club.new_member')
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {member ? t('actions.save') : t('actions.add')}
          </Button>
        </>
      }
    >
      <form
        className="club-member-edit"
        onSubmit={e => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="form-label">
          {t('fencerList.col_last_name')}
          <input
            className="form-input"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="form-label">
          {t('fencerList.col_first_name')}
          <input
            className="form-input"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('fencer.license')}
          <input
            className="form-input"
            value={license}
            onChange={e => setLicense(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('fencerList.col_birth')}
          <input
            className="form-input"
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setBirthDate(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('addFencer.handedness')}
          <select
            className="form-input"
            value={laterality}
            onChange={e => setLaterality(e.target.value)}
          >
            <option value="">—</option>
            <option value="R">{t('addFencer.right')}</option>
            <option value="L">{t('addFencer.left')}</option>
          </select>
        </label>
        {birthDate ? (
          <p className="text-sm club-muted">
            {t('clubAge.category')} : {computedCategory ? categoryLabel(computedCategory, t) : '—'}
          </p>
        ) : (
          <label className="form-label">
            {t('clubAge.category')}
            <select
              className="form-input"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">—</option>
              {AGE_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {categoryLabel(c, t)}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm club-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
