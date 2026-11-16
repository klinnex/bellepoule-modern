/**
 * BellePoule Modern - Mode Club (inventaire) : prêter un matériel à un tireur, ou
 * enregistrer son retour (état au retour, remarque).
 * Licensed under GPL-3.0
 */
import React, { useMemo, useState } from 'react';
import type { ClubItem, ClubItemCondition, ClubLoan, ClubMember } from '../../../shared/types/club';
import { ITEM_CONDITIONS, localIsoDate } from '../../../shared/utils/clubInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

type LoanModalProps =
  | {
      mode: 'lend';
      item: ClubItem;
      members: ClubMember[];
      /** Prêts en cours du club : sert à montrer ce que le tireur détient déjà */
      openLoans: ClubLoan[];
      onLend: (data: {
        memberId: string;
        quantity: number;
        dueDate?: string;
        conditionOut: ClubItemCondition;
        notes?: string;
      }) => Promise<void>;
      onClose: () => void;
    }
  | {
      mode: 'return';
      loan: ClubLoan;
      onReturn: (data: { conditionIn: ClubItemCondition; notes?: string }) => Promise<void>;
      onClose: () => void;
    };

export const ClubLoanModal: React.FC<LoanModalProps> = props => {
  const { t } = useTranslation();
  const [memberId, setMemberId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [dueDate, setDueDate] = useState('');
  const [condition, setCondition] = useState<ClubItemCondition>(
    props.mode === 'lend' ? props.item.condition : props.loan.conditionOut
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const held = useMemo(() => {
    if (props.mode !== 'lend' || !memberId) return [];
    return props.openLoans.filter(l => l.memberId === memberId);
  }, [props, memberId]);

  if (props.mode === 'lend') {
    const { item, members, onLend, onClose } = props;
    const max = item.availableQuantity;
    const qty = Number(quantity);
    const qtyOk = Number.isInteger(qty) && qty >= 1 && qty <= max;
    const canSubmit = !saving && !!memberId && qtyOk && max > 0;

    const submit = async () => {
      setError(null);
      setSaving(true);
      try {
        await onLend({
          memberId,
          quantity: qty,
          dueDate: dueDate || undefined,
          conditionOut: condition,
          notes: notes.trim() || undefined,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    };

    return (
      <Modal
        title={t('clubInventory.lend_title', { name: item.name })}
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button onClick={onClose}>{t('actions.cancel')}</Button>
            <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
              {t('clubInventory.lend_action')}
            </Button>
          </>
        }
      >
        <p className="club-muted">
          {t('clubInventory.available_count', { available: max, total: item.quantity })}
        </p>
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
        {held.length > 0 && (
          <p className="club-muted" data-testid="club-loan-held">
            {t('clubInventory.already_held', {
              items: held.map(l => `${l.itemName} ×${l.quantity}`).join(', '),
            })}
          </p>
        )}
        <div className="club-row">
          <label className="form-label">
            {t('clubInventory.quantity')}
            <input
              className="form-input"
              type="number"
              min={1}
              max={max}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
          </label>
          <label className="form-label">
            {t('clubInventory.due_date')}
            <input
              className="form-input"
              type="date"
              min={localIsoDate()}
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </label>
          <label className="form-label">
            {t('clubInventory.condition_out')}
            <select
              className="form-input"
              value={condition}
              onChange={e => setCondition(e.target.value as ClubItemCondition)}
            >
              {ITEM_CONDITIONS.map(c => (
                <option key={c} value={c}>
                  {t(`clubInventory.cond_${c}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-label">
          {t('clubInventory.notes')}
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="club-error">
            {error}
          </p>
        )}
      </Modal>
    );
  }

  const { loan, onReturn, onClose } = props;
  const submitReturn = async () => {
    setError(null);
    setSaving(true);
    try {
      await onReturn({ conditionIn: condition, notes: notes.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('clubInventory.return_title', { name: loan.itemName })}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" disabled={saving} onClick={() => void submitReturn()}>
            {t('clubInventory.return_action')}
          </Button>
        </>
      }
    >
      <p className="club-muted">
        {t('clubInventory.return_of', {
          member: loan.memberName ?? t('clubInventory.deleted_member'),
          quantity: loan.quantity,
        })}
      </p>
      <label className="form-label">
        {t('clubInventory.condition_in')}
        <select
          className="form-input"
          value={condition}
          onChange={e => setCondition(e.target.value as ClubItemCondition)}
          autoFocus
        >
          {ITEM_CONDITIONS.map(c => (
            <option key={c} value={c}>
              {t(`clubInventory.cond_${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-label">
        {t('clubInventory.notes')}
        <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="club-error">
          {error}
        </p>
      )}
    </Modal>
  );
};
