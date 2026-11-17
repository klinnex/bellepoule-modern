/**
 * BellePoule Modern - Miroir des réglages du poste vers la base (#1880)
 * Langue, thème, logo, HTTPS et interface du serveur distant vivent encore dans
 * localStorage côté écran ; ils sont recopiés dans app_settings pour le mode --headless
 * et le MCP. Reprise au démarrage (clés absentes de la base), puis à chaque écriture.
 * Licensed under GPL-3.0
 */
import { LEGACY_LOCAL_STORAGE_KEYS } from '../../shared/types/appSettings';

const KEYS = Object.keys(LEGACY_LOCAL_STORAGE_KEYS);
let installed = false;

function send(values: Record<string, string | null>, mode: 'missing' | 'write'): void {
  const api = window.electronAPI?.settings;
  if (!api) return;
  void api.importLegacy(values, mode).catch(() => undefined);
}

/** À appeler une fois la base prête ; sans effet si déjà installé */
export function installAppSettingsMirror(storage: Storage = window.localStorage): void {
  if (installed || !window.electronAPI?.settings) return;
  installed = true;
  const initial: Record<string, string | null> = {};
  for (const key of KEYS) {
    const v = storage.getItem(key);
    if (v !== null) initial[key] = v;
  }
  send(initial, 'missing');

  // Une seule interception pour les nombreux écrivains existants (Paramètres, thème, logo…)
  const proto = Object.getPrototypeOf(storage) as Storage;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  proto.setItem = function (this: Storage, key: string, value: string): void {
    setItem.call(this, key, value);
    if (this === storage && KEYS.includes(key)) send({ [key]: String(value) }, 'write');
  };
  proto.removeItem = function (this: Storage, key: string): void {
    removeItem.call(this, key);
    // Seul le logo a un sens « effacé » (null) ; les autres reviennent à la valeur par défaut
    if (this === storage && key === 'bellepoule-logo') send({ [key]: null }, 'write');
  };
}

/** Tests seulement */
export function _resetAppSettingsMirror(): void {
  installed = false;
}
