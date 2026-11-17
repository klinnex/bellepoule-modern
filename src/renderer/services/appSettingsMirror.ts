/**
 * BellePoule Modern - Miroir des réglages du poste vers la base (#1880)
 * Langue, thème, logo, HTTPS et interface du serveur distant vivent encore dans
 * localStorage côté écran ; ils sont recopiés dans app_settings pour le mode --headless
 * et le MCP. Reprise au démarrage (clés absentes de la base), puis à chaque écriture.
 * Licensed under GPL-3.0
 */
import { LEGACY_LOCAL_STORAGE_KEYS } from '../../shared/types/appSettings';

const KEYS = Object.keys(LEGACY_LOCAL_STORAGE_KEYS);
/** Réglages choisis à l'écran à chaque démarrage : recopiés tels quels en base */
const SCREEN_FIRST = ['bellepoule-language', 'bellepoule-theme'];
let installed = false;
/** Stockage suivi (localStorage de la fenêtre) */
let mirrored: Storage | null = null;
const PATCHED = Symbol.for('bellepoule.appSettingsMirror');

function send(values: Record<string, string | null>, mode: 'missing' | 'write'): void {
  const api = window.electronAPI?.settings;
  if (!api) return;
  void api.importLegacy(values, mode).catch(() => undefined);
}

/** À appeler une fois la base prête ; sans effet si déjà installé */
export function installAppSettingsMirror(storage: Storage = window.localStorage): void {
  if (installed || !window.electronAPI?.settings) return;
  installed = true;
  // Langue et thème : l'écran fait foi (le splash vient de les confirmer) ; sinon un agent
  // qui déclenche « settings:changed » ramènerait l'écran à une ancienne langue en base
  const current: Record<string, string | null> = {};
  const initial: Record<string, string | null> = {};
  for (const key of KEYS) {
    const v = storage.getItem(key);
    if (v === null) continue;
    if (SCREEN_FIRST.includes(key)) current[key] = v;
    else initial[key] = v;
  }
  send(current, 'write');
  send(initial, 'missing');

  mirrored = storage;
  // Une seule interception (jamais deux fois) pour les nombreux écrivains existants
  // (Paramètres, thème, logo…)
  const proto = Object.getPrototypeOf(storage) as Storage & { [PATCHED]?: true };
  if (proto[PATCHED]) return;
  proto[PATCHED] = true;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  proto.setItem = function (this: Storage, key: string, value: string): void {
    setItem.call(this, key, value);
    if (this === mirrored && KEYS.includes(key)) send({ [key]: String(value) }, 'write');
  };
  proto.removeItem = function (this: Storage, key: string): void {
    removeItem.call(this, key);
    // Seul le logo a un sens « effacé » (null) ; les autres reviennent à la valeur par défaut
    if (this === mirrored && key === 'bellepoule-logo') send({ [key]: null }, 'write');
  };
}

/** Tests seulement */
export function _resetAppSettingsMirror(): void {
  installed = false;
}
