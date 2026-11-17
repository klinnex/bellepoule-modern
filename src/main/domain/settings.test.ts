/**
 * Paramétrage global du poste et salles (#1880), base SQLite réelle (node:sqlite, toutes
 * les migrations) ; fichiers écrits par l'agent (dossiers accessibles).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseManager } from '../../database';
import { hasNodeSqlite } from '../../database/testing/nodeSqliteDatabase';
import type { DomainChange, DomainContext } from './context';
import { resolveOutputPath, writeOutputFile } from './files';
import { resolveSetting, upsertVenue } from './settings';

vi.mock('better-sqlite3', async () => ({
  default: (await import('../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

let db: DatabaseManager;
let ctx: DomainContext;
let changes: DomainChange[];
let dir: string;

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  changes = [];
  ctx = { db, emitChange: c => changes.push(c) };
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-settings-'));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

d('réglages du poste', () => {
  it('valeurs par défaut, validation, reprise douce des valeurs localStorage', () => {
    expect(db.settings.getSettings()).toMatchObject({ language: 'fr', remoteHttps: true });
    expect(() => db.settings.updateSettings({ remoteInterface: 'partout' })).toThrow(/IPv4/);
    expect(() => db.settings.updateSettings({ inconnu: 1 } as never)).toThrow(/inconnu/);
    db.settings.updateSettings({ language: 'de' });
    const imported = db.settings.importLegacySettings({ language: 'en', remoteHttps: false });
    expect(imported).toEqual(['remoteHttps']);
    expect(db.settings.getSettings()).toMatchObject({ language: 'de', remoteHttps: false });
  });

  it('dossiers de l’agent : chemins absolus seulement', () => {
    expect(() => db.settings.updateSettings({ agentFolders: ['relatif'] })).toThrow(/absolus/);
    db.settings.updateSettings({ agentFolders: ['/media/usb', '/media/usb'] });
    expect(db.settings.getSetting('agentFolders')).toEqual(['/media/usb']);
  });
});

d('salles', () => {
  it('la salle par défaut fournit ses pistes à la journée, au club et à resolveSetting', () => {
    expect(resolveSetting(ctx, 'stripCount')).toBe(0);
    const venue = upsertVenue(ctx, { name: 'Gymnase', stripCount: 8 });
    expect(venue.isDefault).toBe(true);
    const day = db.eventDays.createDay({ name: 'J1', date: '2026-12-06' });
    expect(day.stripCount).toBe(8);
    expect(day.venueId).toBe(venue.id);
    expect(db.club.createClub({ name: 'Cercle' }).stripCount).toBe(8);
    // La journée surcharge le nombre de pistes
    const day2 = db.eventDays.createDay({ name: 'J2', date: '2026-12-07', stripCount: 4 });
    expect(resolveSetting(ctx, 'stripCount', { eventDayId: day2.id })).toBe(4);
    expect(resolveSetting(ctx, 'stripCount')).toBe(8);
    expect(resolveSetting(ctx, 'language')).toBe('fr');
  });

  it('une seule salle par défaut', () => {
    const a = upsertVenue(ctx, { name: 'A', stripCount: 2 });
    const b = upsertVenue(ctx, { name: 'B', stripCount: 3, isDefault: true });
    const venues = db.settings.listVenues();
    expect(venues.filter(v => v.isDefault).map(v => v.id)).toEqual([b.id]);
    expect(venues.find(v => v.id === a.id)?.strips).toHaveLength(2);
  });
});

describe('fichiers écrits par l’agent', () => {
  it('dossier hors périmètre refusé, lien vers l’extérieur compris', () => {
    const allowed = fs.mkdirSync(path.join(dir, 'ok'), { recursive: true }) ?? path.join(dir, 'ok');
    const roots = [allowed];
    expect(resolveOutputPath(path.join(allowed, 'r.csv'), '.csv', { roots })).toBe(
      path.join(fs.realpathSync(allowed), 'r.csv')
    );
    expect(() => resolveOutputPath(path.join(dir, 'r.csv'), '.csv', { roots })).toThrow(
      /hors des dossiers/
    );
    const link = path.join(allowed, 'lien');
    fs.symlinkSync(dir, link);
    expect(() => resolveOutputPath(path.join(link, 'r.csv'), '.csv', { roots })).toThrow(
      /hors des dossiers/
    );
    expect(() => resolveOutputPath(path.join(allowed, 'r.exe'), '.csv', { roots })).toThrow(
      /Extension/
    );
    expect(() => resolveOutputPath('relatif.csv', '.csv', { roots })).toThrow(/absolu/);
  });

  it('pas d’écrasement sans accord ; remplacement atomique', async () => {
    const target = path.join(fs.realpathSync(dir), 'r.csv');
    await writeOutputFile(target, 'a', false);
    expect(() => resolveOutputPath(target, '.csv')).toThrow(/existe déjà/);
    await expect(writeOutputFile(target, 'b', false)).rejects.toThrow(/existe déjà/);
    await writeOutputFile(resolveOutputPath(target, '.csv', { overwrite: true }), 'c', true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('c');
    expect(fs.readdirSync(dir)).toEqual(['r.csv']);
  });
});
