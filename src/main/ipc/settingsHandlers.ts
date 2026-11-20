/**
 * BellePoule Modern - Handlers IPC `settings:*` : paramétrage global du poste et salles (#1880)
 * Canaux : settings:get, settings:update, settings:importLegacy, settings:resolve,
 *          settings:listVenues, settings:upsertVenue, settings:setDefaultVenue, settings:deleteVenue,
 *          settings:getAgentFolders, settings:addAgentFolder, settings:removeAgentFolder
 * Licensed under GPL-3.0
 */
import { dialog, ipcMain, type BrowserWindow } from 'electron';
import type { DatabaseManager } from '../../database';
import type { AppSettingKey, VenueInput } from '../../shared/types/appSettings';
import { LEGACY_LOCAL_STORAGE_KEYS, fromLegacyStorage } from '../../shared/types/appSettings';
import { resolveSetting, type ResolvableKey, type SettingScope } from '../engine/commands/settings';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export interface SettingsHandlersContext {
  db: DatabaseManager;
  /** Dossiers accessibles à l'agent tant que l'opérateur n'en a pas choisi */
  defaultAgentFolders?: string[];
  getMainWindow?: () => BrowserWindow | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Valeurs localStorage (clé historique → texte) converties en paramètres typés */
export function legacyValuesToSettings(
  values: Record<string, unknown>
): Partial<Record<AppSettingKey, unknown>> {
  const out: Partial<Record<AppSettingKey, unknown>> = {};
  for (const [storageKey, settingKey] of Object.entries(LEGACY_LOCAL_STORAGE_KEYS)) {
    if (!(storageKey in values)) continue;
    const raw = values[storageKey];
    const v = fromLegacyStorage(settingKey, typeof raw === 'string' ? raw : null);
    if (v !== undefined) out[settingKey] = v;
  }
  return out;
}

export function registerSettingsHandlers({
  db,
  defaultAgentFolders = [],
  getMainWindow,
}: SettingsHandlersContext): void {
  const ctx = { db };
  ipcMain.handle('settings:get', () => db.settings.getSettings());

  ipcMain.handle('settings:update', (_, updates: unknown) => {
    if (!isRecord(updates)) throw new Error('settings:update : objet attendu');
    return db.settings.updateSettings(updates);
  });

  // Reprise douce + miroir : valeurs localStorage du renderer (clés historiques).
  // mode 'missing' (démarrage) : seules les clés absentes de la base ; 'write' : écriture courante.
  ipcMain.handle('settings:importLegacy', (_, values: unknown, mode: unknown) => {
    if (!isRecord(values)) return [];
    const settings = legacyValuesToSettings(values);
    if (mode === 'write') {
      const written: string[] = [];
      for (const [key, value] of Object.entries(settings)) {
        try {
          db.settings.updateSettings({ [key]: value });
          written.push(key);
        } catch (e) {
          logger.warn(LogCategory.SYSTEM, `settings:importLegacy ${key} ignoré`, toError(e));
        }
      }
      return written;
    }
    return db.settings.importLegacySettings(settings);
  });

  ipcMain.handle('settings:resolve', (_, key: unknown, scope: unknown) => {
    if (typeof key !== 'string') throw new Error('settings:resolve : clé attendue');
    return resolveSetting(
      ctx,
      key as ResolvableKey,
      (isRecord(scope) ? scope : {}) as SettingScope
    );
  });

  // Dossiers où l'agent (MCP) lit des fichiers d'import et écrit des exports. Un dossier
  // n'entre dans la liste que par une boîte de dialogue native du main.
  const agentFolders = () => ({
    folders: db.settings.getSetting('agentFolders'),
    defaults: defaultAgentFolders,
  });
  ipcMain.handle('settings:getAgentFolders', agentFolders);
  ipcMain.handle('settings:addAgentFolder', async () => {
    const win = getMainWindow?.() ?? null;
    const options = { properties: ['openDirectory' as const] };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const chosen = result.canceled ? undefined : result.filePaths[0];
    if (chosen) {
      const current = db.settings.getSetting('agentFolders');
      if (!current.includes(chosen)) {
        db.settings.updateSettings({ agentFolders: [...current, chosen] });
      }
    }
    return agentFolders();
  });
  ipcMain.handle('settings:removeAgentFolder', (_, folder: unknown) => {
    const current = db.settings.getSetting('agentFolders');
    db.settings.updateSettings({ agentFolders: current.filter(f => f !== folder) });
    return agentFolders();
  });

  ipcMain.handle('settings:listVenues', () => db.settings.listVenues());
  ipcMain.handle('settings:upsertVenue', (_, input: unknown) => {
    if (!isRecord(input)) throw new Error('settings:upsertVenue : objet attendu');
    return db.settings.upsertVenue(input as unknown as VenueInput);
  });
  ipcMain.handle('settings:setDefaultVenue', (_, id: unknown) => {
    if (typeof id !== 'string') throw new Error('settings:setDefaultVenue : id attendu');
    db.settings.setDefaultVenue(id);
  });
  ipcMain.handle('settings:deleteVenue', (_, id: unknown) => {
    if (typeof id !== 'string') throw new Error('settings:deleteVenue : id attendu');
    db.settings.deleteVenue(id);
  });
}
