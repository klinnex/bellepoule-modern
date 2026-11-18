/**
 * Tests : sauvegardes locales d'un club (rotation à 2, restauration, sécurité des identifiants).
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseManager } from '../database';
import {
  backupsToRemove,
  clubBackupDir,
  clubBackupFileName,
  createClubBackup,
  listClubBackups,
  restoreClubBackup,
} from './clubBackups';

const CLUB_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

/** Base minimale : export = un club vide, import = enregistré pour vérification */
function fakeDb(clubId = CLUB_ID) {
  const importClub = vi.fn((data: { clubId: string }) => ({
    clubId: data.clubId,
    clubName: 'Club test',
    replaced: true,
    rows: 0,
  }));
  const db = {
    clubBackup: {
      exportClub: (id: string) => ({
        clubId: id,
        exportedAt: new Date().toISOString(),
        tables: { clubs: [{ id, name: 'Club test' }] },
      }),
      importClub,
    },
  } as unknown as Pick<DatabaseManager, 'clubBackup'>;
  return { db, importClub, clubId };
}

describe('backupsToRemove', () => {
  it('garde les 2 plus récentes et supprime les plus anciennes', () => {
    const names = [
      '2026-11-16T08-00-00-000Z.bpclub',
      '2026-11-18T08-00-00-000Z.bpclub',
      '2026-11-17T08-00-00-000Z.bpclub',
    ];
    expect(backupsToRemove(names)).toEqual(['2026-11-16T08-00-00-000Z.bpclub']);
  });

  it('ignore les fichiers qui ne sont pas des sauvegardes', () => {
    expect(backupsToRemove(['.tmp.bpclub', 'notes.txt'])).toEqual([]);
  });
});

describe('clubBackupFileName', () => {
  it('produit un nom horodaté trié chronologiquement', () => {
    const early = clubBackupFileName(new Date('2026-11-16T08:00:00.000Z'));
    const late = clubBackupFileName(new Date('2026-11-18T08:00:00.000Z'));
    expect(early).toBe('2026-11-16T08-00-00-000Z.bpclub');
    expect(early < late).toBe(true);
  });
});

describe('sauvegardes sur disque', () => {
  let userData: string;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-club-backups-'));
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
  });

  it('rotation : la 3e sauvegarde supprime la plus ancienne', async () => {
    const { db } = fakeDb();
    await createClubBackup(db, userData, CLUB_ID, new Date('2026-11-16T08:00:00.000Z'));
    await createClubBackup(db, userData, CLUB_ID, new Date('2026-11-17T08:00:00.000Z'));
    const after = await createClubBackup(
      db,
      userData,
      CLUB_ID,
      new Date('2026-11-18T08:00:00.000Z')
    );

    expect(after.map(b => b.createdAt)).toEqual([
      '2026-11-18T08:00:00.000Z',
      '2026-11-17T08:00:00.000Z',
    ]);
    expect(fs.readdirSync(clubBackupDir(userData, CLUB_ID))).toHaveLength(2);
  });

  it('liste vide tant qu’aucune sauvegarde n’existe', () => {
    expect(listClubBackups(userData, CLUB_ID)).toEqual([]);
  });

  it('restaure une sauvegarde en remplaçant le club', async () => {
    const { db, importClub } = fakeDb();
    const [entry] = await createClubBackup(db, userData, CLUB_ID);

    const result = await restoreClubBackup(db, userData, CLUB_ID, entry.id);

    expect(result.clubName).toBe('Club test');
    expect(importClub).toHaveBeenCalledWith(expect.objectContaining({ clubId: CLUB_ID }), true);
  });

  it('refuse un identifiant de fichier hors format (pas de chemin arbitraire)', async () => {
    const { db } = fakeDb();
    await expect(restoreClubBackup(db, userData, CLUB_ID, '../../bellepoule.db')).rejects.toThrow(
      'Sauvegarde inconnue'
    );
  });

  it('refuse la restauration d’une sauvegarde d’un autre club', async () => {
    const { db } = fakeDb();
    const [entry] = await createClubBackup(db, userData, CLUB_ID);
    const other = fakeDb('autre-club');
    await expect(restoreClubBackup(other.db, userData, 'autre-club', entry.id)).rejects.toThrow(
      'Sauvegarde introuvable'
    );
  });
});
