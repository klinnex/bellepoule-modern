/**
 * BellePoule Modern - Mode Club : inventaire du matériel (achats, garanties, états,
 * emplacements) et prêts aux tireurs (retours, retards, historique). Export CSV.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  Download,
  HandCoins,
  Lock,
  Pencil,
  Plus,
  Tags,
  Trash2,
  Undo2,
  Unlock,
  Upload,
} from 'lucide-react';
import type {
  ClubItem,
  ClubItemCategory,
  ClubItemBrandDef,
  ClubItemCategoryDef,
  ClubItemInput,
  ClubLoan,
  ClubMember,
} from '../../../shared/types/club';
import {
  ITEM_CATEGORIES,
  WARRANTY_ALERT_DAYS,
  computeInventorySummary,
  isWarrantyAlert,
  localIsoDate,
} from '../../../shared/utils/clubInventory';
import { toCsv } from '../../../shared/utils/clubInventory';
import {
  itemsToRows,
  normKey,
  parseDelimited,
  rowsToItems,
} from '../../../shared/utils/clubInventoryIO';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { ClubListModal } from './ClubListModal';
import { ClubItemEditor } from './ClubItemEditor';
import { ClubLoanModal } from './ClubLoanModal';
import { openInventoryFile, saveSpreadsheetFile, saveTextFile } from './clubFiles';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

const fmtMoney = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'EUR' });

type LendTarget = { item: ClubItem } | null;
type ReturnTarget = { loan: ClubLoan } | null;

export const ClubInventoryPanel: React.FC<{ clubId: string }> = ({ clubId }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;
  const [items, setItems] = useState<ClubItem[]>([]);
  const [loans, setLoans] = useState<ClubLoan[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ClubItemCategory | 'all'>('all');
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<{ item: ClubItem | null } | null>(null);
  const [categories, setCategories] = useState<ClubItemCategoryDef[]>([]);
  const [showCategories, setShowCategories] = useState(false);
  const [brands, setBrands] = useState<ClubItemBrandDef[]>([]);
  const [showBrands, setShowBrands] = useState(false);
  /** Inventaire verrouillé : consultation et export seulement */
  const [locked, setLocked] = useState(false);
  const [lending, setLending] = useState<LendTarget>(null);
  const [returning, setReturning] = useState<ReturnTarget>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    const [i, l, m, c, b, lk] = await Promise.all([
      api.listItems(clubId, true),
      api.listLoans(clubId),
      api.listMembers(clubId),
      api.listCategories(clubId),
      api.listBrands(clubId),
      api.getInventoryLock(clubId),
    ]);
    setBrands(b);
    setLocked(lk);
    setItems(i);
    setLoans(l);
    setMembers(m);
    setCategories(c);
  }, [api, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openLoans = useMemo(() => loans.filter(l => !l.returnedAt), [loans]);
  const closedLoans = useMemo(() => loans.filter(l => !!l.returnedAt), [loans]);
  const today = localIsoDate();
  const summary = useMemo(
    () => computeInventorySummary(items, openLoans, today),
    [items, openLoans, today]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      i =>
        (showRetired || !i.retired) &&
        (category === 'all' || i.category === category) &&
        (!q ||
          `${i.name} ${i.brand ?? ''} ${i.model ?? ''} ${i.serialNumber ?? ''} ${i.location ?? ''}`
            .toLowerCase()
            .includes(q))
    );
  }, [items, search, category, showRetired]);

  /** Nom des catégories du club, par clé `custom:<id>` */
  const customLabels = Object.fromEntries(categories.map(c => [c.key, c.name]));
  const labelOf = (c: ClubItemCategory): string =>
    c.startsWith('custom:')
      ? (customLabels[c] ?? t('clubInventory.cat_other'))
      : t(`clubInventory.cat_${c}`);

  if (!api) return null;

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) showToast(okMsg, 'success');
    } catch (e) {
      showToast(errText(e), 'error');
    }
    await load();
  };

  const saveItem = async (data: ClubItemInput) => {
    if (editing?.item) {
      await api.updateItem(editing.item.id, data);
    } else {
      await api.createItem(clubId, data);
    }
    await load();
  };

  const toggleLock = async () => {
    try {
      setLocked(await api.setInventoryLock(clubId, !locked));
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const removeItem = async (item: ClubItem) => {
    const ok = await confirm({
      message: t('clubInventory.delete_confirm', { name: item.name }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteItem(item.id), t('clubInventory.deleted'));
  };

  const toggleRetired = (item: ClubItem) =>
    run(
      () => api.updateItem(item.id, { retired: !item.retired }),
      t(item.retired ? 'clubInventory.restored' : 'clubInventory.retired_done')
    );

  const removeLoan = async (loan: ClubLoan) => {
    const ok = await confirm({
      message: t('clubInventory.delete_loan_confirm', { name: loan.itemName }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteLoan(loan.id));
  };

  const exportFile = async (kind: 'csv' | 'xlsx') => {
    const rows = itemsToRows(visible, customLabels);
    try {
      const name = `inventaire-${today}.${kind}`;
      const title = t('clubInventory.export');
      const done =
        kind === 'csv'
          ? await saveTextFile(name, toCsv(rows), title, 'csv')
          : await saveSpreadsheetFile(name, rows, title);
      if (done) {
        showToast(t('clubInventory.exported', { n: visible.length }), 'success');
      }
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const importFile = async () => {
    try {
      const file = await openInventoryFile(t('clubInventory.import'));
      if (!file) return;
      const customKeys = new Map(categories.map(c => [normKey(c.name), c.key] as const));
      const { items, errors } = rowsToItems(parseDelimited(file.content), customKeys);
      if (items.length === 0) {
        showToast(t('clubInventory.import_empty'), 'error');
        return;
      }
      const details = errors
        .slice(0, 5)
        .map(e => t('clubInventory.import_line_error', { line: e.line, message: e.message }))
        .join('\n');
      const ok = await confirm({
        message: [
          t('clubInventory.import_confirm', { created: items.length, errors: errors.length }),
          details,
        ]
          .filter(Boolean)
          .join('\n\n'),
        confirmLabel: t('clubInventory.import_action'),
      });
      if (!ok) return;
      const r = await api.importItems(clubId, items);
      showToast(
        t('clubInventory.import_done', { created: r.created, skipped: r.skipped }),
        'success'
      );
      await load();
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const loanRow = (l: ClubLoan, open: boolean) => (
    <tr key={l.id} className={l.overdue ? 'club-row-archived' : undefined}>
      <td>{l.itemName}</td>
      <td>
        {l.memberName ?? <span className="club-muted">{t('clubInventory.deleted_member')}</span>}
      </td>
      <td>{l.quantity}</td>
      <td>{fmtDate(l.lentAt)}</td>
      <td>
        {l.dueDate ? fmtDate(l.dueDate) : '—'}
        {l.overdue && (
          <span className="club-badge club-badge--warn"> {t('clubInventory.overdue')}</span>
        )}
      </td>
      {open ? (
        <td>{t(`clubInventory.cond_${l.conditionOut}`)}</td>
      ) : (
        <td>
          {fmtDate(l.returnedAt)}
          {l.conditionIn && ` · ${t(`clubInventory.cond_${l.conditionIn}`)}`}
        </td>
      )}
      <td className="club-row club-row--end">
        {open ? (
          <Button
            size="sm"
            variant="primary"
            disabled={locked}
            icon={<Undo2 size={14} aria-hidden="true" />}
            onClick={() => setReturning({ loan: l })}
          >
            {t('clubInventory.return_action')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('actions.delete')}
            disabled={locked}
            icon={<Trash2 size={14} aria-hidden="true" />}
            onClick={() => void removeLoan(l)}
          />
        )}
      </td>
    </tr>
  );

  return (
    <div className="club-members">
      <section className="club-card" aria-labelledby="club-inventory-title">
        <div className="club-row club-row--between">
          <h2 id="club-inventory-title" className="club-card-title">
            {t('clubInventory.title', { n: summary.lines })}
          </h2>
          <Button
            variant={locked ? 'warning' : 'ghost'}
            icon={
              locked ? (
                <Lock size={15} aria-hidden="true" />
              ) : (
                <Unlock size={15} aria-hidden="true" />
              )
            }
            aria-pressed={locked}
            onClick={() => void toggleLock()}
          >
            {t(locked ? 'clubInventory.unlock_button' : 'clubInventory.lock_button')}
          </Button>
          {locked && (
            <span className="club-badge club-badge--warn">{t('clubInventory.locked_badge')}</span>
          )}
          <Button
            icon={<Upload size={15} aria-hidden="true" />}
            disabled={locked}
            onClick={() => void importFile()}
          >
            {t('clubInventory.import')}
          </Button>
          <Button
            icon={<Download size={15} aria-hidden="true" />}
            disabled={visible.length === 0}
            onClick={() => void exportFile('csv')}
          >
            {t('clubInventory.export')}
          </Button>
          <Button
            icon={<Download size={15} aria-hidden="true" />}
            disabled={visible.length === 0}
            onClick={() => void exportFile('xlsx')}
          >
            {t('clubInventory.export_excel')}
          </Button>
          <Button
            icon={<Tags size={15} aria-hidden="true" />}
            disabled={locked}
            onClick={() => setShowCategories(true)}
          >
            {t('clubInventory.categories_button')}
          </Button>
          <Button
            icon={<Tags size={15} aria-hidden="true" />}
            disabled={locked}
            onClick={() => setShowBrands(true)}
          >
            {t('clubInventory.brands_button')}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            disabled={locked}
            onClick={() => setEditing({ item: null })}
          >
            {t('clubInventory.add')}
          </Button>
        </div>

        <div className="club-tiles" data-testid="club-inventory-summary">
          <div className="club-tile">
            <div className="club-tile-body">
              <div className="club-tile-name">{summary.units}</div>
              <div className="club-tile-meta">{t('clubInventory.units')}</div>
            </div>
          </div>
          <div className="club-tile">
            <div className="club-tile-body">
              <div className="club-tile-name">{summary.lentUnits}</div>
              <div className="club-tile-meta">{t('clubInventory.lent_units')}</div>
            </div>
          </div>
          <div className="club-tile">
            <div className="club-tile-body">
              <div className="club-tile-name">{fmtMoney(summary.value)}</div>
              <div className="club-tile-meta">
                {t('clubInventory.value', { n: summary.valued })}
              </div>
            </div>
          </div>
          <div className="club-tile">
            <div className="club-tile-body">
              <div className="club-tile-name">{summary.overdueLoans}</div>
              <div className="club-tile-meta">{t('clubInventory.overdue_loans')}</div>
            </div>
          </div>
          <div className="club-tile">
            <div className="club-tile-body">
              <div className="club-tile-name">{summary.warrantyAlerts}</div>
              <div className="club-tile-meta">
                {t('clubInventory.warranty_alerts', { days: WARRANTY_ALERT_DAYS })}
              </div>
            </div>
          </div>
        </div>

        <div className="club-row">
          <label className="form-label club-grow">
            {t('clubInventory.search')}
            <input
              className="form-input"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('clubInventory.search_placeholder')}
            />
          </label>
          <label className="form-label">
            {t('clubInventory.category')}
            <select
              className="form-input"
              value={category}
              onChange={e => setCategory(e.target.value as ClubItemCategory | 'all')}
            >
              <option value="all">{t('clubInventory.all_categories')}</option>
              <optgroup label={t('clubInventory.categories_group_standard')}>
                {ITEM_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {t(`clubInventory.cat_${c}`)}
                  </option>
                ))}
              </optgroup>
              {categories.length > 0 && (
                <optgroup label={t('clubInventory.categories_group_custom')}>
                  {categories.map(c => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="form-label club-row">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={e => setShowRetired(e.target.checked)}
            />
            {t('clubInventory.show_retired')}
          </label>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={t('clubInventory.no_items')}
            description={t('clubInventory.no_items_desc')}
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('clubInventory.name')}</th>
                  <th scope="col">{t('clubInventory.category')}</th>
                  <th scope="col">{t('clubInventory.quantity')}</th>
                  <th scope="col">{t('clubInventory.condition')}</th>
                  <th scope="col">{t('clubInventory.location')}</th>
                  <th scope="col">{t('clubInventory.purchase')}</th>
                  <th scope="col">{t('clubInventory.warranty_until')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('actions.edit')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(i => (
                  <tr key={i.id} className={i.retired ? 'club-row-archived' : undefined}>
                    <td>
                      <strong>{i.name}</strong>
                      {(i.brand || i.model || i.serialNumber) && (
                        <div className="club-muted">
                          {[i.brand, i.model, i.serialNumber && `S/N ${i.serialNumber}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                      {i.retired && (
                        <span className="club-badge">{t('clubInventory.status_retired')}</span>
                      )}
                    </td>
                    <td>
                      {labelOf(i.category)}
                      {i.weapon && <div className="club-muted">{weaponLabel(i.weapon, t)}</div>}
                    </td>
                    <td>
                      {i.quantity}
                      {i.lentQuantity > 0 && (
                        <div className="club-muted">
                          {t('clubInventory.lent_short', { n: i.lentQuantity })}
                        </div>
                      )}
                    </td>
                    <td>{t(`clubInventory.cond_${i.condition}`)}</td>
                    <td>{i.location ?? ''}</td>
                    <td>
                      {fmtDate(i.purchaseDate)}
                      {i.purchasePrice !== undefined && (
                        <div className="club-muted">{fmtMoney(i.purchasePrice)}</div>
                      )}
                    </td>
                    <td>
                      {fmtDate(i.warrantyUntil)}
                      {isWarrantyAlert(i.warrantyUntil, today) && (
                        <span className="club-badge club-badge--warn">
                          {t('clubInventory.warranty_soon')}
                        </span>
                      )}
                    </td>
                    <td className="club-row club-row--end">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('clubInventory.lend_action')}
                        title={t('clubInventory.lend_action')}
                        disabled={locked || i.retired || i.availableQuantity === 0}
                        icon={<HandCoins size={14} aria-hidden="true" />}
                        onClick={() => setLending({ item: i })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('actions.edit')}
                        icon={<Pencil size={14} aria-hidden="true" />}
                        disabled={locked}
                        onClick={() => setEditing({ item: i })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t(i.retired ? 'clubInventory.restore' : 'clubInventory.retire')}
                        title={t(i.retired ? 'clubInventory.restore' : 'clubInventory.retire')}
                        icon={
                          i.retired ? (
                            <Undo2 size={14} aria-hidden="true" />
                          ) : (
                            <Archive size={14} aria-hidden="true" />
                          )
                        }
                        disabled={locked}
                        onClick={() => void toggleRetired(i)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('actions.delete')}
                        disabled={locked || i.lentQuantity > 0}
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        onClick={() => void removeItem(i)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="club-card" aria-labelledby="club-loans-title">
        <h2 id="club-loans-title" className="club-card-title">
          {t('clubInventory.loans_title', { n: openLoans.length })}
        </h2>
        {openLoans.length === 0 ? (
          <p className="club-muted">{t('clubInventory.no_loans')}</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('clubInventory.name')}</th>
                  <th scope="col">{t('clubInventory.borrower')}</th>
                  <th scope="col">{t('clubInventory.quantity')}</th>
                  <th scope="col">{t('clubInventory.lent_at')}</th>
                  <th scope="col">{t('clubInventory.due_date')}</th>
                  <th scope="col">{t('clubInventory.condition_out')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('actions.edit')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>{openLoans.map(l => loanRow(l, true))}</tbody>
            </table>
          </div>
        )}

        <Button
          variant="ghost"
          icon={<BookOpen size={15} aria-hidden="true" />}
          aria-expanded={showHistory}
          onClick={() => setShowHistory(v => !v)}
        >
          {t('clubInventory.history_title', { n: closedLoans.length })}
        </Button>
        {showHistory &&
          (closedLoans.length === 0 ? (
            <p className="club-muted">{t('clubInventory.no_history')}</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('clubInventory.name')}</th>
                    <th scope="col">{t('clubInventory.borrower')}</th>
                    <th scope="col">{t('clubInventory.quantity')}</th>
                    <th scope="col">{t('clubInventory.lent_at')}</th>
                    <th scope="col">{t('clubInventory.due_date')}</th>
                    <th scope="col">{t('clubInventory.returned_at')}</th>
                    <th scope="col">
                      <span className="sr-only">{t('actions.delete')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>{closedLoans.map(l => loanRow(l, false))}</tbody>
              </table>
            </div>
          ))}
      </section>

      {editing && (
        <ClubItemEditor
          item={editing.item}
          customCategories={categories}
          brands={brands.map(b => b.name)}
          onSave={saveItem}
          onClose={() => setEditing(null)}
        />
      )}
      {showCategories && (
        <ClubListModal
          title={t('clubInventory.categories_title')}
          help={t('clubInventory.categories_help')}
          newLabel={t('clubInventory.categories_new')}
          placeholder={t('clubInventory.categories_placeholder')}
          emptyText={t('clubInventory.categories_empty')}
          inUseHint={t('clubInventory.categories_in_use')}
          countLabel={n => t('clubInventory.categories_count', { n })}
          deleteMessage={name => t('clubInventory.categories_delete_confirm', { name })}
          items={categories.map(c => ({ id: c.id, name: c.name, itemCount: c.itemCount }))}
          readOnly={locked}
          onCreate={name => api.createCategory(clubId, name)}
          onRename={(id, name) => api.renameCategory(id, name)}
          onDelete={id => api.deleteCategory(id)}
          onChanged={load}
          onClose={() => setShowCategories(false)}
        />
      )}
      {showBrands && (
        <ClubListModal
          title={t('clubInventory.brands_title')}
          help={t('clubInventory.brands_help')}
          newLabel={t('clubInventory.brands_new')}
          placeholder={t('clubInventory.brands_placeholder')}
          emptyText={t('clubInventory.brands_empty')}
          inUseHint={t('clubInventory.categories_in_use')}
          countLabel={n => t('clubInventory.categories_count', { n })}
          deleteMessage={name => t('clubInventory.brands_delete_confirm', { name })}
          items={brands.map(b => ({ id: b.id, name: b.name, itemCount: b.itemCount }))}
          readOnly={locked}
          onCreate={name => api.createBrand(clubId, name)}
          onRename={(id, name) => api.renameBrand(id, name)}
          onDelete={id => api.deleteBrand(id)}
          onChanged={load}
          onClose={() => setShowBrands(false)}
        />
      )}
      {lending && (
        <ClubLoanModal
          mode="lend"
          item={lending.item}
          members={members.filter(m => m.active)}
          openLoans={openLoans}
          onClose={() => setLending(null)}
          onLend={async data => {
            await api.lendItem({ itemId: lending.item.id, ...data });
            await load();
          }}
        />
      )}
      {returning && (
        <ClubLoanModal
          mode="return"
          loan={returning.loan}
          onClose={() => setReturning(null)}
          onReturn={async data => {
            await api.returnLoan(returning.loan.id, data);
            await load();
          }}
        />
      )}
    </div>
  );
};
