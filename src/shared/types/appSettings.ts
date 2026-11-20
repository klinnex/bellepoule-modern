/**
 * BellePoule Modern - Paramétrage global du poste et salles (#1880, lot 0)
 * Données du poste et de la salle, pas d'une épreuve : lues par l'écran, le mode
 * --headless et le serveur MCP depuis la base (table app_settings, venues, venue_strips).
 * Licensed under GPL-3.0
 */

/** Paramètres du poste, clé → type de la valeur */
export interface AppSettings {
  /** Langue de l'interface (fr, en, de, zh-HK…) */
  language: string;
  /** Thème de l'interface */
  theme: string;
  /** Logo des documents (data URL image) ; null = aucun */
  logo: string | null;
  /** Serveur distant en HTTPS */
  remoteHttps: boolean;
  /** Interface d'écoute du serveur distant (0.0.0.0 = toutes) */
  remoteInterface: string;
  /**
   * Dossiers que l'agent (MCP) peut lire et où il peut écrire des exports ; vide = Documents,
   * Téléchargements et Bureau. Non modifiable par l'agent.
   */
  agentFolders: string[];
  /** Économie d'encre à l'impression : fonds retirés, texte et traits en noir (PDF compris) */
  inkSaving: boolean;
}

export type AppSettingKey = keyof AppSettings;

/** Valeurs par défaut du code (dernier niveau de résolution) */
export const APP_SETTINGS_DEFAULTS: Readonly<AppSettings> = Object.freeze({
  language: 'fr',
  theme: 'default',
  logo: null,
  remoteHttps: true,
  remoteInterface: '0.0.0.0',
  agentFolders: [],
  inkSaving: false,
});

export const APP_SETTING_KEYS = Object.keys(APP_SETTINGS_DEFAULTS) as AppSettingKey[];

/** Taille max du logo (data URL), alignée sur l'import de logo des Paramètres */
export const MAX_LOGO_CHARS = 4 * 1024 * 1024;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/**
 * Valide et normalise la valeur d'un paramètre.
 * Lève une erreur explicite si la valeur ne respecte pas le schéma de la clé.
 */
export function validateAppSetting<K extends AppSettingKey>(
  key: K,
  value: unknown
): AppSettings[K] {
  const fail = (expected: string): never => {
    throw new Error(`Paramètre ${key} invalide : ${expected} attendu`);
  };
  switch (key) {
    case 'language':
      if (typeof value !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(value))
        fail('code de langue');
      return value as AppSettings[K];
    case 'theme':
      if (typeof value !== 'string' || !value.trim() || value.length > 64) fail('nom de thème');
      return (value as string).trim() as AppSettings[K];
    case 'logo':
      if (value === null || value === '') return null as AppSettings[K];
      if (
        typeof value !== 'string' ||
        !/^data:image\/[a-z0-9.+-]+;base64,/i.test(value) ||
        value.length > MAX_LOGO_CHARS
      )
        fail('image en data URL (4 Mo max) ou null');
      return value as AppSettings[K];
    case 'remoteHttps':
      if (typeof value !== 'boolean') fail('booléen');
      return value as AppSettings[K];
    case 'remoteInterface':
      if (typeof value !== 'string' || !IPV4.test(value)) fail('adresse IPv4');
      return value as AppSettings[K];
    case 'inkSaving':
      if (typeof value !== 'boolean') fail('booléen');
      return value as AppSettings[K];
    case 'agentFolders':
      if (
        !Array.isArray(value) ||
        value.length > 20 ||
        !value.every(
          v =>
            typeof v === 'string' &&
            v.length <= 1024 &&
            !v.includes('\0') &&
            (v.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(v) || v.startsWith('\\\\'))
        )
      )
        fail('liste de chemins absolus (20 max)');
      return [...new Set(value as string[])] as AppSettings[K];
    default:
      throw new Error(`Paramètre inconnu : ${String(key)}`);
  }
}

/** Clés localStorage historiques du renderer → paramètre en base (reprise douce) */
export const LEGACY_LOCAL_STORAGE_KEYS: Readonly<Record<string, AppSettingKey>> = Object.freeze({
  'bellepoule-language': 'language',
  'bellepoule-theme': 'theme',
  'bellepoule-logo': 'logo',
  'bellepoule-remote-https': 'remoteHttps',
  'bellepoule-remote-interface': 'remoteInterface',
});

/** Convertit une valeur brute de localStorage vers le type du paramètre (null = ignorée) */
export function fromLegacyStorage(key: AppSettingKey, raw: string | null): unknown {
  if (raw === null) return key === 'logo' ? null : undefined;
  if (key === 'remoteHttps') return raw !== 'false';
  return raw;
}

// ─── Salles ────────────────────────────────────────────────────────────────

/** Piste d'une salle */
export interface VenueStrip {
  /** Numéro de piste (1…n) */
  number: number;
  /** Libellé affiché (« Piste bleue ») ; absent = « Piste n » */
  label?: string;
  /** Appareil Cyrano associé (configuration de piste opaque, cf. cyrano_pistes) */
  cyranoConfig?: Record<string, unknown> | null;
}

/** Salle : déclarée une fois, reprise par la journée, la séance club, le serveur distant et Cyrano */
export interface Venue {
  id: string;
  name: string;
  isDefault: boolean;
  strips: VenueStrip[];
  createdAt: string;
  updatedAt: string;
}

export interface VenueInput {
  /** Absent = création */
  id?: string;
  name: string;
  /** Nombre de pistes (numérotées 1…n) si `strips` est absent */
  stripCount?: number;
  strips?: VenueStrip[];
  isDefault?: boolean;
}

export const MAX_VENUE_STRIPS = 100;
