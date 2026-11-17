/**
 * BellePoule Modern - Mode Club : fichier de sauvegarde d'un club (.bpclub = ZIP).
 * manifest.json (format, version, club) + tables/<table>.json (lignes brutes).
 * Licensed under GPL-3.0
 */
import JSZip from 'jszip';
import {
  CLUB_BACKUP_TABLES,
  type ClubBackup,
  type ClubBackupRow,
  type ClubBackupTable,
} from '../database/repos/clubBackupRepo';
import { checkZipEntries } from './pathAuthorization';

export const CLUB_BACKUP_EXT = '.bpclub';

/** Sauvegarde → archive ZIP compressée */
export async function encodeClubBackup(backup: ClubBackup): Promise<Buffer> {
  const { tables, ...meta } = backup;
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(meta));
  for (const [name, rows] of Object.entries(tables)) {
    zip.file(`tables/${name}.json`, JSON.stringify(rows));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Archive ZIP → sauvegarde (structure validée ensuite par ClubBackupRepo.validate) */
export async function decodeClubBackup(buffer: Buffer): Promise<unknown> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde de club BellePoule");
  }
  const names = new Set(checkZipEntries(zip));
  const manifest = names.has('manifest.json') ? zip.file('manifest.json') : null;
  if (!manifest) throw new Error("Ce fichier n'est pas une sauvegarde de club BellePoule");
  const meta = JSON.parse(await manifest.async('string')) as Record<string, unknown>;
  const tables: Partial<Record<ClubBackupTable, ClubBackupRow[]>> = {};
  for (const table of CLUB_BACKUP_TABLES) {
    const entry = `tables/${table}.json`;
    const f = names.has(entry) ? zip.file(entry) : null;
    if (f) tables[table] = JSON.parse(await f.async('string')) as ClubBackupRow[];
  }
  return { ...meta, tables };
}
