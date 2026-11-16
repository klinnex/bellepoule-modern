/**
 * Mode Club : inventaire (matériel, quantités, prêts, retours, effacements). SQLite réel.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ClubRepo } from './clubRepo';
import { ClubInventoryRepo } from './clubInventoryRepo';
import type { SqlExecutor } from './sqlExecutor';
import { ALL_MIGRATIONS } from '../migrations/migrations';

let DatabaseSync: (new (path: string) => SqliteDb) | null = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}

interface SqliteStmt {
  run(...p: unknown[]): unknown;
  get(...p: unknown[]): unknown;
  all(...p: unknown[]): unknown[];
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
}

function makeSql(db: SqliteDb): SqlExecutor {
  return {
    db: db as unknown as SqlExecutor['db'],
    run: (sql, params = []) => db.prepare(sql).run(...params) as never,
    queryOne: <T>(sql: string, params: unknown[] = []) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
    queryAll: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as T[],
    transaction: fn => fn(),
  };
}

describe.skipIf(!DatabaseSync)('ClubInventoryRepo (inventaire du club)', () => {
  let club: ClubRepo;
  let inv: ClubInventoryRepo;
  let cid: string;
  let m1: string;
  let m2: string;

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    const sql = makeSql(db);
    club = new ClubRepo(sql);
    inv = new ClubInventoryRepo(sql);
    cid = club.createClub({ name: 'Club' }).id;
    m1 = club.createMember(cid, { firstName: 'Ada', lastName: 'Lovelace' }).id;
    m2 = club.createMember(cid, { firstName: 'Alan', lastName: 'Turing' }).id;
  });

  const masks = (over = {}) =>
    inv.createItem(cid, {
      name: 'Masque',
      category: 'mask',
      quantity: 3,
      purchasePrice: 40,
      ...over,
    });

  it('crée une fiche complète avec achat, garantie et emplacement', () => {
    const it = inv.createItem(cid, {
      name: 'Épée Uhlmann',
      category: 'weapon',
      brand: 'Uhlmann',
      serialNumber: 'SN-42',
      weapon: 'E' as never,
      purchaseDate: '2026-09-01',
      purchasePrice: 180,
      warrantyUntil: '2027-09-01',
      location: 'Armoire 2',
    });
    expect(it.purchaseDate).toBe('2026-09-01');
    expect(it.warrantyUntil).toBe('2027-09-01');
    expect(it.purchasePrice).toBe(180);
    expect(it.availableQuantity).toBe(1);
    expect(it.condition).toBe('good');
  });

  it('refuse une fiche sans nom ou avec une date invalide', () => {
    expect(() => inv.createItem(cid, { name: '', category: 'mask' })).toThrow();
    expect(() =>
      inv.createItem(cid, { name: 'x', category: 'mask', purchaseDate: '2026-13-45' })
    ).toThrow();
  });

  it('prête des exemplaires et décompte les disponibles', () => {
    const it = masks();
    const loan = inv.lendItem({ itemId: it.id, memberId: m1, quantity: 2, dueDate: '2099-01-01' });
    expect(loan.memberName).toBe('Ada Lovelace');
    expect(loan.quantity).toBe(2);
    expect(loan.overdue).toBe(false);
    const after = inv.getItem(it.id)!;
    expect(after.lentQuantity).toBe(2);
    expect(after.availableQuantity).toBe(1);
  });

  it('refuse un prêt au-delà des disponibles', () => {
    const it = masks();
    expect(() => inv.lendItem({ itemId: it.id, memberId: m1, quantity: 4 })).toThrow('disponible');
    inv.lendItem({ itemId: it.id, memberId: m1, quantity: 3 });
    expect(() => inv.lendItem({ itemId: it.id, memberId: m2 })).toThrow('disponible');
  });

  it('refuse le prêt à un tireur d’un autre club ou archivé, et le matériel réformé', () => {
    const other = club.createClub({ name: 'Autre' }).id;
    const stranger = club.createMember(other, { firstName: 'X', lastName: 'Y' }).id;
    const it = masks();
    expect(() => inv.lendItem({ itemId: it.id, memberId: stranger })).toThrow('Tireur inconnu');
    club.updateMember(m2, { active: false });
    expect(() => inv.lendItem({ itemId: it.id, memberId: m2 })).toThrow('archivé');
    const retired = masks({ name: 'Vieux', retired: true });
    expect(() => inv.lendItem({ itemId: retired.id, memberId: m1 })).toThrow('réformé');
  });

  it('refuse une échéance passée', () => {
    expect(() => inv.lendItem({ itemId: masks().id, memberId: m1, dueDate: '2000-01-01' })).toThrow(
      'passée'
    );
  });

  it('rend un prêt : état mis à jour sur le matériel, disponibilité rétablie', () => {
    const it = masks({ quantity: 1 });
    const loan = inv.lendItem({ itemId: it.id, memberId: m1 });
    const back = inv.returnLoan(loan.id, { conditionIn: 'worn', notes: 'sangle usée' })!;
    expect(back.returnedAt).toBeTruthy();
    expect(back.conditionIn).toBe('worn');
    const after = inv.getItem(it.id)!;
    expect(after.condition).toBe('worn');
    expect(after.availableQuantity).toBe(1);
    expect(() => inv.returnLoan(loan.id)).toThrow('déjà rendu');
  });

  it('refuse un retour antérieur au prêt', () => {
    const loan = inv.lendItem({ itemId: masks().id, memberId: m1 });
    expect(() => inv.returnLoan(loan.id, { returnedAt: '2000-01-01T00:00:00.000Z' })).toThrow(
      'précéder'
    );
  });

  it('signale les prêts en retard tant qu’ils ne sont pas rendus', () => {
    const it = masks();
    const loan = inv.lendItem({ itemId: it.id, memberId: m1, dueDate: '2099-01-01' });
    // Échéance dans le passé : on la force en base (le prêt est daté d’aujourd’hui)
    (inv as unknown as { sql: SqlExecutor }).sql.run(
      "UPDATE club_loans SET due_date = '2000-01-01' WHERE id = ?",
      [loan.id]
    );
    expect(inv.getLoan(loan.id)!.overdue).toBe(true);
    inv.returnLoan(loan.id);
    expect(inv.getLoan(loan.id)!.overdue).toBe(false);
  });

  it('liste les prêts d’un tireur et les filtre par statut', () => {
    const a = masks();
    const b = masks({ name: 'Gants' });
    const l1 = inv.lendItem({ itemId: a.id, memberId: m1 });
    inv.lendItem({ itemId: b.id, memberId: m2 });
    inv.returnLoan(l1.id);
    expect(inv.listLoans(cid, { memberId: m1 })).toHaveLength(1);
    expect(inv.listLoans(cid, { open: true })).toHaveLength(1);
    expect(inv.listLoans(cid, { open: false })).toHaveLength(1);
  });

  it('empêche de réduire la quantité sous le nombre prêté', () => {
    const it = masks();
    inv.lendItem({ itemId: it.id, memberId: m1, quantity: 2 });
    expect(() => inv.updateItem(it.id, { quantity: 1 })).toThrow('prêté');
    expect(inv.updateItem(it.id, { quantity: 2 })!.quantity).toBe(2);
  });

  it('met à jour partiellement sans perdre les autres champs', () => {
    const it = inv.createItem(cid, {
      name: 'Veste',
      category: 'jacket',
      brand: 'Leon Paul',
      purchasePrice: 90,
    });
    const u = inv.updateItem(it.id, { location: 'Sac 4' })!;
    expect(u.brand).toBe('Leon Paul');
    expect(u.purchasePrice).toBe(90);
    expect(u.location).toBe('Sac 4');
  });

  it('réforme sans supprimer : disparaît du prêt, reste dans l’historique', () => {
    const it = masks();
    inv.updateItem(it.id, { retired: true });
    expect(inv.listItems(cid, false)).toHaveLength(0);
    expect(inv.listItems(cid)).toHaveLength(1);
    expect(inv.getItem(it.id)!.availableQuantity).toBe(0);
  });

  it('supprimer du matériel prêté est refusé ; une fois rendu, la fiche et son historique partent', () => {
    const it = masks();
    const loan = inv.lendItem({ itemId: it.id, memberId: m1 });
    expect(() => inv.deleteItem(it.id)).toThrow('prêté');
    inv.returnLoan(loan.id);
    inv.deleteItem(it.id);
    expect(inv.getItem(it.id)).toBeNull();
    expect(inv.listLoans(cid)).toHaveLength(0);
  });

  it('supprime un prêt rendu, pas un prêt en cours', () => {
    const loan = inv.lendItem({ itemId: masks().id, memberId: m1 });
    expect(() => inv.deleteLoan(loan.id)).toThrow('en cours');
    inv.returnLoan(loan.id);
    inv.deleteLoan(loan.id);
    expect(inv.getLoan(loan.id)).toBeNull();
  });

  it('effacement RGPD d’un tireur : son prêt reste compté, sans identité', () => {
    const it = masks();
    const loan = inv.lendItem({ itemId: it.id, memberId: m1 });
    club.deleteMember(m1);
    const after = inv.getLoan(loan.id)!;
    expect(after.memberId).toBeNull();
    expect(after.memberName).toBeNull();
    expect(inv.getItem(it.id)!.lentQuantity).toBe(1);
  });

  it('effacement d’un club : matériel et prêts supprimés', () => {
    const it = masks();
    inv.lendItem({ itemId: it.id, memberId: m1 });
    club.deleteClub(cid);
    expect(inv.listItems(cid)).toHaveLength(0);
    expect(inv.listLoans(cid)).toHaveLength(0);
  });

  it('import en lot : ignore les n° de série déjà présents ou répétés dans le fichier', () => {
    inv.createItem(cid, { name: 'Épée A', category: 'weapon', serialNumber: 'SN-1' });
    const r = inv.importItems(cid, [
      { name: 'Épée A bis', category: 'weapon', serialNumber: 'sn-1' },
      { name: 'Épée B', category: 'weapon', serialNumber: 'SN-2' },
      { name: 'Épée B copie', category: 'weapon', serialNumber: 'SN-2' },
      { name: 'Masque sans série', category: 'mask' },
      { name: 'Masque sans série 2', category: 'mask' },
    ]);
    expect(r).toEqual({ created: 3, skipped: 2 });
    expect(inv.listItems(cid)).toHaveLength(4);
  });
});
