/**
 * BellePoule Modern - Handlers IPC `privacy:*` : outils RGPD (#1882).
 * Droits des personnes (accès, portabilité, anonymisation, effacement), durée de
 * conservation, affichage des noms sur le réseau, archives .bpm chiffrées.
 * Licensed under GPL-3.0
 */
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../../database';
import {
  readPrivacySettings,
  retentionCutoff,
  sanitizePrivacySettings,
  writePrivacySettings,
} from '../privacySettings';
import { setNameMasking } from '../remote/publicDto';
import { decryptBpmFile, encryptBpmFileTo, MIN_BPM_PASSWORD } from '../bpmCrypto';
import type {
  PrivacyPersonRef,
  PrivacySettings,
  RetentionPurgeResult,
} from '../../shared/types/privacy';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export interface PrivacyHandlersContext {
  db: DatabaseManager;
  getMainWindow(): BrowserWindow | null;
  /** Dossier des réglages (défaut : userData) */
  userDataDir?: () => string;
  /**
   * Compétition ouverte dans l'application ou servie aux tablettes (#1882) : son état
   * en mémoire réécrirait les noms anonymisés ou effacés.
   */
  isCompetitionBusy?: (competitionId: string) => boolean;
}

/** Erreur IPC : compétition ouverte, à fermer avant l'anonymisation ou l'effacement */
export const COMPETITION_OPEN_ERROR = 'competition_open';

// Pas de troncature silencieuse (#1882) : les identifiants sont revalidés en base
const strIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const asRecord = (input: unknown): Record<string, unknown> =>
  (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

const asRef = (input: unknown): PrivacyPersonRef => {
  const r = asRecord(input);
  return { fencerIds: strIds(r.fencerIds), memberIds: strIds(r.memberIds) };
};

const safeFileName = (name: unknown, fallback: string): string => {
  const base = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return base || fallback;
};

/**
 * Applique l'action de conservation (anonymisation ou suppression) aux compétitions
 * et membres échus ; `selection` restreint aux identifiants choisis.
 */
export function applyRetention(
  db: DatabaseManager,
  settings: PrivacySettings,
  selection?: { competitionIds?: string[]; memberIds?: string[] },
  now: Date = new Date(),
  isCompetitionBusy: (competitionId: string) => boolean = () => false
): RetentionPurgeResult {
  const candidates = db.privacy.listRetentionCandidates(
    retentionCutoff(settings.competitionRetentionMonths, now),
    retentionCutoff(settings.memberRetentionMonths, now)
  );
  const pick = <T extends { id: string }>(items: T[], ids?: string[]) =>
    Array.isArray(ids) ? items.filter(i => ids.includes(i.id)) : items;
  // Compétition ouverte : son état en mémoire réécrirait les données (#1882)
  const competitions = pick(candidates.competitions, selection?.competitionIds).filter(
    c => !isCompetitionBusy(c.id)
  );
  const members = pick(candidates.members, selection?.memberIds);
  for (const c of competitions) {
    if (settings.retentionAction === 'delete') db.privacy.purgeCompetition(c.id, false);
    else db.privacy.anonymizeCompetition(c.id);
  }
  const memberIds = members.map(m => m.id);
  if (memberIds.length) {
    if (settings.retentionAction === 'delete') db.privacy.eraseMembersById(memberIds);
    else db.privacy.anonymizeMembersById(memberIds);
  }
  if (competitions.length || memberIds.length) db.compactAfterErasure?.();
  return { competitions: competitions.length, members: members.length };
}

/** Au démarrage (base ouverte) : réglage d'affichage des noms + purge automatique */
export function applyStoredPrivacySettings(db: DatabaseManager, userDataDir: string): void {
  const settings = readPrivacySettings(userDataDir);
  setNameMasking(settings.nameMasking);
  if (!settings.autoPurge || !db.isOpen()) return;
  try {
    const r = applyRetention(db, settings);
    if (r.competitions || r.members) {
      logger.info(
        LogCategory.DATABASE,
        `[RGPD] conservation : ${r.competitions} compétition(s), ${r.members} membre(s) (${settings.retentionAction})`
      );
    }
  } catch (e) {
    logger.error(LogCategory.DATABASE, '[RGPD] purge automatique impossible', toError(e));
  }
}

export function createPrivacyHandlers({
  db,
  getMainWindow,
  userDataDir = () => app.getPath('userData'),
  isCompetitionBusy = () => false,
}: PrivacyHandlersContext) {
  /** Refuse si une compétition de la personne est ouverte (#1882) */
  const assertNotBusy = (ref: PrivacyPersonRef): void => {
    if (db.privacy.competitionIdsOf(ref).some(id => isCompetitionBusy(id))) {
      throw new Error(COMPETITION_OPEN_ERROR);
    }
  };

  // Archive chiffrée choisie par Fichier → Ouvrir, en attente du mot de passe
  let pendingEncrypted: string | null = null;

  /** Fichier → Ouvrir sur une archive chiffrée : demande du mot de passe au renderer */
  const requestEncryptedOpen = (filepath: string): void => {
    pendingEncrypted = filepath;
    getMainWindow()?.webContents.send('privacy:encrypted-bpm', path.basename(filepath));
  };

  const register = (): void => {
    ipcMain.handle('privacy:getSettings', async () => readPrivacySettings(userDataDir()));

    ipcMain.handle('privacy:setSettings', async (_, input: unknown) => {
      if (!input || typeof input !== 'object') return { success: false, error: 'invalid_settings' };
      const settings = sanitizePrivacySettings(input, readPrivacySettings(userDataDir()));
      writePrivacySettings(userDataDir(), settings);
      setNameMasking(settings.nameMasking);
      return { success: true, settings };
    });

    ipcMain.handle('privacy:findPersons', async (_, query: unknown) =>
      typeof query === 'string' ? db.privacy.findPersons(query.slice(0, 100)) : []
    );

    ipcMain.handle('privacy:getPersonData', async (_, ref: unknown) =>
      db.privacy.exportPerson(asRef(ref))
    );

    ipcMain.handle('privacy:exportPerson', async (_, ref: unknown, defaultName: unknown) => {
      const data = db.privacy.exportPerson(asRef(ref));
      if (data.competitions.length === 0 && data.club.length === 0) {
        return { success: false, error: 'not_found' };
      }
      const win = getMainWindow();
      const opts = {
        defaultPath: `${safeFileName(defaultName, 'donnees-personnelles')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      await fs.promises.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
      return { success: true, path: result.filePath };
    });

    ipcMain.handle('privacy:anonymizePerson', async (_, input: unknown) => {
      const ref = asRef(input);
      assertNotBusy(ref);
      const r = db.privacy.anonymizePerson(ref);
      db.compactAfterErasure?.();
      return r;
    });

    ipcMain.handle('privacy:erasePerson', async (_, input: unknown) => {
      const ref = asRef(input);
      assertNotBusy(ref);
      const r = db.privacy.erasePerson(ref);
      db.compactAfterErasure?.();
      return r;
    });

    ipcMain.handle('privacy:retentionCandidates', async () => {
      const s = readPrivacySettings(userDataDir());
      return db.privacy.listRetentionCandidates(
        retentionCutoff(s.competitionRetentionMonths),
        retentionCutoff(s.memberRetentionMonths)
      );
    });

    ipcMain.handle('privacy:applyRetention', async (_, selection: unknown) => {
      const r = asRecord(selection);
      const sel =
        selection && typeof selection === 'object'
          ? { competitionIds: strIds(r.competitionIds), memberIds: strIds(r.memberIds) }
          : undefined;
      return applyRetention(
        db,
        readPrivacySettings(userDataDir()),
        sel,
        new Date(),
        isCompetitionBusy
      );
    });

    ipcMain.handle(
      'privacy:exportEncryptedBpm',
      async (_, competitionId: unknown, password: unknown) => {
        if (typeof password !== 'string' || password.length < MIN_BPM_PASSWORD) {
          return { success: false, error: 'password_too_short' };
        }
        const id = typeof competitionId === 'string' && competitionId ? competitionId : null;
        const competition = id ? db.getCompetition(id) : null;
        if (id && !competition) return { success: false, error: 'competition_not_found' };
        const win = getMainWindow();
        const opts = {
          defaultPath: `${safeFileName(competition?.title, 'competition')}.bpm`,
          filters: [{ name: 'BellePoule', extensions: ['bpm'] }],
        };
        const result = win
          ? await dialog.showSaveDialog(win, opts)
          : await dialog.showSaveDialog(opts);
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        // Copie en clair sous userData uniquement, jamais au chemin choisi (#1882)
        const plain = path.join(
          path.dirname(db.getPath()),
          `.export-${Date.now()}-${Math.random().toString(36).slice(2)}.bpm`
        );
        try {
          if (id) await db.exportCompetitionToFile(id, plain);
          else await db.exportToFile(plain);
          await encryptBpmFileTo(plain, result.filePath, password);
          return { success: true, path: result.filePath };
        } catch (e) {
          await fs.promises.unlink(`${result.filePath}.enc-tmp`).catch(() => undefined);
          return { success: false, error: String(e) };
        } finally {
          for (const f of [plain, `${plain}-wal`, `${plain}-shm`, `${plain}-journal`]) {
            await fs.promises.unlink(f).catch(() => undefined);
          }
        }
      }
    );

    ipcMain.handle('privacy:openEncryptedBpm', async (_, password: unknown) => {
      if (!pendingEncrypted) return { success: false, error: 'no_pending_file' };
      if (typeof password !== 'string' || !password) {
        return { success: false, error: 'wrong_password' };
      }
      const tmp = path.join(
        path.dirname(db.getPath()),
        `.decrypt-${Date.now()}-${Math.random().toString(36).slice(2)}.bpm`
      );
      try {
        await decryptBpmFile(pendingEncrypted, tmp, password);
        const ids = await db.mergeFromFile(tmp);
        const opened = pendingEncrypted;
        pendingEncrypted = null;
        getMainWindow()?.webContents.send('file:opened', opened, ids);
        return { success: true, ids };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: msg === 'wrong_password' ? msg : 'open_failed' };
      } finally {
        for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) {
          await fs.promises.unlink(f).catch(() => undefined);
        }
      }
    });

    ipcMain.handle('privacy:cancelEncryptedBpm', async () => {
      pendingEncrypted = null;
    });
  };

  return { register, requestEncryptedOpen };
}
