/**
 * Outils MCP ajoutés au socle (#1880) : orchestration sportive (lot 3), paramétrage du
 * poste et salles, arbitres, serveur distant, suppression. Base SQLite réelle (node:sqlite,
 * toutes les migrations), appels par le protocole (handleMcpMessage).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseManager } from '../../database';
import { hasNodeSqlite } from '../../database/testing/nodeSqliteDatabase';
import { handleMcpMessage } from './mcpServer';
import type { McpWriteDeps } from './mcpWriteTools';
import { runBatchImport } from '../batchImport';
import { rowsToXlsx } from '../xlsxToCsv';
import { remoteArenaCount } from '../domain/settings';

vi.mock('better-sqlite3-multiple-ciphers', async () => ({
  default: (await import('../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

interface Reply {
  result?: { content: Array<{ text: string }>; isError?: boolean; tools?: Array<{ name: string }> };
  error?: { message: string };
}

let db: DatabaseManager;
let deps: McpWriteDeps;
let notify: ReturnType<typeof vi.fn>;
let startRemote: ReturnType<typeof vi.fn>;
let stopRemote: ReturnType<typeof vi.fn>;
let dir: string;
let allowed: string;

const rpc = (method: string, params: Record<string, unknown>, allowWrite = true) =>
  handleMcpMessage(
    { jsonrpc: '2.0', id: 1, method, params },
    deps,
    '1',
    undefined,
    allowWrite
  ) as Promise<Reply>;
const call = (name: string, args: Record<string, unknown> = {}, allowWrite = true) =>
  rpc('tools/call', { name, arguments: args }, allowWrite);
/** Résultat JSON d'un outil ; lève si l'outil a répondu par une erreur */
const ok = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await call(name, args);
  if (r.error || r.result?.isError) {
    throw new Error(r.error?.message ?? r.result?.content[0].text);
  }
  return JSON.parse(r.result!.content[0].text);
};
/** Message d'erreur d'un outil refusé */
const ko = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await call(name, args);
  expect(r.result?.isError).toBe(true);
  return r.result!.content[0].text;
};
const file = (name: string, content: string) => {
  const p = path.join(allowed, name);
  fs.writeFileSync(p, content);
  return p;
};

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-mcp-'));
  allowed = path.join(dir, 'autorise');
  fs.mkdirSync(allowed);
  notify = vi.fn();
  startRemote = vi.fn(async () => ({ success: true, serverInfo: { url: 'https://x:8066' } }));
  stopRemote = vi.fn(() => true);
  deps = {
    db,
    notify,
    remoteServers: () => [],
    cyranoStatus: () => null,
    allowedRoots: () => [allowed],
    startRemote,
    stopRemote,
  } as unknown as McpWriteDeps;
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Épreuve de 6 tireurs pointés, créée par les outils du lot 2 */
async function competition(): Promise<string> {
  const { created } = await ok('create_competition', {
    title: 'Open',
    date: '2026-12-06',
    weapon: 'E',
    gender: 'M',
    category: 'SEN',
  });
  const names = [
    'DUPONT;Jean',
    'MARTIN;Paul',
    'DURAND;Luc',
    'PETIT;Marc',
    'ROUX;Eric',
    'BLANC;Hugo',
  ];
  await ok('import_fencers', { competitionId: created.id, path: file('t.txt', names.join('\n')) });
  const fencers = db.getFencersByCompetition(created.id).map(f => f.id);
  await ok('check_in', { competitionId: created.id, fencers, present: true });
  return created.id;
}

async function playAll(competitionId: string, kind: 'pool' | 'bracket') {
  for (let guard = 0; guard < 50; guard++) {
    const ready = (await ok('list_matches', { competitionId, state: 'ready' })).filter(
      (m: { kind: string }) => m.kind === kind
    );
    if (ready.length === 0) return;
    for (const m of ready) {
      await ok('record_score', {
        competitionId,
        matchId: m.matchId,
        scoreA: kind === 'pool' ? 5 : 15,
        scoreB: 2,
      });
    }
  }
}

d('autorisation', () => {
  it('sans écriture : outils de lecture seulement, écritures refusées', async () => {
    const list = await rpc('tools/list', {}, false);
    const names = list.result!.tools!.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_matches', 'get_settings', 'list_venues']));
    for (const n of ['generate_pools', 'record_score', 'build_bracket', 'delete_competition']) {
      expect(names).not.toContain(n);
      expect((await call(n, {}, false)).error?.message).toContain('Écriture désactivée');
    }
  });

  it('noms d’outils uniques, outils destructifs annotés', async () => {
    const list = (await rpc('tools/list', {})) as unknown as {
      result: { tools: Array<{ name: string; annotations: { destructiveHint?: boolean } }> };
    };
    const names = list.result.tools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of [
      'generate_pools',
      'build_bracket',
      'stop_remote_server',
      'delete_competition',
    ]) {
      expect(list.result.tools.find(t => t.name === n)?.annotations.destructiveHint).toBe(true);
    }
  });
});

d('orchestration sportive (lot 3)', () => {
  it('poules → scores → tableau → classement final → export, écran prévenu', async () => {
    const id = await competition();
    const sim = await ok('generate_pools', { competitionId: id, dryRun: true });
    expect(sim).toMatchObject({ dryRun: true, poolCount: 1 });
    expect(await ok('list_matches', { competitionId: id })).toHaveLength(0);

    await ok('generate_pools', { competitionId: id });
    expect(notify).toHaveBeenCalledWith('session:changed', id);
    // Les outils de lecture du lot 1 lisent les tables : poules visibles
    const ranking = await ok('get_pool_ranking', { competitionId: id });
    expect(JSON.stringify(ranking)).toContain('DUPONT');

    const [first] = await ok('list_matches', { competitionId: id, state: 'ready' });
    expect(
      await ko('record_score', { competitionId: id, matchId: first.matchId, scoreA: 9, scoreB: 1 })
    ).toContain('score_above_max');
    expect(
      await ko('record_score', {
        competitionId: id,
        matchId: first.matchId,
        scoreA: 'x',
        scoreB: 1,
      })
    ).toContain('scoreA');
    expect(await ko('build_bracket', { competitionId: id })).toContain('pools_not_complete');

    await playAll(id, 'pool');
    const bracket = await ok('build_bracket', { competitionId: id, thirdPlaceMatch: false });
    expect(bracket).toMatchObject({ size: 8, qualified: 6 });
    await playAll(id, 'bracket');
    expect((db.getSessionState(id) as { currentPhase: number }).currentPhase).toBe(6);

    const out = path.join(allowed, 'resultats.xml');
    expect(
      await ok('export_results', { competitionId: id, format: 'xml', path: out })
    ).toMatchObject({
      format: 'xml',
    });
    expect(fs.readFileSync(out, 'utf-8')).toContain('DUPONT');
    expect(await ko('export_results', { competitionId: id, format: 'xml', path: out })).toContain(
      'file_exists'
    );
    expect(
      await ko('export_results', {
        competitionId: id,
        format: 'csv',
        path: path.join(dir, 'r.csv'),
      })
    ).toContain('path_not_allowed');
    // Sous-dossier absent : « introuvable » dans les dossiers de l'agent, refus au-dehors
    expect(
      await ko('export_results', {
        competitionId: id,
        format: 'csv',
        path: path.join(allowed, 'absent', 'r.csv'),
      })
    ).toContain('dir_not_found');
    expect(
      await ko('export_results', {
        competitionId: id,
        format: 'csv',
        path: path.join(dir, 'absent', 'r.csv'),
      })
    ).toContain('path_not_allowed');
    expect(
      await ko('export_results', {
        competitionId: id,
        format: 'pdf',
        path: path.join(allowed, 'r.pdf'),
      })
    ).toContain('pdf_unavailable');
  });

  it('régénérer des poules jouées exige replace', async () => {
    const id = await competition();
    await ok('generate_pools', { competitionId: id });
    const [m] = await ok('list_matches', { competitionId: id });
    await ok('record_score', { competitionId: id, matchId: m.matchId, scoreA: 5, scoreB: 1 });
    expect(await ko('generate_pools', { competitionId: id })).toContain('pools_have_scores');
    expect(await ok('generate_pools', { competitionId: id, replace: true })).toMatchObject({
      poolCount: 1,
    });
  });
});

d('record_score en simulation', () => {
  it('contrôle et résultat sans écriture ni notification', async () => {
    const id = await competition();
    await ok('generate_pools', { competitionId: id });
    const [m] = await ok('list_matches', { competitionId: id, state: 'ready' });
    notify.mockClear();
    const before = JSON.stringify(db.getSessionState(id));
    const sim = await ok('record_score', {
      competitionId: id,
      matchId: m.matchId,
      scoreA: 5,
      scoreB: 3,
      dryRun: true,
    });
    expect(sim).toMatchObject({ dryRun: true, kind: 'pool' });
    expect(JSON.stringify(db.getSessionState(id))).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    expect(
      await ko('record_score', {
        competitionId: id,
        matchId: m.matchId,
        scoreA: 3,
        scoreB: 3,
        dryRun: true,
      })
    ).toContain('draw_needs_winner');
  });
});

d('fichiers lus par l’agent', () => {
  it('import hors des dossiers accessibles refusé, sans révéler si le fichier existe', async () => {
    const id = await competition();
    const outside = path.join(dir, 'ailleurs.txt');
    fs.writeFileSync(outside, 'SECRET;Agent');
    const refused = await ko('import_fencers', { competitionId: id, path: outside, dryRun: true });
    expect(refused).toContain('hors des dossiers');
    expect(refused).not.toContain('SECRET');
    expect(
      await ko('import_fencers', { competitionId: id, path: path.join(dir, 'absent.txt') })
    ).toContain('hors des dossiers');
  });
});

d('arbitres, serveur distant, suppression', () => {
  it('import_referees : épreuve (gestion des arbitres activée) puis rejoué sans doublon', async () => {
    const id = await competition();
    const refs = file('arbitres.txt', 'nom;prenom;sexe\nARBITRE;Anne;F\nJUGE;Bob;M');
    expect(
      await ok('import_referees', { competitionId: id, path: refs, dryRun: true })
    ).toMatchObject({
      dryRun: true,
      toAdd: 2,
    });
    expect(db.getRefereesByCompetition(id)).toHaveLength(0);
    expect(await ok('import_referees', { competitionId: id, path: refs })).toMatchObject({
      added: 2,
    });
    expect(db.getCompetition(id)?.settings.refereeFeatureEnabled).toBe(true);
    expect(await ok('import_referees', { competitionId: id, path: refs })).toMatchObject({
      added: 0,
      duplicates: 2,
    });
  });

  it('import_referees : journée avec armes, reportés dans les épreuves de ces armes', async () => {
    const id = await competition();
    const day = db.eventDays.createDay({ name: 'J', date: '2026-12-06' });
    db.eventDays.setCompetitionDay(id, day.id);
    const refs = file('arbitres.txt', 'nom;prenom;sexe\nARBITRE;Anne;F');
    expect(
      await ok('import_referees', { dayId: day.id, path: refs, weapons: ['E'] })
    ).toMatchObject({ added: 1, withoutWeapons: 0 });
    expect(db.eventDays.listReferees(day.id)[0].weapons).toEqual(['E']);
    expect(db.getRefereesByCompetition(id)).toHaveLength(1);
    expect(await ko('import_referees', { dayId: 'inconnue', path: refs })).toContain(
      'Journée inconnue'
    );
  });

  it('start / stop_remote_server passent par le serveur distant de l’application', async () => {
    const id = await competition();
    expect(await ok('start_remote_server', { competitionId: id, port: 8070 })).toEqual({
      url: 'https://x:8066',
    });
    expect(startRemote).toHaveBeenCalledWith(id, 8070);
    expect(await ok('stop_remote_server', { competitionId: id })).toEqual({ stopped: true });
    stopRemote.mockReturnValue(false);
    expect(await ko('stop_remote_server', { competitionId: id })).toContain('Aucun serveur');
  });

  it('assign_referees : arbitre du club d’un tireur signalé faute d’arbitre neutre', async () => {
    const id = await competition();
    const [first] = db.getFencersByCompetition(id);
    db.updateFencer(first.id, { club: 'NEC' });
    await ok('import_referees', {
      competitionId: id,
      path: file('arbitres.txt', 'nom;prenom;sexe;categorie;club\nARBITRE;Anne;F;;NEC'),
    });
    await ok('generate_pools', { competitionId: id });
    const result = await ok('assign_referees', { competitionId: id, includeUnchecked: true });
    expect(result.assignments[0]).toMatchObject({ referee: 'Anne ARBITRE', clubConflict: 'NEC' });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('NEC');
  });

  it('arènes du serveur distant sans écran : poules, sinon pistes de la salle, sinon 1', async () => {
    const id = await competition();
    expect(remoteArenaCount({ db }, id)).toBe(1);
    await ok('upsert_venue', { name: 'Gymnase', stripCount: 6 });
    expect(remoteArenaCount({ db }, id)).toBe(6);
    await ok('generate_pools', { competitionId: id });
    expect(remoteArenaCount({ db }, id)).toBe(1);
  });

  it('delete_competition : titre exact exigé', async () => {
    const id = await competition();
    expect(await ko('delete_competition', { competitionId: id, confirmTitle: 'open' })).toContain(
      'ne correspond pas'
    );
    expect(
      await ok('delete_competition', { competitionId: id, confirmTitle: 'Open', dryRun: true })
    ).toMatchObject({ dryRun: true, fencers: 6 });
    expect(db.getCompetition(id)).not.toBeNull();
    await ok('delete_competition', { competitionId: id, confirmTitle: 'Open' });
    expect(db.getCompetition(id)).toBeNull();
    expect(stopRemote).toHaveBeenCalledWith(id);
  });
});

d('paramétrage du poste et salles', () => {
  it('salle par défaut → pistes ; réglages sans secret ni dossiers de l’agent', async () => {
    await ok('upsert_venue', { name: 'Gymnase', stripCount: 6 });
    const settings = await ok('get_settings');
    expect(settings).toMatchObject({ language: 'fr', defaultStripCount: 6, hasLogo: false });
    expect(settings).not.toHaveProperty('agentFolders');
    expect((await ok('list_venues'))[0]).toMatchObject({ name: 'Gymnase', isDefault: true });
    // Liste fermée : l'agent n'élargit pas ses propres dossiers
    await ok('update_settings', { language: 'de', agentFolders: ['/'] });
    expect(db.settings.getSettings()).toMatchObject({ language: 'de', agentFolders: [] });
    expect(await ko('update_settings', { remoteInterface: 'partout' })).toContain('IPv4');
  });
});

d('formats d’import et atomicité', () => {
  it('classeur Excel et cotcot lus comme à l’écran', async () => {
    const xlsx = path.join(allowed, 'tireurs.xlsx');
    fs.writeFileSync(
      xlsx,
      await rowsToXlsx([
        ['NOM', 'PRENOM', 'SEXE', 'DATE', 'NATION', 'LIGUE', 'CLUB', 'LICENCE', 'CLASSEMENT'],
        ['ROUX', 'Marc', 'M', '01/01/1990', 'FRA', 'IDF', 'CE', '111', '3'],
        ['BLANC', 'Hugo', 'M', '02/02/1991', 'FRA', 'IDF', 'CE', '112', '4'],
      ])
    );
    const cotcot = file(
      'tireurs.cotcot',
      '<Competition><Tireur Nom="PETIT" Prenom="Marc" Sexe="M" Nation="FRA"/></Competition>'
    );
    const report = await ok('import_day', {
      name: 'Formats',
      date: '2026-12-06',
      competitions: [
        { title: 'Excel', weapon: 'E', gender: 'M', category: 'SEN', fencersFile: xlsx },
        { title: 'Cotcot', weapon: 'E', gender: 'M', category: 'U20', fencersFile: cotcot },
      ],
    });
    expect(report.competitions.map((c: { fencers: { added: number } }) => c.fencers.added)).toEqual(
      [2, 1]
    );
  });

  it('TXT séparé par des espaces lu comme à l’écran ; fichier sans tireur signalé', async () => {
    const { created } = await ok('create_competition', {
      title: 'Libre',
      date: '2026-12-06',
      weapon: 'S',
      gender: 'F',
      category: 'SEN',
    });
    const libre = file('libre.txt', 'BONNET Claire F\nFONTAINE Julie F\n');
    expect(await ok('import_fencers', { competitionId: created.id, path: libre })).toMatchObject({
      format: 'txt',
      read: 2,
      added: 2,
    });
    const report = await ok('import_fencers', {
      competitionId: created.id,
      path: file('vide.csv', 'rien\n'),
    });
    expect(report.read).toBe(0);
    expect(report.warnings[0]).toContain('Aucun tireur lu');
    // Aperçu de import_day (épreuve pas encore créée) : même lecture
    const day = await ok('import_day', {
      name: 'Aperçu',
      date: '2026-12-07',
      dryRun: true,
      competitions: [
        { title: 'TXT', weapon: 'S', gender: 'F', category: 'SEN', fencersFile: libre },
      ],
    });
    expect(day.competitions[0].fencers).toMatchObject({ format: 'txt', read: 2 });
  });

  it('import_day : un fichier manquant fait échouer l’import sans rien écrire', async () => {
    const message = await ko('import_day', {
      name: 'Partielle',
      date: '2026-12-06',
      competitions: [
        {
          title: 'A',
          weapon: 'E',
          gender: 'M',
          category: 'SEN',
          fencersFile: file('a.txt', 'X;Y'),
        },
        {
          title: 'B',
          weapon: 'E',
          gender: 'M',
          category: 'SEN',
          fencersFile: path.join(allowed, 'absent.txt'),
        },
      ],
    });
    expect(message).toContain('introuvable');
    expect(db.getAllCompetitions()).toHaveLength(0);
    expect(db.eventDays.listDays()).toHaveLength(0);
  });
});

d('import par lot (--batch-import)', () => {
  it('manifeste de import_day, chemins relatifs au manifeste, rejouable', async () => {
    file('m15.txt', 'DUPONT;Jean\nMARTIN;Paul');
    file('arbitres.txt', 'nom;prenom;sexe\nARBITRE;Anne;F');
    const manifest = path.join(allowed, 'journee.json');
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        name: 'Journée',
        date: '2026-12-06',
        stripCount: 4,
        refereesFile: 'arbitres.txt',
        competitions: [
          { title: 'M15', weapon: 'E', gender: 'M', category: 'U15', fencersFile: 'm15.txt' },
        ],
      })
    );
    // Lancé par l'opérateur : hors des dossiers de l'agent, accepté
    deps.allowedRoots = () => [path.join(dir, 'autre')];
    const dry = await runBatchImport(deps, manifest, true);
    expect(dry).toMatchObject({ exitCode: 0, report: { dryRun: true } });
    expect(db.getAllCompetitions()).toHaveLength(0);
    expect((await runBatchImport(deps, manifest, false)).exitCode).toBe(0);
    await runBatchImport(deps, manifest, false);
    expect(db.getAllCompetitions()).toHaveLength(1);
    expect(db.getFencersByCompetition(db.getAllCompetitions()[0].id)).toHaveLength(2);
    expect(db.eventDays.listDays()).toHaveLength(1);
    expect(await runBatchImport(deps, path.join(allowed, 'absent.json'), false)).toMatchObject({
      exitCode: 1,
    });
  });
});
