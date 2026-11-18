/**
 * Liste des compétitions : nombre de tireurs fourni sans charger les tireurs (#1994)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '..';
import { hasNodeSqlite } from '../testing/nodeSqliteDatabase';
import { Category, FencerStatus, Gender, Weapon } from '../../shared/types';

vi.mock('better-sqlite3-multiple-ciphers', async () => ({
  default: (await import('../testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

d('getAllCompetitions : nombre de tireurs (#1994)', () => {
  let db: DatabaseManager;
  beforeEach(async () => {
    db = new DatabaseManager(':memory:');
    await db.open(':memory:');
  });
  afterEach(() => db.close());

  const create = (title: string) =>
    db.createCompetition({
      title,
      date: new Date('2026-12-06'),
      weapon: Weapon.EPEE,
      gender: Gender.MALE,
      category: Category.SENIOR,
    });

  it('décompte par compétition, tireurs non chargés', () => {
    const a = create('A');
    const b = create('B');
    for (let i = 0; i < 3; i++) {
      db.addFencer(a.id, { lastName: `N${i}`, firstName: 'P', status: FencerStatus.CHECKED_IN });
    }
    const list = db.getAllCompetitions();
    const byId = (id: string) => list.find(c => c.id === id)!;
    expect(byId(a.id).fencerCount).toBe(3);
    expect(byId(b.id).fencerCount).toBe(0);
    expect(byId(a.id).fencers).toEqual([]);
  });
});
