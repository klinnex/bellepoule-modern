/**
 * Tests : synchronisation d'un club vers un dossier (décision pure + service sur dossier réel).
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClubSyncService,
  clubSyncFileName,
  decideSync,
  readClubSyncSettings,
  type ClubSyncDb,
} from './clubSync';
import { encodeClubBackup } from './clubBackupFile';
import type { ClubBackup } from '../database/repos/clubBackupRepo';

const CLUB_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('decideSync', () => {
  const base = {
    hasBaseline: true,
    fileExists: true,
    clubExists: true,
    dbChanged: false,
    fileChanged: false,
  };

  it('ne fait rien quand rien n a changé', () => {
    expect(decideSync(base)).toBe('none');
  });

  it("écrit le club quand le fichier n'existe pas", () => {
    expect(decideSync({ ...base, fileExists: false })).toBe('write');
  });

  it('écrit quand seul le poste a changé', () => {
    expect(decideSync({ ...base, dbChanged: true })).toBe('write');
  });

  it('reprend le fichier quand seul le fichier a changé', () => {
    expect(decideSync({ ...base, fileChanged: true })).toBe('import');
  });

  it('signale un conflit quand les deux côtés ont changé', () => {
    expect(decideSync({ ...base, dbChanged: true, fileChanged: true })).toBe('conflict');
  });

  it('signale un conflit à la première synchro si le club existe déjà et le fichier aussi', () => {
    expect(decideSync({ ...base, hasBaseline: false })).toBe('conflict');
  });

  it('importe à la première synchro sur un poste qui ne connaît pas le club', () => {
    expect(decideSync({ ...base, clubExists: false, hasBaseline: false })).toBe('import');
  });

  it("ne ressuscite pas un club supprimé localement si le fichier n'a pas changé", () => {
    expect(decideSync({ ...base, clubExists: false, dbChanged: true })).toBe('none');
  });

  it('ne fait rien si le club et le fichier sont absents', () => {
    expect(decideSync({ ...base, clubExists: false, fileExists: false })).toBe('none');
  });
});

describe('clubSyncFileName', () => {
  it('assainit le nom et ajoute un fragment d identifiant', () => {
    expect(clubSyncFileName('Épée Club / Nord', CLUB_ID)).toBe('Epee-Club-Nord-a1b2c3d4.bpclub');
  });

  it('retombe sur « club » pour un nom vide', () => {
    expect(clubSyncFileName('   ', CLUB_ID)).toBe('club-a1b2c3d4.bpclub');
  });
});

describe('ClubSyncService (dossier réel, base simulée)', () => {
  let userData: string;
  let folder: string;
  let state: { exists: boolean; name: string };
  let importClub: ReturnType<typeof vi.fn>;
  let db: ClubSyncDb;

  const backupOf = (name: string): ClubBackup => ({
    format: 'bpclub' as ClubBackup['format'],
    version: 1,
    exportedAt: new Date().toISOString(),
    clubId: CLUB_ID,
    clubName: name,
    tables: { clubs: [{ id: CLUB_ID, name }] },
  });

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-sync-ud-'));
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-sync-dir-'));
    state = { exists: true, name: 'Club Nord' };
    importClub = vi.fn((data: ClubBackup) => {
      state = { exists: true, name: data.clubName };
      return { clubId: data.clubId, clubName: data.clubName, replaced: true, rows: 1 };
    });
    db = {
      club: {
        getClub: (id: string) => (state.exists && id === CLUB_ID ? { id, name: state.name } : null),
      },
      clubBackup: {
        exportClub: () => backupOf(state.name),
        importClub: importClub as unknown as ClubSyncDb['clubBackup']['importClub'],
      },
    } as unknown as ClubSyncDb;
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(folder, { recursive: true, force: true });
  });

  const filePath = () => path.join(folder, readClubSyncSettings(userData).clubs[CLUB_ID]!.fileName);

  it("active la synchro : écrit le fichier et enregistre l'état de référence", async () => {
    const svc = new ClubSyncService(db, userData);
    const status = await svc.enable(CLUB_ID, folder);
    expect(status.state).toBe('synced');
    expect(status.lastSync).not.toBeNull();
    expect(fs.existsSync(filePath())).toBe(true);
    expect(importClub).not.toHaveBeenCalled();
  });

  it('ne réécrit ni ne reprend rien quand rien n a changé', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    const before = fs.readFileSync(filePath());
    await svc.sync(CLUB_ID);
    expect(fs.readFileSync(filePath()).equals(before)).toBe(true);
    expect(importClub).not.toHaveBeenCalled();
  });

  it('reprend un fichier modifié sur un autre poste', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    fs.writeFileSync(filePath(), await encodeClubBackup(backupOf('Club Sud')));
    const onImported = vi.fn();
    const svc2 = new ClubSyncService(db, userData, onImported);
    await svc2.sync(CLUB_ID);
    expect(importClub).toHaveBeenCalledWith(
      expect.objectContaining({ clubName: 'Club Sud' }),
      true
    );
    expect(onImported).toHaveBeenCalledWith(CLUB_ID);
    expect(state.name).toBe('Club Sud');
  });

  it('écrit le fichier quand ce poste a changé', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    state.name = 'Club Nord 2';
    await svc.sync(CLUB_ID);
    const written = await import('./clubBackupFile').then(m =>
      m.decodeClubBackup(fs.readFileSync(filePath()))
    );
    expect((written as ClubBackup).clubName).toBe('Club Nord 2');
    expect(importClub).not.toHaveBeenCalled();
  });

  it('signale un conflit sans rien écraser quand les deux côtés ont changé', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    fs.writeFileSync(filePath(), await encodeClubBackup(backupOf('Club Sud')));
    state.name = 'Club Nord 2';
    const status = await svc.sync(CLUB_ID);
    expect(status.state).toBe('conflict');
    expect(importClub).not.toHaveBeenCalled();
    const onDisk = await import('./clubBackupFile').then(m =>
      m.decodeClubBackup(fs.readFileSync(filePath()))
    );
    expect((onDisk as ClubBackup).clubName).toBe('Club Sud');
  });

  it('résout un conflit en gardant ce poste', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    fs.writeFileSync(filePath(), await encodeClubBackup(backupOf('Club Sud')));
    state.name = 'Club Nord 2';
    await svc.sync(CLUB_ID);
    const status = await svc.resolve(CLUB_ID, 'app');
    expect(status.state).toBe('synced');
    expect(importClub).not.toHaveBeenCalled();
  });

  it('signale une erreur si le dossier de synchro a disparu, sans le recréer', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    fs.rmSync(folder, { recursive: true, force: true });
    const status = await svc.sync(CLUB_ID);
    expect(status.state).toBe('error');
    expect(status.error).toMatch(/introuvable/);
    expect(fs.existsSync(folder)).toBe(false);
  });

  it('désactiver retire le réglage et laisse le fichier en place', async () => {
    const svc = new ClubSyncService(db, userData);
    await svc.enable(CLUB_ID, folder);
    const file = filePath();
    const status = svc.disable(CLUB_ID);
    expect(status.state).toBe('off');
    expect(fs.existsSync(file)).toBe(true);
  });
});
