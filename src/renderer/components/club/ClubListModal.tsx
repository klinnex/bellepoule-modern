/**
 * BellePoule Modern - Mode Club (inventaire) : liste gérée par le club (catégories ou marques)
 * — ajout, renommage, suppression ; réutilisée dans les menus déroulants des fiches.
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useConfirm } from '../ConfirmDialog';

export interface ClubListEntry {
  id: string;
  name: string;
  itemCount: number;
}

interface ClubListModalProps {
  title: string;
  help: string;
  newLabel: string;
  placeholder: string;
  emptyText: string;
  inUseHint: string;
  countLabel: (n: number) => string;
  deleteMessage: (name: string) => string;
  items: ClubListEntry[];
  /** Consultation seule : aucune action de modification */
  readOnly?: boolean;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Recharge la liste du parent après chaque changement */
  onChanged: () => Promise<void>;
  onClose: () => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const ClubListModal: React.FC<ClubListModalProps> = ({
  title,
  help,
  newLabel,
  placeholder,
  emptyText,
  inUseHint,
  countLabel,
  deleteMessage,
  items,
  readOnly = false,
  onCreate,
  onRename,
  onDelete,
  onChanged,
  onClose,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Exécute une action du dépôt, affiche l'erreur éventuelle, puis recharge */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (await run(() => onCreate(name))) setName('');
  };

  const rename = async (e: ClubListEntry) => {
    if (await run(() => onRename(e.id, editName))) setEditingId(null);
  };

  const remove = async (e: ClubListEntry) => {
    const ok = await confirm({
      message: deleteMessage(e.name),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => onDelete(e.id));
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="md"
      scroll
      footer={<Button onClick={onClose}>{t('actions.close')}</Button>}
    >
      <p className="club-muted">{help}</p>
      {!readOnly && (
        <form
          className="club-row"
          onSubmit={ev => {
            ev.preventDefault();
            void add();
          }}
        >
          <label className="form-label club-grow">
            {newLabel}
            <input
              className="form-input"
              value={name}
              maxLength={60}
              placeholder={placeholder}
              onChange={ev => setName(ev.target.value)}
            />
          </label>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {t('clubInventory.categories_add')}
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="club-error">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="club-muted">{emptyText}</p>
      ) : (
        <ul className="club-list">
          {items.map(e => (
            <li key={e.id} className="club-row club-row--between">
              {editingId === e.id ? (
                <>
                  <input
                    className="form-input club-grow"
                    value={editName}
                    maxLength={60}
                    aria-label={newLabel}
                    onChange={ev => setEditName(ev.target.value)}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    aria-label={t('actions.save')}
                    disabled={busy || !editName.trim()}
                    icon={<Check size={14} aria-hidden="true" />}
                    onClick={() => void rename(e)}
                  />
                </>
              ) : (
                <>
                  <span className="club-grow">
                    {e.name}
                    <span className="club-muted"> · {countLabel(e.itemCount)}</span>
                  </span>
                  {!readOnly && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('actions.edit')}
                        icon={<Pencil size={14} aria-hidden="true" />}
                        onClick={() => {
                          setEditingId(e.id);
                          setEditName(e.name);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('actions.delete')}
                        disabled={busy || e.itemCount > 0}
                        title={e.itemCount > 0 ? inUseHint : undefined}
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        onClick={() => void remove(e)}
                      />
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
