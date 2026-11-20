/**
 * BellePoule Modern - Mode Club (inventaire) : prêt groupé. Une fiche par matériel
 * sélectionné, même emprunteur, même échéance. Les fiches sans disponibilité sont ignorées.
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import type { ClubItem, ClubMember } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

export interface GroupLendData {
  itemId: string;
  memberId: string;
  quantity: number;
  dueDate?: string;
  conditionOut: ClubItem['condition'];
  notes?: string;
}

interface ClubGroupLoanModalProps {
  /** Fiches sélectionnées (les réformées ou indisponibles sont ignorées) */
  items: ClubItem[];
  members: ClubMember[];
  onLend: (data: GroupLendData) => Promise<void>;
  onClose: () => void;
}

export const ClubGroupLoanModal: React.FC<ClubGroupLoanModalProps> = ({
  items,
  members,
  onLend,
  onClose,
}) => {
  const { t } = useTranslation();
  const [memberId, setMemberId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lendable = items.filter(i => !i.retired && i.availableQuantity > 0);
  const skipped = items.length - lendable.length;

  const submit = async () => {
    setError(null);
    setSaving(true);
    const failed: string[] = [];
    for (const item of lendable) {
      try {
        await onLend({
          itemId: item.id,
          memberId,
          quantity: 1,
          dueDate: dueDate || undefined,
          conditionOut: item.condition,
          notes: notes.trim() || undefined,
        });
      } catch {
        failed.push(item.name);
      }
    }
    setSaving(false);
    if (failed.length > 0) {
      setError(t('clubInventory.group_lend_failed', { items: failed.join(', ') }));
    } else {
      onClose();
    }
  };

  return (
    <Modal
      title={t('clubInventory.group_lend_title', { count: lendable.length })}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={saving || !memberId || lendable.length === 0}
            onClick={() => void submit()}
          >
            {t('clubInventory.lend_action')}
          </Button>
        </>
      }
    >
      <ul className="club-group-lend-list">
        {lendable.map(i => (
          <li key={i.id}>{i.name}</li>
        ))}
      </ul>
      {skipped > 0 && (
        <p className="club-muted">{t('clubInventory.group_lend_skipped', { count: skipped })}</p>
      )}
      <label className="form-label">
        {t('clubInventory.borrower')} *
        <select
          className="form-input"
          value={memberId}
          onChange={e => setMemberId(e.target.value)}
          autoFocus
        >
          <option value="">{t('clubInventory.choose_member')}</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.lastName} {m.firstName}
            </option>
          ))}
        </select>
      </label>
      <label className="form-label">
        {t('clubInventory.due_date')}
        <input
          className="form-input"
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
        />
      </label>
      <label className="form-label">
        {t('clubInventory.notes')}
        <textarea
          className="form-input"
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="club-error">
          {error}
        </p>
      )}
    </Modal>
  );
};
