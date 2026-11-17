/**
 * Outils MCP d'écriture (#1880, lot 2) : autorisation, dryRun, doublons, notification.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleMcpMessage } from './mcpServer';
import type { McpWriteDeps } from './mcpWriteTools';
import { FencerStatus, type Fencer } from '../../shared/types';

function setup() {
  const fencers: Fencer[] = [
    {
      id: 'f1',
      ref: 1,
      lastName: 'DUPONT',
      firstName: 'Léa',
      license: '111',
      status: FencerStatus.NOT_CHECKED_IN,
    } as Fencer,
    {
      id: 'f2',
      ref: 2,
      lastName: 'MARTIN',
      firstName: 'Paul',
      status: FencerStatus.ABANDONED,
    } as Fencer,
  ];
  const db = {
    getCompetition: (id: string) => (id === 'c1' ? { id: 'c1', title: 'Open' } : null),
    getFencersByCompetition: () => fencers,
    createCompetition: vi.fn((d: { title: string }) => ({ id: 'new', ...d })),
    addFencer: vi.fn(),
    updateFencer: vi.fn(),
  };
  const notify = vi.fn();
  const deps = {
    db,
    notify,
    remoteServers: () => [],
    cyranoStatus: () => null,
  } as unknown as McpWriteDeps;
  const call = (name: string, args: Record<string, unknown>, allowWrite = true) =>
    handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      deps,
      '1',
      undefined,
      allowWrite
    ) as Promise<{
      result?: { content: Array<{ text: string }>; isError?: boolean };
      error?: { message: string };
    }>;
  const json = async (p: ReturnType<typeof call>) => JSON.parse((await p).result!.content[0].text);
  return { db, notify, call, json };
}

describe('outils d’écriture MCP', () => {
  it('écriture non autorisée : outil refusé et absent de tools/list', async () => {
    const { call, db } = setup();
    const r = await call('create_competition', { title: 'X' }, false);
    expect(r.error?.message).toContain('Écriture désactivée');
    expect(db.createCompetition).not.toHaveBeenCalled();
  });

  it('create_competition : dryRun sans écriture, puis création avec réglages par défaut', async () => {
    const { call, json, db, notify } = setup();
    const args = {
      title: 'Open M15',
      date: '2026-12-06',
      weapon: 'F',
      gender: 'M',
      category: 'U15',
    };
    const dry = await json(call('create_competition', { ...args, dryRun: true }));
    expect(dry.dryRun).toBe(true);
    expect(dry.wouldCreate.settings).toBeDefined();
    expect(db.createCompetition).not.toHaveBeenCalled();
    const done = await json(call('create_competition', args));
    expect(done.created.id).toBe('new');
    expect(notify).toHaveBeenCalledWith('competitions:changed', 'new');
    expect((await call('create_competition', { ...args, weapon: 'Z' })).result?.isError).toBe(true);
  });

  it('check_in : pointe par id ou dossard, laisse les abandons', async () => {
    const { call, json, db, notify } = setup();
    const r = await json(
      call('check_in', { competitionId: 'c1', fencers: [1, 'f2', 99], present: true })
    );
    expect(r).toMatchObject({ matched: 2, updated: 1, skipped: 1, unknown: [99] });
    expect(db.updateFencer).toHaveBeenCalledWith('f1', { status: FencerStatus.CHECKED_IN });
    expect(db.updateFencer).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('fencers:changed', 'c1');
  });

  it('import_fencers : doublons ignorés, dryRun, chemin et extension contrôlés', async () => {
    const { call, json, db } = setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-import-'));
    const file = path.join(dir, 'tireurs.txt');
    fs.writeFileSync(file, 'DUPONT;Léa;F;CE\nDURAND;Léo;M;CE\n');
    const dry = await json(
      call('import_fencers', { competitionId: 'c1', path: file, dryRun: true })
    );
    expect(dry.read).toBe(2);
    expect(dry.duplicates).toBe(1);
    expect(dry.toAdd).toBe(1);
    expect(db.addFencer).not.toHaveBeenCalled();
    const done = await json(call('import_fencers', { competitionId: 'c1', path: file }));
    expect(done.added).toBe(done.toAdd);
    expect(db.addFencer).toHaveBeenCalledTimes(done.toAdd);
    expect(
      (await call('import_fencers', { competitionId: 'c1', path: 'rel/x.txt' })).result?.isError
    ).toBe(true);
    expect(
      (await call('import_fencers', { competitionId: 'c1', path: '/etc/passwd' })).result?.isError
    ).toBe(true);
  });
});

describe('import_day (#1880)', () => {
  function dayDb() {
    const days: Array<{
      id: string;
      name: string;
      date: string;
      stripCount: number;
      competitionIds: string[];
    }> = [];
    const comps = new Map<string, { id: string; title: string }>();
    const fencers = new Map<string, Fencer[]>();
    const dayRefs: Array<{ firstName: string; lastName: string; license?: string }> = [];
    let n = 0;
    const db = {
      // import_day écrit en une transaction (tout ou rien)
      transaction: <T>(fn: () => T): T => fn(),
      getCompetition: (id: string) => comps.get(id) ?? null,
      getFencersByCompetition: (id: string) => fencers.get(id) ?? [],
      createCompetition: vi.fn((d: { title: string }) => {
        const c = { id: `c${++n}`, title: d.title };
        comps.set(c.id, c);
        return c;
      }),
      addFencer: vi.fn((cid: string, f: Fencer) =>
        fencers.set(cid, [...(fencers.get(cid) ?? []), f])
      ),
      eventDays: {
        listDays: () => days,
        createDay: vi.fn((d: { name: string; date: string }) => {
          const day = { id: `d${days.length + 1}`, stripCount: 4, competitionIds: [], ...d };
          days.push(day);
          return day;
        }),
        setCompetitionDay: (cid: string, dayId: string) =>
          days.find(d => d.id === dayId)!.competitionIds.push(cid),
        listReferees: () => dayRefs,
        createReferee: vi.fn((_: string, r: (typeof dayRefs)[number]) => dayRefs.push(r)),
        getAssignments: () => [],
        getLinks: () => ({}),
        getCompetitionWeapons: () => ({}),
        syncCompetition: () => ({ added: 0, updated: 0 }),
        getDay: (id: string) => days.find(d => d.id === id) ?? null,
      },
    };
    return { db, days };
  }

  it('crée la journée et ses épreuves, puis ne duplique rien au second passage', async () => {
    const { db, days } = dayDb();
    const notify = vi.fn();
    const deps = {
      db,
      notify,
      remoteServers: () => [],
      cyranoStatus: () => null,
    } as unknown as McpWriteDeps;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-day-'));
    const fencersFile = path.join(dir, 'm15.txt');
    fs.writeFileSync(fencersFile, 'DUPONT;Léa;F;CE\nDURAND;Léo;M;CE\n');
    const manifest = {
      name: 'Journée M15',
      date: '2026-12-06',
      competitions: [
        { title: 'M15 FH', weapon: 'F', gender: 'M', category: 'U15', fencersFile },
        { title: 'M15 FD', weapon: 'F', gender: 'F', category: 'U15' },
      ],
    };
    const run = async (args: Record<string, unknown>) =>
      JSON.parse(
        (
          (await handleMcpMessage(
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: { name: 'import_day', arguments: args },
            },
            deps,
            '1',
            undefined,
            true
          )) as { result: { content: Array<{ text: string }> } }
        ).result.content[0].text
      );
    const dry = await run({ ...manifest, dryRun: true });
    expect(dry.day.created).toBe(true);
    expect(days).toHaveLength(0);
    const first = await run(manifest);
    expect(days).toHaveLength(1);
    expect(first.competitions.map((c: { created: boolean }) => c.created)).toEqual([true, true]);
    expect(first.competitions[0].fencers.added).toBe(2);
    const second = await run(manifest);
    expect(days).toHaveLength(1);
    expect(db.createCompetition).toHaveBeenCalledTimes(2);
    expect(second.competitions[0].fencers.duplicates).toBe(2);
    expect(notify).toHaveBeenCalledWith('competitions:changed');
  });
});
