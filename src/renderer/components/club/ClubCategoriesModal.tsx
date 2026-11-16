/**
 * BellePoule Modern - Mode Club (inventaire) : catégories créées par le club, réutilisables
 * dans les menus déroulants des fiches de matériel et des filtres.
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import type { ClubItemCategoryDef } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useConfirm } from '../ConfirmDialog';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface ClubCategoriesModalProps {
  clubId: string;
  categories: ClubItemCategoryDef[];
  /** Recharge la liste (dans le parent) après chaque changement */
  onChanged: () => Promise<void>;
  onClose: () => void;
}

export const ClubCategoriesModal: React.FC<ClubCategoriesModalProps> = ({
  clubId,
  categories,
  onChanged,
  onClose,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Exécute une action du dépôt, affiche l'erreur éventuelle, puis recharge */
  const run = async (fn: () => Promise<unknown>) => {
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
    if (!api || !name.trim()) return;
    if (await run(() => api.createCategory(clubId, name))) setName('');
  };

  const rename = async (c: ClubItemCategoryDef) => {
    if (!api) return;
    if (await run(() => api.renameCategory(c.id, editName))) setEditingId(null);
  };

  const remove = async (c: ClubItemCategoryDef) => {
    if (!api) return;
    const ok = await confirm({
      message: t('clubInventory.categories_delete_confirm', { name: c.name }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteCategory(c.id));
  };

  return (
    <Modal
      title={t('clubInventory.categories_title')}
      onClose={onClose}
      size="md"
      scroll
      footer={<Button onClick={onClose}>{t('actions.close')}</Button>}
    >
      <p className="club-muted">{t('clubInventory.categories_help')}</p>
      <form
        className="club-row"
        onSubmit={e => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="form-label club-grow">
          {t('clubInventory.categories_new')}
          <input
            className="form-input"
            value={name}
            maxLength={60}
            onChange={e => setName(e.target.value)}
            placeholder={t('clubInventory.categories_placeholder')}
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
          {t('clubInventory.categories_add')}
        </Button>
      </form>

      {error && (
        <p role="alert" className="club-error">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <p className="club-muted">{t('clubInventory.categories_empty')}</p>
      ) : (
        <ul className="club-list" aria-label={t('clubInventory.categories_title')}>
          {categories.map(c => (
            <li key={c.id} className="club-row club-row--between">
              {editingId === c.id ? (
                <>
                  <input
                    className="form-input club-grow"
                    value={editName}
                    maxLength={60}
                    aria-label={t('clubInventory.categories_new')}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    aria-label={t('actions.save')}
                    disabled={busy || !editName.trim()}
                    icon={<Check size={14} aria-hidden="true" />}
                    onClick={() => void rename(c)}
                  />
                </>
              ) : (
                <>
                  <span className="club-grow">
                    {c.name}
                    <span className="club-muted">
                      {' '}
                      · {t('clubInventory.categories_count', { n: c.itemCount })}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('actions.edit')}
                    icon={<Pencil size={14} aria-hidden="true" />}
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('actions.delete')}
                    disabled={busy || c.itemCount > 0}
                    title={c.itemCount > 0 ? t('clubInventory.categories_in_use') : undefined}
                    icon={<Trash2 size={14} aria-hidden="true" />}
                    onClick={() => void remove(c)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
