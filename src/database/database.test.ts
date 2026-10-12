import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseManager, safeJsonParse } from './index';
import { ValidationError } from './validation';

let mockDb: any;

const makeStmt = (overrides: Partial<{ get: any; all: any; run: any }> = {}) => ({
  get: vi.fn().mockReturnValue(null),
  all: vi.fn().mockReturnValue([]),
  run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
  ...overrides,
});

vi.mock('better-sqlite3', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn().mockImplementation(function (this: any) {
    return mockDb;
  }),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

vi.mock('./migrations', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MigrationManager: vi.fn().mockImplementation(function (this: any) {
    return { run: vi.fn().mockReturnValue(0) };
  }),
}));

vi.mock('./migrations/migrations', () => ({
  ALL_MIGRATIONS: [],
}));

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb = {
      pragma: vi.fn(),
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue(makeStmt()),
      close: vi.fn(),
      backup: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn().mockImplementation(
        (fn: any) =>
          (...args: any[]) =>
            fn(...args)
      ),
    };
    manager = new DatabaseManager('/tmp/test-bellepoule.db');
  });

  describe('initialize (open)', () => {
    it('crée une Database et configure les pragmas', async () => {
      const Database = (await import('better-sqlite3')).default as any;
      await manager.open();
      expect(Database).toHaveBeenCalledWith('/tmp/test-bellepoule.db');
      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('foreign_keys = ON');
    });

    it('configure busy_timeout et synchronous NORMAL (#1007)', async () => {
      await manager.open();
      expect(mockDb.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
      expect(mockDb.pragma).toHaveBeenCalledWith('busy_timeout = 5000');
    });

    it('lance runMigrations après ouverture', async () => {
      const { MigrationManager } = await import('./migrations');
      await manager.open();
      expect(MigrationManager).toHaveBeenCalled();
    });

    it('isOpen() retourne true après open()', async () => {
      await manager.open();
      expect(manager.isOpen()).toBe(true);
    });

    it('isOpen() retourne false avant open()', () => {
      expect(manager.isOpen()).toBe(false);
    });
  });

  describe('createCompetition', () => {
    beforeEach(async () => {
      await manager.open();
    });

    it('insère une compétition et retourne un objet avec id', () => {
      const now = new Date().toISOString();
      const compRow = {
        id: 'comp-uuid-1',
        title: 'Championnat Test',
        short_title: null,
        date: now,
        location: 'Paris',
        organizer: null,
        weapon: 'E',
        gender: 'M',
        category: 'SEN',
        championship: null,
        color: '#3B82F6',
        current_phase_index: 0,
        is_team_event: 0,
        status: 'active',
        settings: '{}',
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(
        makeStmt({
          get: vi.fn().mockReturnValue(compRow),
        })
      );
      const result = manager.createCompetition({ title: 'Championnat Test', location: 'Paris' });
      expect(mockDb.prepare).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('utilise un id fourni si présent', () => {
      const customId = 'my-custom-id';
      const now = new Date().toISOString();
      const compRow = {
        id: customId,
        title: 'Test',
        short_title: null,
        date: now,
        location: '',
        organizer: null,
        weapon: 'E',
        gender: 'M',
        category: 'SEN',
        championship: null,
        color: '#3B82F6',
        current_phase_index: 0,
        is_team_event: 0,
        status: null,
        settings: '{}',
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(makeStmt({ get: vi.fn().mockReturnValue(compRow) }));
      const result = manager.createCompetition({ id: customId });
      expect(result.id).toBe(customId);
    });
  });

  describe('getFencer', () => {
    beforeEach(async () => {
      await manager.open();
    });

    it("retourne null si le tireur n'est pas trouvé", () => {
      mockDb.prepare.mockReturnValue(makeStmt({ get: vi.fn().mockReturnValue(null) }));
      const result = manager.getFencer('nonexistent-id');
      expect(result).toBeNull();
    });

    it('retourne un objet Fencer si trouvé', () => {
      const now = new Date().toISOString();
      const fencerRow = {
        id: 'fencer-1',
        ref: 1,
        last_name: 'Dupont',
        first_name: 'Jean',
        birth_date: null,
        gender: 'M',
        nationality: 'FRA',
        region: null,
        club: 'Club Paris',
        license: '12345',
        ranking: 10,
        status: 'Q',
        seed_number: null,
        final_ranking: null,
        pool_stats: null,
        photo: null,
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(makeStmt({ get: vi.fn().mockReturnValue(fencerRow) }));
      const result = manager.getFencer('fencer-1');
      expect(result).not.toBeNull();
      expect(result!.lastName).toBe('Dupont');
      expect(result!.firstName).toBe('Jean');
    });
  });

  describe('createMatch', () => {
    beforeEach(async () => {
      await manager.open();
    });

    it('insère un match avec les champs requis', () => {
      const now = new Date().toISOString();
      const matchRow = {
        id: 'match-uuid-1',
        number: 1,
        pool_id: 'pool-1',
        fencer_a_id: null,
        fencer_b_id: null,
        score_a: null,
        score_b: null,
        max_score: 5,
        status: 'not_started',
        table_id: null,
        round: null,
        referee_id: null,
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(makeStmt({ get: vi.fn().mockReturnValue(matchRow) }));
      const result = manager.createMatch({ number: 1, maxScore: 5 }, 'pool-1');
      expect(mockDb.prepare).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe('updateMatch', () => {
    beforeEach(async () => {
      await manager.open();
    });

    it('appelle prepare avec score_a pour scoreA', () => {
      manager.updateMatch('match-id', {
        scoreA: {
          value: 5,
          isVictory: true,
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        },
      });
      const calls = (mockDb.prepare as any).mock.calls.map((c: any) => c[0] as string);
      expect(calls.some((sql: string) => sql.includes('score_a'))).toBe(true);
    });

    it('appelle prepare avec score_b pour scoreB', () => {
      manager.updateMatch('match-id', {
        scoreB: {
          value: 3,
          isVictory: false,
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        },
      });
      const calls = (mockDb.prepare as any).mock.calls.map((c: any) => c[0] as string);
      expect(calls.some((sql: string) => sql.includes('score_b'))).toBe(true);
    });

    it('appelle prepare avec status pour status', () => {
      manager.updateMatch('match-id', { status: 'finished' as any });
      const calls = (mockDb.prepare as any).mock.calls.map((c: any) => c[0] as string);
      expect(calls.some((sql: string) => sql.includes('status'))).toBe(true);
    });
  });

  describe('getPoolsByPhase', () => {
    beforeEach(async () => {
      await manager.open();
    });

    it('retourne un tableau vide si aucune poule', () => {
      mockDb.prepare.mockReturnValue(makeStmt({ all: vi.fn().mockReturnValue([]) }));
      const result = manager.getPoolsByPhase('phase-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('retourne un tableau de poules si des poules existent', () => {
      const now = new Date().toISOString();
      const poolRow = {
        id: 'pool-1',
        phase_id: 'phase-1',
        number: 1,
        is_complete: 0,
        has_error: 0,
        referee_id: null,
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(
        makeStmt({
          all: vi.fn().mockReturnValueOnce([poolRow]).mockReturnValue([]),
          get: vi.fn().mockReturnValue(null),
        })
      );
      const result = manager.getPoolsByPhase('phase-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pool-1');
    });
  });

  describe('arbitres multiples par poule (#908)', () => {
    const now = new Date().toISOString();
    const refRow = (id: string) => ({
      id,
      ref: 1,
      name: `Prénom ${id}`,
      created_at: now,
      updated_at: now,
    });

    beforeEach(async () => {
      await manager.open();
    });

    it('updatePoolReferees stocke principal + liste JSON dédupliquée', () => {
      const run = vi.fn().mockReturnValue({ changes: 1 });
      mockDb.prepare.mockReturnValue(makeStmt({ run }));
      manager.updatePoolReferees('pool-1', ['r1', 'r2', 'r1']);
      expect(run).toHaveBeenCalledWith(
        'r1',
        JSON.stringify(['r1', 'r2']),
        expect.any(String),
        'pool-1'
      );
    });

    it('updatePoolReferees([]) efface les arbitres', () => {
      const run = vi.fn().mockReturnValue({ changes: 1 });
      mockDb.prepare.mockReturnValue(makeStmt({ run }));
      manager.updatePoolReferees('pool-1', []);
      expect(run).toHaveBeenCalledWith(null, null, expect.any(String), 'pool-1');
    });

    it("getPoolsByPhase restitue tous les arbitres de referee_ids dans l'ordre", () => {
      const poolRow = {
        id: 'pool-1',
        phase_id: 'phase-1',
        number: 1,
        is_complete: 0,
        has_error: 0,
        referee_id: 'r2',
        referee_ids: JSON.stringify(['r2', 'r1']),
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(
        makeStmt({
          all: vi.fn().mockReturnValueOnce([poolRow]).mockReturnValue([]),
          get: vi.fn().mockImplementation((id: string) => refRow(id)),
        })
      );
      const [pool] = manager.getPoolsByPhase('phase-1');
      expect(pool.referees.map(r => r.id)).toEqual(['r2', 'r1']);
    });

    it('getPoolsByPhase se replie sur referee_id sans referee_ids', () => {
      const poolRow = {
        id: 'pool-1',
        phase_id: 'phase-1',
        number: 1,
        is_complete: 0,
        has_error: 0,
        referee_id: 'r1',
        referee_ids: null,
        created_at: now,
        updated_at: now,
      };
      mockDb.prepare.mockReturnValue(
        makeStmt({
          all: vi.fn().mockReturnValueOnce([poolRow]).mockReturnValue([]),
          get: vi.fn().mockImplementation((id: string) => refRow(id)),
        })
      );
      const [pool] = manager.getPoolsByPhase('phase-1');
      expect(pool.referees.map(r => r.id)).toEqual(['r1']);
    });
  });

  describe('syncPoolSnapshot (#905)', () => {
    const snapshot = {
      id: 'pool-0',
      number: 1,
      fencerIds: ['f1', 'f2'],
      matches: [{ id: 'm1', number: 1, fencerAId: 'f2', fencerBId: 'f1', maxScore: 5 }],
    };
    const sqlCalls = () => mockDb.prepare.mock.calls.map((c: any[]) => String(c[0]));

    beforeEach(async () => {
      await manager.open();
    });

    it('recrée phase et poule absentes de la base puis insère tireurs et matchs', () => {
      mockDb.prepare.mockReturnValue(makeStmt({ get: vi.fn().mockReturnValue(null) }));
      manager.syncPoolSnapshot('comp-1', snapshot);
      const sql = sqlCalls();
      expect(sql.some((s: string) => s.includes('INSERT INTO phases'))).toBe(true);
      expect(sql.some((s: string) => s.includes('INSERT INTO pools'))).toBe(true);
      expect(sql.some((s: string) => s.includes('INSERT OR REPLACE INTO pool_fencers'))).toBe(true);
      expect(sql.some((s: string) => s.includes('INSERT OR IGNORE INTO matches'))).toBe(true);
    });

    it('ne recrée pas une poule déjà présente', () => {
      mockDb.prepare.mockReturnValue(makeStmt({ get: vi.fn().mockReturnValue({ id: 'pool-0' }) }));
      manager.syncPoolSnapshot('comp-1', snapshot);
      const sql = sqlCalls();
      expect(sql.some((s: string) => s.includes('INSERT INTO pools'))).toBe(false);
      expect(sql.some((s: string) => s.includes('INSERT INTO phases'))).toBe(false);
    });
  });

  describe('Validation – ID invalide', () => {
    beforeEach(async () => {
      await manager.open();
    });

    it('saveSessionState lance ValidationError pour ID vide', () => {
      expect(() => manager.saveSessionState('', {})).toThrow(ValidationError);
    });

    it('getSessionState lance ValidationError pour ID vide', () => {
      expect(() => manager.getSessionState('')).toThrow(ValidationError);
    });

    it('clearSessionState lance ValidationError pour ID vide', () => {
      expect(() => manager.clearSessionState('')).toThrow(ValidationError);
    });

    it('saveSessionState lance ValidationError pour ID > 255 chars', () => {
      expect(() => manager.saveSessionState('a'.repeat(256), {})).toThrow(ValidationError);
    });
  });

  describe('close', () => {
    it('ferme la DB et isOpen() retourne false', async () => {
      await manager.open();
      expect(manager.isOpen()).toBe(true);
      manager.close();
      expect(manager.isOpen()).toBe(false);
      expect(mockDb.close).toHaveBeenCalled();
    });
  });
});

describe('DatabaseManager — historique tableau (#927)', () => {
  let manager: DatabaseManager;
  let auditRuns: unknown[][];

  const setup = async (existingRows: any[]) => {
    auditRuns = [];
    mockDb = {
      pragma: vi.fn(),
      exec: vi.fn(),
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO score_audit_log')) {
          return makeStmt({
            run: vi.fn().mockImplementation((...args: unknown[]) => {
              auditRuns.push(args);
            }),
          });
        }
        if (sql.includes('SELECT id, score_a, score_b FROM matches')) {
          return makeStmt({ all: vi.fn().mockReturnValue(existingRows) });
        }
        return makeStmt();
      }),
      close: vi.fn(),
      backup: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn().mockImplementation(
        (fn: any) =>
          (...args: any[]) =>
            fn(...args)
      ),
    };
    manager = new DatabaseManager('/tmp/test-bellepoule.db');
    await manager.open();
  };

  const match = (scoreA: number | null, scoreB: number | null) => ({
    matchId: 'm1',
    round: 4,
    position: 0,
    fencerAId: 'a',
    fencerBId: 'b',
    scoreA: scoreA != null ? { value: scoreA, isVictory: scoreA > (scoreB ?? 0) } : null,
    scoreB: scoreB != null ? { value: scoreB, isVictory: (scoreB ?? 0) > (scoreA ?? 0) } : null,
    status: scoreA != null ? 'finished' : 'not_started',
  });

  it('journalise une nouvelle saisie de score tableau', async () => {
    await setup([{ id: 'c1-m1', score_a: null, score_b: null }]);
    manager.upsertMultipleTableauMatches('c1', [match(15, 10)]);
    expect(auditRuns).toHaveLength(1);
    expect(auditRuns[0][1]).toBe('c1-m1');
    expect(auditRuns[0][9]).toBe('tableau_entry');
  });

  it('ne journalise pas si le score est inchangé', async () => {
    await setup([
      {
        id: 'c1-m1',
        score_a: JSON.stringify({ value: 15 }),
        score_b: JSON.stringify({ value: 10 }),
      },
    ]);
    manager.upsertMultipleTableauMatches('c1', [match(15, 10)]);
    expect(auditRuns).toHaveLength(0);
  });

  it('ne journalise pas un match sans score', async () => {
    await setup([]);
    manager.upsertMultipleTableauMatches('c1', [match(null, null)]);
    expect(auditRuns).toHaveLength(0);
  });
});

describe('safeJsonParse (#1007)', () => {
  it('parse un JSON valide', () => {
    expect(safeJsonParse('{"value":5}', null)).toEqual({ value: 5 });
  });

  it('retourne le repli sur JSON corrompu sans lever', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(safeJsonParse('{corrompu', null)).toBeNull();
    expect(safeJsonParse('[', [])).toEqual([]);
    spy.mockRestore();
  });

  it('retourne le repli sur null / vide', () => {
    expect(safeJsonParse(null, 'x')).toBe('x');
    expect(safeJsonParse('', 'x')).toBe('x');
  });
});

describe('cache de statements borné (#1007)', () => {
  it('ne dépasse pas la taille max et réutilise les statements', async () => {
    mockDb = {
      pragma: vi.fn(),
      prepare: vi.fn().mockImplementation(() => makeStmt()),
      close: vi.fn(),
      transaction: vi.fn(),
    };
    const m = new DatabaseManager('/tmp/test-bellepoule.db');
    await m.open();
    const prep = (m as any).prepare.bind(m);
    for (let i = 0; i < 600; i++) prep(`SELECT ${i}`);
    expect((m as any).stmtCache.size).toBe(500);
    const before = mockDb.prepare.mock.calls.length;
    prep('SELECT 599');
    expect(mockDb.prepare.mock.calls.length).toBe(before);
    prep('SELECT 0');
    expect(mockDb.prepare.mock.calls.length).toBe(before + 1);
  });
});
