/**
 * RGPD (#1882) : recherche, export, anonymisation, effacement, conservation.
 * SQLite réel (node:sqlite en mémoire).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyRepo, identityKey, scrubIdentityInJson } from './privacyRepo';
import { CompetitionRepo } from './competitionRepo';
import { FencerRepo } from './fencerRepo';
import { ClubRepo } from './clubRepo';
import type { SqlExecutor } from './sqlExecutor';
import { ALL_MIGRATIONS } from '../migrations/migrations';
import { Category, Gender, Weapon } from '../../shared/types';

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

describe('identityKey / scrubIdentityInJson', () => {
  it('regroupe par licence, sinon par nom sans accents', () => {
    expect(identityKey({ license: ' 12 345 ', lastName: 'X' })).toBe('lic:12345');
    expect(
      identityKey({ lastName: 'Lefèvre', firstName: 'Zoé', birthDate: '2010-01-02T00:00' })
    ).toBe('name:lefevre|zoe|2010-01-02');
  });

  it("remplace l'identité des tireurs visés à toute profondeur, sans muter", () => {
    const state = {
      pools: [
        { fencers: [{ id: 'f1', lastName: 'DUPONT', firstName: 'Léa', license: '1', ref: 1 }] },
      ],
      other: { id: 'f2', lastName: 'MARTIN' },
      label: { id: 'f1', title: 'pas une identité' },
    };
    const r = scrubIdentityInJson(state, new Map([['f1', 'Anonyme 1']]));
    expect(r.changed).toBe(true);
    const out = r.value as typeof state;
    expect(out.pools[0].fencers[0]).toEqual({
      id: 'f1',
      lastName: 'Anonyme 1',
      firstName: '',
      ref: 1,
    });
    expect(out.other.lastName).toBe('MARTIN');
    expect(out.label).toEqual({ id: 'f1', title: 'pas une identité' });
    expect(state.pools[0].fencers[0].lastName).toBe('DUPONT');
  });
});

describe.skipIf(!DatabaseSync)('PrivacyRepo (#1882)', () => {
  let db: SqliteDb;
  let sql: SqlExecutor;
  let privacy: PrivacyRepo;
  let comps: CompetitionRepo;
  let fencers: FencerRepo;
  let club: ClubRepo;

  beforeEach(() => {
    db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    sql = makeSql(db);
    privacy = new PrivacyRepo(sql);
    comps = new CompetitionRepo(sql);
    fencers = new FencerRepo(sql);
    club = new ClubRepo(sql);
  });

  const competition = (title: string, date: string) =>
    comps.createCompetition({
      title,
      date: new Date(date),
      weapon: Weapon.EPEE,
      gender: Gender.MIXED,
      category: Category.SENIOR,
    });

  const fencer = (competitionId: string, lastName: string, firstName: string, license?: string) =>
    fencers.addFencer(competitionId, {
      lastName,
      firstName,
      license,
      birthDate: new Date('2008-05-04'),
      photo: 'data:image/png;base64,AAAA',
    });

  /** Deux compétitions, la même tireuse (licence 777) + un adversaire, un match, une signature */
  const seed = () => {
    const c1 = competition('Open 2020', '2020-03-01');
    const c2 = competition('Open 2025', '2025-03-01');
    const a1 = fencer(c1.id, 'Lefèvre', 'Zoé', '777');
    const a2 = fencer(c2.id, 'LEFEVRE', 'Zoe', '777');
    const b1 = fencer(c1.id, 'Martin', 'Paul', '888');
    const now = new Date().toISOString();
    sql.run(
      `INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, score_a, score_b, max_score, created_at, updated_at)
       VALUES ('m1', 1, 'p1', ?, ?, '{"value":5}', '{"value":3}', 5, ?, ?)`,
      [a1.id, b1.id, now, now]
    );
    sql.run(
      `INSERT INTO match_touches (id, match_id, fencer_id, zone, points, timestamp) VALUES ('t1', 'm1', ?, 'A', 1, ?)`,
      [a1.id, now]
    );
    sql.run(
      `INSERT INTO pool_signatures (id, pool_id, fencer_id, signature_data, signed_at) VALUES ('s1', 'p1', ?, 'data:sig', ?)`,
      [a1.id, now]
    );
    sql.run(`INSERT INTO session_state (competition_id, state_json, updated_at) VALUES (?, ?, ?)`, [
      c1.id,
      JSON.stringify({
        pools: [{ fencers: [{ id: a1.id, lastName: 'Lefèvre', firstName: 'Zoé' }] }],
      }),
      now,
    ]);
    const cid = club.createClub({ name: 'CE Test' }).id;
    const m = club.createMember(cid, { firstName: 'Zoé', lastName: 'Lefèvre', license: '777' });
    return { c1, c2, a1, a2, b1, member: m };
  };

  it('retrouve une personne dans toutes les compétitions et le club (licence)', () => {
    const { a1, a2, member } = seed();
    const found = privacy.findPersons('lefevre');
    expect(found).toHaveLength(1);
    expect(found[0].fencers.map(f => f.fencerId).sort()).toEqual([a1.id, a2.id].sort());
    expect(found[0].members.map(m => m.memberId)).toEqual([member.id]);
    expect(privacy.findPersons('777')).toHaveLength(1);
    expect(privacy.findPersons('z')).toEqual([]);
  });

  it('exporte toutes les données de la personne (accès / portabilité)', () => {
    const { a1, a2, member } = seed();
    const out = privacy.exportPerson({
      fencerIds: [a1.id, a2.id, 'inconnu'],
      memberIds: [member.id],
    });
    expect(out.format).toBe('bellepoule-modern/personal-data');
    expect(out.competitions).toHaveLength(2);
    const first = out.competitions.find(c => c.fencer.id === a1.id)!;
    expect(first.competition?.title).toBe('Open 2020');
    expect(first.related.matches[0].opponent_name).toBe('Martin Paul');
    expect(first.related.match_touches).toHaveLength(1);
    expect(first.related.pool_signatures).toHaveLength(1);
    expect(out.club[0].member.license).toBe('777');
  });

  it('anonymise : identité remplacée partout, résultats conservés', () => {
    const { c1, a1, a2, b1, member } = seed();
    const r = privacy.anonymizePerson(
      { fencerIds: [a1.id, a2.id], memberIds: [member.id] },
      'Anonyme X'
    );
    expect(r).toEqual({ fencers: 2, members: 1, pseudonym: 'Anonyme X' });
    const row = sql.queryOne<Record<string, unknown>>('SELECT * FROM fencers WHERE id = ?', [
      a1.id,
    ])!;
    expect(row).toMatchObject({
      last_name: 'Anonyme X',
      first_name: '',
      birth_date: null,
      license: null,
      photo: null,
    });
    expect(sql.queryOne('SELECT id FROM matches WHERE id = ?', ['m1'])).not.toBeNull();
    expect(sql.queryAll('SELECT * FROM pool_signatures')).toHaveLength(0);
    const state = sql.queryOne<{ state_json: string }>(
      'SELECT state_json FROM session_state WHERE competition_id = ?',
      [c1.id]
    )!;
    expect(state.state_json).not.toContain('Lef');
    const m = sql.queryOne<Record<string, unknown>>('SELECT * FROM club_members WHERE id = ?', [
      member.id,
    ])!;
    expect(m).toMatchObject({ last_name: 'Anonyme X', license: null, photo: null });
    expect(m.anonymized_at).toBeTruthy();
    // L'adversaire n'est pas touché
    expect(fencers.getFencer(b1.id)?.lastName).toBe('Martin');
    expect(privacy.findPersons('lefevre')).toEqual([]);
  });

  it('efface la personne de toutes les compétitions et du club', () => {
    const { c1, a1, a2, b1, member } = seed();
    const r = privacy.erasePerson({ fencerIds: [a1.id, a2.id], memberIds: [member.id] });
    expect(r).toEqual({ fencers: 2, members: 1 });
    expect(sql.queryAll('SELECT * FROM fencers WHERE license = ?', ['777'])).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM matches')).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM match_touches')).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM pool_signatures')).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM club_members')).toHaveLength(0);
    const state = sql.queryOne<{ state_json: string }>(
      'SELECT state_json FROM session_state WHERE competition_id = ?',
      [c1.id]
    )!;
    expect(state.state_json).not.toContain('Lef');
    expect(fencers.getFencer(b1.id)).not.toBeNull();
  });

  it('liste les compétitions et membres au-delà de la durée de conservation', () => {
    const { c1, member } = seed();
    sql.run(`UPDATE club_members SET updated_at = '2019-01-01T00:00:00.000Z' WHERE id = ?`, [
      member.id,
    ]);
    const r = privacy.listRetentionCandidates(
      '2024-01-01T00:00:00.000Z',
      '2023-01-01T00:00:00.000Z'
    );
    expect(r.competitions.map(c => c.id)).toEqual([c1.id]);
    expect(r.competitions[0].fencerCount).toBe(2);
    expect(r.members.map(m => m.id)).toEqual([member.id]);
    // Pas de durée → rien
    expect(privacy.listRetentionCandidates(null, null)).toEqual({ competitions: [], members: [] });
  });

  it('anonymise une compétition échue, qui sort de la liste des candidats', () => {
    const { c1 } = seed();
    expect(privacy.anonymizeCompetition(c1.id)).toBe(2);
    const names = sql
      .queryAll<{ last_name: string }>('SELECT last_name FROM fencers WHERE competition_id = ?', [
        c1.id,
      ])
      .map(r => r.last_name)
      .sort();
    expect(names).toEqual(['Anonyme 1', 'Anonyme 2']);
    expect(privacy.listRetentionCandidates('2024-01-01T00:00:00.000Z', null).competitions).toEqual(
      []
    );
  });

  it('supprime une compétition sans laisser de données orphelines', () => {
    const { c1, c2 } = seed();
    comps.deleteCompetition(c1.id);
    expect(sql.queryAll('SELECT * FROM fencers WHERE competition_id = ?', [c1.id])).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM matches')).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM match_touches')).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM pool_signatures')).toHaveLength(0);
    expect(sql.queryAll('SELECT * FROM session_state')).toHaveLength(0);
    expect(comps.getCompetition(c2.id)).not.toBeNull();
    expect(sql.queryAll('SELECT * FROM fencers WHERE competition_id = ?', [c2.id])).toHaveLength(1);
  });
});
