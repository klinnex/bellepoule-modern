/**
 * BellePoule Modern - API preload du paramétrage du poste et des salles (#1880).
 * Licensed under GPL-3.0
 */
import type { AppSettings, Venue, VenueInput } from './appSettings';

/** Dossiers où l'agent (MCP) lit et écrit ; `folders` vide = `defaults` */
export interface AgentFolders {
  folders: string[];
  /** Documents, Téléchargements, Bureau */
  defaults: string[];
}

/** Paramétrage global du poste et salles (#1880) */
export interface SettingsAPI {
  get: () => Promise<AppSettings>;
  update: (updates: Partial<AppSettings>) => Promise<AppSettings>;
  /** Valeurs localStorage historiques ; 'missing' = reprise au démarrage, 'write' = miroir */
  importLegacy: (
    values: Record<string, string | null>,
    mode: 'missing' | 'write'
  ) => Promise<string[]>;
  resolve: (
    key: string,
    scope?: { competitionId?: string; eventDayId?: string }
  ) => Promise<unknown>;
  listVenues: () => Promise<Venue[]>;
  upsertVenue: (input: VenueInput) => Promise<Venue>;
  setDefaultVenue: (id: string) => Promise<void>;
  deleteVenue: (id: string) => Promise<void>;
  getAgentFolders: () => Promise<AgentFolders>;
  /** Ajoute un dossier choisi dans une boîte de dialogue native du main */
  addAgentFolder: () => Promise<AgentFolders>;
  removeAgentFolder: (folder: string) => Promise<AgentFolders>;
}
