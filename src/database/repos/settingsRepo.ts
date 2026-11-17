/**
 * BellePoule Modern - Paramétrage global du poste (app_settings) et salles (venues,
 * venue_strips) (#1880, lot 0). Valeurs JSON validées par clé (shared/types/appSettings).
 * Licensed under GPL-3.0
 */
import { v4 as uuidv4 } from 'uuid';
import type { SqlExecutor } from './sqlExecutor';
import {
  APP_SETTINGS_DEFAULTS,
  APP_SETTING_KEYS,
  MAX_VENUE_STRIPS,
  validateAppSetting,
  type AppSettingKey,
  type AppSettings,
  type Venue,
  type VenueInput,
  type VenueStrip,
} from '../../shared/types/appSettings';

interface VenueRow {
  id: string;
  name: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface StripRow {
  venue_id: string;
  number: number;
  label: string | null;
  cyrano_config: string | null;
}

const parseConfig = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Pistes normalisées : numéros entiers 1…MAX, uniques, triés ; libellé texte court */
export function normalizeVenueStrips(input: VenueInput): VenueStrip[] {
  const source: VenueStrip[] =
    input.strips ??
    Array.from({ length: Math.max(0, Math.floor(Number(input.stripCount) || 0)) }, (_, i) => ({
      number: i + 1,
    }));
  const seen = new Set<number>();
  const out: VenueStrip[] = [];
  for (const s of source) {
    const n = Math.floor(Number(s?.number));
    if (!Number.isFinite(n) || n < 1 || n > MAX_VENUE_STRIPS || seen.has(n)) continue;
    seen.add(n);
    const label = typeof s.label === 'string' ? s.label.trim().slice(0, 40) : '';
    const cfg = s.cyranoConfig;
    out.push({
      number: n,
      ...(label ? { label } : {}),
      ...(cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? { cyranoConfig: cfg } : {}),
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

export class SettingsRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // ─── app_settings ────────────────────────────────────────────────────────

  /** Valeurs enregistrées (clés absentes = jamais modifiées) ; valeurs illisibles ignorées */
  public getStoredSettings(): Partial<AppSettings> {
    if (!this.sql.db) return {};
    const rows = this.sql.queryAll<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings'
    );
    const out: Partial<Record<AppSettingKey, unknown>> = {};
    for (const row of rows) {
      if (!(APP_SETTING_KEYS as string[]).includes(row.key)) continue;
      const key = row.key as AppSettingKey;
      try {
        out[key] = validateAppSetting(key, JSON.parse(row.value));
      } catch {
        /* valeur corrompue : valeur par défaut */
      }
    }
    return out as Partial<AppSettings>;
  }

  /** Paramètres effectifs : base, sinon valeur par défaut du code */
  public getSettings(): AppSettings {
    return { ...APP_SETTINGS_DEFAULTS, ...this.getStoredSettings() };
  }

  public getSetting<K extends AppSettingKey>(key: K): AppSettings[K] {
    return this.getSettings()[key];
  }

  /** Enregistre plusieurs paramètres (tout ou rien) ; renvoie les paramètres effectifs */
  public updateSettings(updates: Partial<Record<AppSettingKey, unknown>>): AppSettings {
    if (!this.sql.db) throw new Error('Database not open');
    const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
    for (const [key] of entries) {
      if (!(APP_SETTING_KEYS as string[]).includes(key))
        throw new Error(`Paramètre inconnu : ${key}`);
    }
    const validated = entries.map(
      ([key, value]) => [key, validateAppSetting(key as AppSettingKey, value)] as const
    );
    const now = new Date().toISOString();
    this.sql.transaction(() => {
      for (const [key, value] of validated) {
        this.sql.run(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, JSON.stringify(value), now]
        );
      }
    });
    return this.getSettings();
  }

  /**
   * Reprise douce (valeurs envoyées par le renderer depuis localStorage) :
   * n'écrit que les clés jamais enregistrées en base. Valeurs invalides ignorées.
   */
  public importLegacySettings(values: Partial<Record<AppSettingKey, unknown>>): AppSettingKey[] {
    const stored = this.getStoredSettings();
    const toWrite: Partial<Record<AppSettingKey, unknown>> = {};
    for (const [key, value] of Object.entries(values)) {
      const k = key as AppSettingKey;
      if (value === undefined || k in stored || !(APP_SETTING_KEYS as string[]).includes(k))
        continue;
      try {
        toWrite[k] = validateAppSetting(k, value);
      } catch {
        /* valeur historique invalide : ignorée */
      }
    }
    if (Object.keys(toWrite).length > 0) this.updateSettings(toWrite);
    return Object.keys(toWrite) as AppSettingKey[];
  }

  // ─── Salles ──────────────────────────────────────────────────────────────

  public listVenues(): Venue[] {
    if (!this.sql.db) return [];
    const venues = this.sql.queryAll<VenueRow>(
      'SELECT * FROM venues ORDER BY is_default DESC, name COLLATE NOCASE ASC'
    );
    const strips = this.sql.queryAll<StripRow>(
      'SELECT * FROM venue_strips ORDER BY venue_id, number'
    );
    return venues.map(v => ({
      id: v.id,
      name: v.name,
      isDefault: v.is_default === 1,
      strips: strips
        .filter(s => s.venue_id === v.id)
        .map(s => {
          const cfg = parseConfig(s.cyrano_config);
          return {
            number: s.number,
            ...(s.label ? { label: s.label } : {}),
            ...(cfg ? { cyranoConfig: cfg } : {}),
          };
        }),
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    }));
  }

  public getVenue(id: string): Venue | null {
    return this.listVenues().find(v => v.id === id) ?? null;
  }

  public getDefaultVenue(): Venue | null {
    return this.listVenues().find(v => v.isDefault) ?? null;
  }

  /** Crée ou remplace une salle et ses pistes (transaction) */
  public upsertVenue(input: VenueInput): Venue {
    if (!this.sql.db) throw new Error('Database not open');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
    if (!name) throw new Error('Nom de salle obligatoire');
    const strips = normalizeVenueStrips(input);
    const now = new Date().toISOString();
    const id = input.id ?? uuidv4();
    this.sql.transaction(() => {
      const exists = input.id
        ? this.sql.queryOne<{ id: string }>('SELECT id FROM venues WHERE id = ?', [input.id])
        : null;
      if (input.id && !exists) throw new Error(`Salle introuvable : ${input.id}`);
      // Première salle : salle par défaut d'office
      const first = !this.sql.queryOne<{ n: number }>('SELECT 1 AS n FROM venues LIMIT 1');
      if (exists) {
        this.sql.run('UPDATE venues SET name = ?, updated_at = ? WHERE id = ?', [name, now, id]);
        this.sql.run('DELETE FROM venue_strips WHERE venue_id = ?', [id]);
      } else {
        this.sql.run(
          'INSERT INTO venues (id, name, is_default, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
          [id, name, now, now]
        );
      }
      for (const s of strips) {
        this.sql.run(
          'INSERT INTO venue_strips (venue_id, number, label, cyrano_config) VALUES (?, ?, ?, ?)',
          [id, s.number, s.label ?? null, s.cyranoConfig ? JSON.stringify(s.cyranoConfig) : null]
        );
      }
      if (input.isDefault || first) this.setDefaultVenue(id);
    });
    return this.getVenue(id)!;
  }

  public setDefaultVenue(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      if (!this.sql.queryOne<{ id: string }>('SELECT id FROM venues WHERE id = ?', [id])) {
        throw new Error(`Salle introuvable : ${id}`);
      }
      this.sql.run('UPDATE venues SET is_default = 0 WHERE is_default = 1');
      this.sql.run('UPDATE venues SET is_default = 1, updated_at = ? WHERE id = ?', [
        new Date().toISOString(),
        id,
      ]);
    });
  }

  public deleteVenue(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      this.sql.run('DELETE FROM venue_strips WHERE venue_id = ?', [id]);
      this.sql.run('DELETE FROM venues WHERE id = ?', [id]);
      this.sql.run('UPDATE event_days SET venue_id = NULL WHERE venue_id = ?', [id]);
      this.sql.run('UPDATE club_sessions SET venue_id = NULL WHERE venue_id = ?', [id]);
    });
  }

  /** Nombre de pistes de la salle par défaut (plus grand numéro) ; null si aucune salle déclarée */
  public defaultVenueStripCount(): number | null {
    const venue = this.getDefaultVenue();
    return venue && venue.strips.length > 0 ? Math.max(...venue.strips.map(s => s.number)) : null;
  }
}
