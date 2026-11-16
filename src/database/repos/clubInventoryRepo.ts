/**
 * BellePoule Modern - Mode Club : inventaire du matériel et prêts aux tireurs.
 * Licensed under GPL-3.0
 */
import { v4 as uuidv4 } from 'uuid';
import { Weapon } from '../../shared/types';
import type {
  ClubItem,
  ClubItemCategory,
  ClubItemBrandDef,
  ClubItemCategoryDef,
  ClubItemCondition,
  ClubItemInput,
  ClubLoan,
  ClubLoanFilter,
  ClubLoanInput,
  ClubLoanReturn,
} from '../../shared/types/club';
import {
  isCustomCategoryKey,
  isItemCondition,
  isLoanOverdue,
  localIsoDate,
  normalizeItemInput,
  normalizeQuantity,
} from '../../shared/utils/clubInventory';
import { isIsoDate } from '../../shared/utils/clubStats';
import type { SqlExecutor } from './sqlExecutor';

interface ItemRow {
  id: string;
  club_id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  weapon: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  purchase_date: string | null;
  purchase_price: number | null;
  supplier: string | null;
  invoice_ref: string | null;
  warranty_until: string | null;
  condition: string | null;
  location: string | null;
  notes: string | null;
  retired: number;
  lent: number | null;
  created_at: string;
  updated_at: string;
}

interface BrandRow {
  id: string;
  club_id: string;
  name: string;
  item_count: number | null;
  created_at: string;
  updated_at: string;
}

interface CategoryRow {
  id: string;
  club_id: string;
  name: string;
  item_count: number | null;
  created_at: string;
  updated_at: string;
}

interface LoanRow {
  id: string;
  club_id: string;
  item_id: string;
  item_name: string | null;
  member_id: string | null;
  member_first: string | null;
  member_last: string | null;
  quantity: number;
  lent_at: string;
  due_date: string | null;
  returned_at: string | null;
  condition_out: string | null;
  condition_in: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
const cond = (v: string | null, fallback: ClubItemCondition): ClubItemCondition =>
  isItemCondition(v) ? v : fallback;

/** Sous-requête : exemplaires en prêt pour une fiche (alias `i` attendu) */
const LENT_SQL = `COALESCE((SELECT SUM(l.quantity) FROM club_loans l
  WHERE l.item_id = i.id AND l.returned_at IS NULL), 0)`;

const rowToItem = (r: ItemRow): ClubItem => {
  const lent = r.lent ?? 0;
  const quantity = normalizeQuantity(r.quantity);
  return {
    id: r.id,
    clubId: r.club_id,
    name: r.name,
    category: r.category as ClubItemCategory,
    brand: opt(r.brand),
    model: opt(r.model),
    serialNumber: opt(r.serial_number),
    weapon: (Object.values(Weapon) as string[]).includes(r.weapon ?? '')
      ? (r.weapon as Weapon)
      : undefined,
    size: opt(r.size),
    color: opt(r.color),
    quantity,
    purchaseDate: isIsoDate(r.purchase_date) ? (r.purchase_date as string) : undefined,
    purchasePrice: opt(r.purchase_price),
    supplier: opt(r.supplier),
    invoiceRef: opt(r.invoice_ref),
    warrantyUntil: isIsoDate(r.warranty_until) ? (r.warranty_until as string) : undefined,
    condition: cond(r.condition, 'good'),
    location: opt(r.location),
    notes: opt(r.notes),
    retired: r.retired !== 0,
    lentQuantity: lent,
    availableQuantity: r.retired !== 0 ? 0 : Math.max(0, quantity - lent),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

const memberName = (r: LoanRow): string | null =>
  r.member_id ? `${r.member_first ?? ''} ${r.member_last ?? ''}`.trim() || null : null;

const rowToLoan = (r: LoanRow, today: string): ClubLoan => {
  const loan = {
    id: r.id,
    clubId: r.club_id,
    itemId: r.item_id,
    itemName: r.item_name ?? '',
    memberId: r.member_id,
    memberName: memberName(r),
    quantity: normalizeQuantity(r.quantity),
    lentAt: r.lent_at,
    dueDate: isIsoDate(r.due_date) ? (r.due_date as string) : undefined,
    returnedAt: opt(r.returned_at),
    conditionOut: cond(r.condition_out, 'good'),
    conditionIn: isItemCondition(r.condition_in) ? r.condition_in : undefined,
    notes: opt(r.notes),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  return { ...loan, overdue: isLoanOverdue(loan, today) };
};

/**
 * Inventaire du club : fiches de matériel (quantité, achat, garantie, état, emplacement)
 * et prêts aux tireurs. Les exemplaires disponibles = quantité − prêts en cours.
 */
export class ClubInventoryRepo {
  constructor(private readonly sql: SqlExecutor) {}

  private ensureOpen(): void {
    if (!this.sql.db) throw new Error('Database not open');
  }

  // ─── Matériel ────────────────────────────────────────────────────────────────

  private itemSelect(where: string, params: unknown[]): ClubItem[] {
    return this.sql
      .queryAll<ItemRow>(
        `SELECT i.*, ${LENT_SQL} AS lent FROM club_items i WHERE ${where}
         ORDER BY i.category, i.name COLLATE NOCASE`,
        params
      )
      .map(rowToItem);
  }

  /** Matériel du club, par catégorie puis nom ; réformés inclus par défaut */
  public listItems(clubId: string, includeRetired = true): ClubItem[] {
    if (!this.sql.db) return [];
    return this.itemSelect(`i.club_id = ?${includeRetired ? '' : ' AND i.retired = 0'}`, [clubId]);
  }

  public getItem(id: string): ClubItem | null {
    if (!this.sql.db) return null;
    return this.itemSelect('i.id = ?', [id])[0] ?? null;
  }

  private requireItem(id: string): ClubItem {
    const item = this.getItem(id);
    if (!item) throw new Error('Matériel inconnu');
    return item;
  }

  public createItem(clubId: string, data: ClubItemInput): ClubItem {
    this.ensureOpen();
    this.assertUnlocked(clubId);
    const e = normalizeItemInput(data);
    this.assertCategory(clubId, e.category);
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO club_items (id, club_id, name, category, brand, model, serial_number, weapon,
         size, color, quantity, purchase_date, purchase_price, supplier, invoice_ref,
         warranty_until, condition, location, notes, retired, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        clubId,
        e.name,
        e.category,
        e.brand ?? null,
        e.model ?? null,
        e.serialNumber ?? null,
        e.weapon ?? null,
        e.size ?? null,
        e.color ?? null,
        e.quantity,
        e.purchaseDate ?? null,
        e.purchasePrice ?? null,
        e.supplier ?? null,
        e.invoiceRef ?? null,
        e.warrantyUntil ?? null,
        e.condition,
        e.location ?? null,
        e.notes ?? null,
        e.retired ? 1 : 0,
        now,
        now,
      ]
    );
    return this.requireItem(id);
  }

  /** Fiche modifiée ; la quantité ne peut pas passer sous le nombre d'exemplaires prêtés */
  public updateItem(id: string, updates: Partial<ClubItemInput>): ClubItem | null {
    this.ensureOpen();
    const cur = this.getItem(id);
    if (!cur) return null;
    this.assertUnlocked(cur.clubId);
    const e = normalizeItemInput({ ...this.toInput(cur), ...updates });
    this.assertCategory(cur.clubId, e.category);
    if (e.quantity < cur.lentQuantity) {
      throw new Error(`${cur.lentQuantity} exemplaire(s) encore prêté(s) : quantité minimale`);
    }
    this.sql.run(
      `UPDATE club_items SET name = ?, category = ?, brand = ?, model = ?, serial_number = ?,
         weapon = ?, size = ?, color = ?, quantity = ?, purchase_date = ?, purchase_price = ?,
         supplier = ?, invoice_ref = ?, warranty_until = ?, condition = ?, location = ?,
         notes = ?, retired = ?, updated_at = ?
       WHERE id = ?`,
      [
        e.name,
        e.category,
        e.brand ?? null,
        e.model ?? null,
        e.serialNumber ?? null,
        e.weapon ?? null,
        e.size ?? null,
        e.color ?? null,
        e.quantity,
        e.purchaseDate ?? null,
        e.purchasePrice ?? null,
        e.supplier ?? null,
        e.invoiceRef ?? null,
        e.warrantyUntil ?? null,
        e.condition,
        e.location ?? null,
        e.notes ?? null,
        e.retired ? 1 : 0,
        new Date().toISOString(),
        id,
      ]
    );
    return this.getItem(id);
  }

  /** Valeurs d'une fiche existante, relues pour fusionner les modifications partielles */
  private toInput(i: ClubItem): ClubItemInput {
    return {
      name: i.name,
      category: i.category,
      brand: i.brand,
      model: i.model,
      serialNumber: i.serialNumber,
      weapon: i.weapon,
      size: i.size,
      color: i.color,
      quantity: i.quantity,
      purchaseDate: i.purchaseDate,
      purchasePrice: i.purchasePrice,
      supplier: i.supplier,
      invoiceRef: i.invoiceRef,
      warrantyUntil: i.warrantyUntil,
      condition: i.condition,
      location: i.location,
      notes: i.notes,
      retired: i.retired,
    };
  }

  /** Refusé tant qu'un exemplaire est prêté ; sinon efface fiche et prêts rendus */
  public deleteItem(id: string): void {
    this.ensureOpen();
    const item = this.getItem(id);
    if (!item) return;
    this.assertUnlocked(item.clubId);
    if (item.lentQuantity > 0) {
      throw new Error('Matériel encore prêté : rendez-le avant de le supprimer');
    }
    this.sql.transaction(() => {
      this.sql.run('DELETE FROM club_loans WHERE item_id = ?', [id]);
      this.sql.run('DELETE FROM club_items WHERE id = ?', [id]);
    });
  }

  // ─── Prêts ───────────────────────────────────────────────────────────────────

  private loanSelect(where: string, params: unknown[]): ClubLoan[] {
    const today = localIsoDate();
    return this.sql
      .queryAll<LoanRow>(
        `SELECT l.*, i.name AS item_name, m.first_name AS member_first, m.last_name AS member_last
         FROM club_loans l
         JOIN club_items i ON i.id = l.item_id
         LEFT JOIN club_members m ON m.id = l.member_id
         WHERE ${where}
         ORDER BY (l.returned_at IS NOT NULL), l.lent_at DESC`,
        params
      )
      .map(r => rowToLoan(r, today));
  }

  public getLoan(id: string): ClubLoan | null {
    if (!this.sql.db) return null;
    return this.loanSelect('l.id = ?', [id])[0] ?? null;
  }

  /** Prêts du club, plus récents d'abord ; en cours en tête */
  public listLoans(clubId: string, filter: ClubLoanFilter = {}): ClubLoan[] {
    if (!this.sql.db) return [];
    const where = ['l.club_id = ?'];
    const params: unknown[] = [clubId];
    if (filter.memberId) {
      where.push('l.member_id = ?');
      params.push(filter.memberId);
    }
    if (filter.itemId) {
      where.push('l.item_id = ?');
      params.push(filter.itemId);
    }
    if (filter.open === true) where.push('l.returned_at IS NULL');
    if (filter.open === false) where.push('l.returned_at IS NOT NULL');
    return this.loanSelect(where.join(' AND '), params);
  }

  /**
   * Prête des exemplaires à un tireur actif du même club. Refusé si la quantité
   * dépasse les disponibles, si le matériel est réformé ou si le tireur est archivé.
   */
  public lendItem(data: ClubLoanInput): ClubLoan {
    this.ensureOpen();
    const item = this.requireItem(data?.itemId);
    this.assertUnlocked(item.clubId);
    if (item.retired) throw new Error('Matériel réformé : prêt impossible');
    const member = this.sql.queryOne<{ club_id: string; active: number }>(
      'SELECT club_id, active FROM club_members WHERE id = ?',
      [data.memberId]
    );
    if (!member || member.club_id !== item.clubId) throw new Error('Tireur inconnu dans ce club');
    if (member.active === 0) throw new Error('Tireur archivé : prêt impossible');

    const quantity = normalizeQuantity(data.quantity ?? 1);
    if (quantity > item.availableQuantity) {
      throw new Error(`Seulement ${item.availableQuantity} exemplaire(s) disponible(s)`);
    }
    const dueDate = data.dueDate ? String(data.dueDate) : undefined;
    if (dueDate !== undefined && !isIsoDate(dueDate)) {
      throw new Error('Date de retour invalide (AAAA-MM-JJ)');
    }
    const now = new Date().toISOString();
    if (dueDate && dueDate < localIsoDate()) {
      throw new Error('La date de retour prévue est déjà passée');
    }
    const id = uuidv4();
    this.sql.run(
      `INSERT INTO club_loans (id, club_id, item_id, member_id, quantity, lent_at, due_date,
         returned_at, condition_out, condition_in, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)`,
      [
        id,
        item.clubId,
        item.id,
        data.memberId,
        quantity,
        now,
        dueDate ?? null,
        isItemCondition(data.conditionOut) ? data.conditionOut : item.condition,
        typeof data.notes === 'string' && data.notes.trim()
          ? data.notes.trim().slice(0, 2000)
          : null,
        now,
        now,
      ]
    );
    return this.getLoan(id)!;
  }

  /**
   * Rend un prêt. `conditionIn` devient l'état du matériel ; `returnedAt` ne peut pas
   * précéder le prêt.
   */
  public returnLoan(id: string, data: ClubLoanReturn = {}): ClubLoan | null {
    this.ensureOpen();
    const cur = this.getLoan(id);
    if (!cur) return null;
    this.assertUnlocked(cur.clubId);
    if (cur.returnedAt) throw new Error('Prêt déjà rendu');
    const returnedAt = data.returnedAt ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(returnedAt))) throw new Error('Date de retour invalide');
    if (Date.parse(returnedAt) < Date.parse(cur.lentAt)) {
      throw new Error('Le retour ne peut pas précéder le prêt');
    }
    const conditionIn = isItemCondition(data.conditionIn) ? data.conditionIn : undefined;
    this.sql.transaction(() => {
      this.sql.run(
        `UPDATE club_loans SET returned_at = ?, condition_in = ?, notes = COALESCE(?, notes),
           updated_at = ? WHERE id = ?`,
        [
          returnedAt,
          conditionIn ?? null,
          typeof data.notes === 'string' && data.notes.trim()
            ? data.notes.trim().slice(0, 2000)
            : null,
          new Date().toISOString(),
          id,
        ]
      );
      if (conditionIn) {
        this.sql.run('UPDATE club_items SET condition = ?, updated_at = ? WHERE id = ?', [
          conditionIn,
          new Date().toISOString(),
          cur.itemId,
        ]);
      }
    });
    return this.getLoan(id);
  }

  /** Supprime un prêt rendu (correction de saisie) ; un prêt en cours doit d'abord être rendu */
  public deleteLoan(id: string): void {
    this.ensureOpen();
    const cur = this.getLoan(id);
    if (!cur) return;
    this.assertUnlocked(cur.clubId);
    if (!cur.returnedAt) throw new Error('Prêt en cours : rendez-le avant de le supprimer');
    this.sql.run('DELETE FROM club_loans WHERE id = ?', [id]);
  }

  /**
   * Import en lot (CSV / Excel) : fiches ajoutées dans une seule transaction. Une fiche dont
   * le n° de série existe déjà dans le club (ou plus haut dans le même fichier) est ignorée.
   */
  public importItems(
    clubId: string,
    inputs: ClubItemInput[]
  ): { created: number; skipped: number } {
    this.ensureOpen();
    this.assertUnlocked(clubId);
    if (!Array.isArray(inputs) || inputs.length > 2000) {
      throw new Error('Import limité à 2000 fiches');
    }
    const seen = new Set(
      this.listItems(clubId)
        .map(i => i.serialNumber?.trim().toLowerCase())
        .filter(Boolean)
    );
    let created = 0;
    let skipped = 0;
    this.sql.transaction(() => {
      for (const data of inputs) {
        const serial = data.serialNumber?.trim().toLowerCase();
        if (serial && seen.has(serial)) {
          skipped++;
          continue;
        }
        if (serial) seen.add(serial);
        this.createItem(clubId, data);
        created++;
      }
    });
    return { created, skipped };
  }

  // ─── Catégories du club ──────────────────────────────────────────────────────

  private rowToCategory(r: CategoryRow): ClubItemCategoryDef {
    return {
      key: `custom:${r.id}`,
      id: r.id,
      clubId: r.club_id,
      name: r.name,
      itemCount: r.item_count ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private categorySelect(where: string, params: unknown[]): ClubItemCategoryDef[] {
    return this.sql
      .queryAll<CategoryRow>(
        `SELECT c.*, (SELECT COUNT(*) FROM club_items i WHERE i.category = 'custom:' || c.id) AS item_count
         FROM club_item_categories c WHERE ${where} ORDER BY c.name COLLATE NOCASE`,
        params
      )
      .map(r => this.rowToCategory(r));
  }

  public listCategories(clubId: string): ClubItemCategoryDef[] {
    if (!this.sql.db) return [];
    return this.categorySelect('c.club_id = ?', [clubId]);
  }

  public getCategory(id: string): ClubItemCategoryDef | null {
    if (!this.sql.db) return null;
    return this.categorySelect('c.id = ?', [id])[0] ?? null;
  }

  /** Nom nettoyé (1 à 60 caractères) et unique dans le club, sans tenir compte de la casse */
  private checkCategoryName(clubId: string, name: unknown, exceptId?: string): string {
    const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
    if (!clean) throw new Error('Nom de catégorie requis');
    const dup = this.sql.queryOne<{ id: string }>(
      'SELECT id FROM club_item_categories WHERE club_id = ? AND name = ? COLLATE NOCASE',
      [clubId, clean]
    );
    if (dup && dup.id !== exceptId) throw new Error('Cette catégorie existe déjà');
    return clean;
  }

  public createCategory(clubId: string, name: string): ClubItemCategoryDef {
    this.ensureOpen();
    this.assertUnlocked(clubId);
    const clean = this.checkCategoryName(clubId, name);
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      'INSERT INTO club_item_categories (id, club_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, clubId, clean, now, now]
    );
    return this.getCategory(id)!;
  }

  public renameCategory(id: string, name: string): ClubItemCategoryDef | null {
    this.ensureOpen();
    const cur = this.getCategory(id);
    if (!cur) return null;
    this.assertUnlocked(cur.clubId);
    const clean = this.checkCategoryName(cur.clubId, name, id);
    this.sql.run('UPDATE club_item_categories SET name = ?, updated_at = ? WHERE id = ?', [
      clean,
      new Date().toISOString(),
      id,
    ]);
    return this.getCategory(id);
  }

  /** Refusée tant qu'une fiche utilise la catégorie */
  public deleteCategory(id: string): void {
    this.ensureOpen();
    const cur = this.getCategory(id);
    if (!cur) return;
    this.assertUnlocked(cur.clubId);
    if (cur.itemCount > 0) {
      throw new Error(
        `Catégorie utilisée par ${cur.itemCount} fiche(s) : changez-les avant de la supprimer`
      );
    }
    this.sql.run('DELETE FROM club_item_categories WHERE id = ?', [id]);
  }

  /** Une clé `custom:<id>` doit désigner une catégorie du même club */
  private assertCategory(clubId: string, category: string): void {
    if (!isCustomCategoryKey(category)) return;
    const id = category.slice('custom:'.length);
    const ok = this.sql.queryOne<{ id: string }>(
      'SELECT id FROM club_item_categories WHERE id = ? AND club_id = ?',
      [id, clubId]
    );
    if (!ok) throw new Error('Catégorie inconnue dans ce club');
  }

  // ─── Verrou de l'inventaire ──────────────────────────────────────────────────

  /** Inventaire verrouillé : consultation et export seulement (modifications refusées) */
  public isInventoryLocked(clubId: string): boolean {
    if (!this.sql.db) return false;
    const r = this.sql.queryOne<{ inventory_locked: number | null }>(
      'SELECT inventory_locked FROM clubs WHERE id = ?',
      [clubId]
    );
    return (r?.inventory_locked ?? 0) !== 0;
  }

  public setInventoryLock(clubId: string, locked: boolean): boolean {
    this.ensureOpen();
    this.sql.run('UPDATE clubs SET inventory_locked = ? WHERE id = ?', [locked ? 1 : 0, clubId]);
    return this.isInventoryLocked(clubId);
  }

  private assertUnlocked(clubId: string): void {
    if (this.isInventoryLocked(clubId)) {
      throw new Error('Inventaire verrouillé : déverrouillez-le pour le modifier');
    }
  }

  // ─── Catalogue de marques du club ────────────────────────────────────────────

  private brandSelect(where: string, params: unknown[]): ClubItemBrandDef[] {
    return this.sql
      .queryAll<BrandRow>(
        `SELECT b.*, (SELECT COUNT(*) FROM club_items i
            WHERE i.club_id = b.club_id AND i.brand = b.name COLLATE NOCASE) AS item_count
         FROM club_item_brands b WHERE ${where} ORDER BY b.name COLLATE NOCASE`,
        params
      )
      .map(r => ({
        id: r.id,
        clubId: r.club_id,
        name: r.name,
        itemCount: r.item_count ?? 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
  }

  /** Marques du club, par nom */
  public listBrands(clubId: string): ClubItemBrandDef[] {
    if (!this.sql.db) return [];
    return this.brandSelect('b.club_id = ?', [clubId]);
  }

  private getBrand(id: string): ClubItemBrandDef | null {
    return this.brandSelect('b.id = ?', [id])[0] ?? null;
  }

  private checkBrandName(clubId: string, name: unknown, exceptId?: string): string {
    const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
    if (!clean) throw new Error('Nom de marque requis');
    const dup = this.sql.queryOne<{ id: string }>(
      'SELECT id FROM club_item_brands WHERE club_id = ? AND name = ? COLLATE NOCASE',
      [clubId, clean]
    );
    if (dup && dup.id !== exceptId) throw new Error('Cette marque existe déjà');
    return clean;
  }

  public createBrand(clubId: string, name: string): ClubItemBrandDef {
    this.ensureOpen();
    this.assertUnlocked(clubId);
    const clean = this.checkBrandName(clubId, name);
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      'INSERT INTO club_item_brands (id, club_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, clubId, clean, now, now]
    );
    return this.getBrand(id)!;
  }

  /** Renommage : les fiches portant l'ancienne marque prennent le nouveau nom */
  public renameBrand(id: string, name: string): ClubItemBrandDef | null {
    this.ensureOpen();
    const cur = this.getBrand(id);
    if (!cur) return null;
    this.assertUnlocked(cur.clubId);
    const clean = this.checkBrandName(cur.clubId, name, id);
    this.sql.transaction(() => {
      this.sql.run('UPDATE club_item_brands SET name = ?, updated_at = ? WHERE id = ?', [
        clean,
        new Date().toISOString(),
        id,
      ]);
      this.sql.run(
        'UPDATE club_items SET brand = ?, updated_at = ? WHERE club_id = ? AND brand = ? COLLATE NOCASE',
        [clean, new Date().toISOString(), cur.clubId, cur.name]
      );
    });
    return this.getBrand(id);
  }

  /** Refusée tant qu'une fiche porte la marque */
  public deleteBrand(id: string): void {
    this.ensureOpen();
    const cur = this.getBrand(id);
    if (!cur) return;
    this.assertUnlocked(cur.clubId);
    if (cur.itemCount > 0) {
      throw new Error(
        `Marque utilisée par ${cur.itemCount} fiche(s) : changez-les avant de la supprimer`
      );
    }
    this.sql.run('DELETE FROM club_item_brands WHERE id = ?', [id]);
  }
}
