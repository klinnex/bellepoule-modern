/**
 * BellePoule Modern - Mode Club (#1872) : correction de l'identité d'un membre
 * (nom, prénom, licence, date de naissance). Présences, combats et code carte sont conservés.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import type { ClubMember, ClubMemberInput } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubMemberEditModalProps {
  member: ClubMember;
  /** Enregistre les champs modifiés ; lève une exception en cas d'échec (affichée ici) */
  onSave: (id: string, data: Partial<ClubMemberInput>) => Promise<void>;
  onClose: () => void;
}

export const ClubMemberEditModal: React.FC<ClubMemberEditModalProps> = ({
  member,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [lastName, setLastName] = useState(member.lastName ?? '');
  const [firstName, setFirstName] = useState(member.firstName ?? '');
  const [license, setLicense] = useState(member.license ?? '');
  const [birthDate, setBirthDate] = useState(member.birthDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !saving && (lastName.trim() !== '' || firstName.trim() !== '');

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const data: Partial<ClubMemberInput> = {
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        license: license.trim() || undefined,
      };
      if (birthDate) data.birthDate = birthDate;
      await onSave(member.id, data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${t('actions.edit')} : ${member.firstName} ${member.lastName}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {t('actions.save')}
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
        {error && (
          <p role="alert" className="text-sm club-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
