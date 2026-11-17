/**
 * BellePoule Modern - Outils MCP : paramétrage du poste, salles, et compléments du lot 2
 * (arbitres, serveur distant, suppression d'épreuve) (#1880).
 * Outils d'écriture proposés seulement si « Autoriser l'écriture » est coché.
 * Licensed under GPL-3.0
 */

import type { Competition } from '../../shared/types';
import type { ImportedReferee } from '../../shared/utils/fileParser';
import { parseEngardeRefereeFile, parseXMLFile } from '../../shared/utils/fileParser';
import { syncDay } from '../ipc/eventDayHandlers';
import {
  getSettings,
  listVenues,
  resolveSetting,
  setDefaultVenue,
  updateSettings,
  upsertVenue,
} from '../domain/settings';
import { McpToolError, type McpTool } from './mcpTools';
import {
  competitionOrThrow,
  dryRunOf,
  keysOf,
  pick,
  readImportFile,
  type McpWriteDeps,
  type McpWriteTool,
} from './mcpWriteTools';
import {
  guard,
  optBool,
  optInt,
  optPick,
  optStr,
  readDomain,
  reqStr,
  writeDomain,
} from './mcpDomain';

type Args = Record<string, unknown>;

const competitionId = {
  competitionId: {
    type: 'string',
    description: 'Identifiant de la compétition (list_competitions)',
  },
};
const dryRun = { dryRun: { type: 'boolean', description: 'Décrit le résultat sans rien écrire' } };
const LANGUAGES = ['fr', 'en', 'br', 'ca', 'de', 'es', 'pt', 'it', 'ru', 'zh-HK'] as const;
const REFEREE_WEAPONS = ['E', 'F', 'S'] as const;

/** Arbitres d'un fichier : bloc <Arbitres> d'un XML, sinon format Engarde (« ; ») */
function readReferees(deps: McpWriteDeps, file: unknown) {
  const content = readImportFile(file, ['.txt', '.csv', '.xml'], deps.allowedRoots?.());
  if (content.trimStart().startsWith('<')) {
    const xml = parseXMLFile(content);
    return { referees: xml.referees ?? [], errors: xml.errors };
  }
  const engarde = parseEngardeRefereeFile(content);
  return { referees: engarde.referees as ImportedReferee[], errors: engarde.errors };
}

/** Garde les arbitres absents de `existing` (licence, ou nom + prénom), sans doublon interne */
function newReferees(referees: ImportedReferee[], existing: Set<string>): ImportedReferee[] {
  return referees.filter(r => {
    if (!r.lastName && !r.firstName) return false;
    const keys = keysOf(r);
    if (keys.some(k => existing.has(k))) return false;
    keys.forEach(k => existing.add(k));
    return true;
  });
}

function importReferees(deps: McpWriteDeps, args: Args) {
  const { db } = deps;
  const dry = dryRunOf(args);
  const parsed = readReferees(deps, args.path);
  const report = (toAdd: ImportedReferee[]) => ({
    dryRun: dry,
    read: parsed.referees.length,
    [dry ? 'toAdd' : 'added']: toAdd.length,
    duplicates: parsed.referees.length - toAdd.length,
    errors: parsed.errors.slice(0, 20),
  });

  if (typeof args.dayId === 'string') {
    const day = db.eventDays.getDay(args.dayId);
    if (!day) throw new McpToolError(`Journée inconnue : ${args.dayId}`);
    const weapons = Array.isArray(args.weapons)
      ? [...new Set(args.weapons.map(w => pick(w, REFEREE_WEAPONS, 'weapons')))]
      : [];
    const toAdd = newReferees(
      parsed.referees,
      new Set(db.eventDays.listReferees(day.id).flatMap(r => keysOf(r)))
    );
    if (!dry && toAdd.length > 0) {
      db.transaction(() => {
        for (const r of toAdd) {
          db.eventDays.createReferee(day.id, {
            firstName: r.firstName,
            lastName: r.lastName,
            club: r.club,
            license: r.license,
            category: r.category,
            weapons: weapons as never,
          });
        }
        // Arbitres de la journée reportés dans ses épreuves (selon leurs armes)
        syncDay(db, day.id);
      });
      deps.notify('competitions:changed');
    }
    return {
      ...report(toAdd),
      // Sans arme : l'arbitre officie à toutes les armes, à confirmer avec le DT
      withoutWeapons: weapons.length === 0 ? toAdd.length : 0,
    };
  }

  const competition = competitionOrThrow(deps, args.competitionId);
  const toAdd = newReferees(
    parsed.referees,
    new Set(db.getRefereesByCompetition(competition.id).flatMap(r => keysOf(r)))
  );
  if (!dry && toAdd.length > 0) {
    db.transaction(() => {
      for (const r of toAdd) {
        db.createReferee(competition.id, {
          name: `${r.firstName} ${r.lastName}`.trim(),
          club: r.club,
          license: r.license,
          category: r.category,
          nationality: r.nationality,
          gender: r.gender,
        });
      }
      // Arbitres importés : gestion des arbitres activée d'office, comme à l'écran (#1504)
      if (!competition.settings?.refereeFeatureEnabled) {
        db.updateCompetition(competition.id, {
          settings: {
            ...competition.settings,
            refereeFeatureEnabled: true,
          } as Competition['settings'],
        });
      }
    });
    deps.notify('competitions:changed', competition.id);
  }
  return report(toAdd);
}

export const MCP_ADMIN_READ_TOOLS: McpTool[] = [
  {
    name: 'get_settings',
    title: 'Paramètres du poste',
    description:
      'Paramètres globaux du poste (langue, thème, HTTPS et interface du serveur distant) et nombre de pistes de la salle par défaut. Aucun secret.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: deps => {
      const ctx = readDomain(deps);
      const { logo, agentFolders: _folders, ...settings } = getSettings(ctx);
      return { ...settings, hasLogo: !!logo, defaultStripCount: resolveSetting(ctx, 'stripCount') };
    },
  },
  {
    name: 'list_venues',
    title: 'Lister les salles',
    description:
      'Salles déclarées et leurs pistes ; la salle par défaut fournit ses pistes aux journées.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: deps => listVenues(readDomain(deps)),
  },
];

export const MCP_ADMIN_TOOLS: McpWriteTool[] = [
  {
    name: 'update_settings',
    title: 'Modifier les paramètres du poste',
    description:
      'Modifie des paramètres globaux validés par schéma. Les réglages du serveur MCP et les dossiers accessibles à l’agent ne se changent que dans l’application.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: [...LANGUAGES] },
        theme: { type: 'string' },
        remoteHttps: { type: 'boolean', description: 'Serveur distant en HTTPS' },
        remoteInterface: {
          type: 'string',
          description: 'Interface d’écoute du serveur distant (0.0.0.0 = toutes)',
        },
        ...dryRun,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      // Liste fermée : ni logo, ni dossiers de l'agent
      const updates = {
        language: optPick(args, 'language', LANGUAGES),
        theme: optStr(args, 'theme', 64),
        remoteHttps: optBool(args, 'remoteHttps'),
        remoteInterface: optStr(args, 'remoteInterface', 15),
      };
      if (dryRunOf(args)) return { dryRun: true, wouldUpdate: updates };
      try {
        const {
          logo: _logo,
          agentFolders: _folders,
          ...settings
        } = updateSettings(writeDomain(deps), updates);
        return settings;
      } catch (e) {
        throw new McpToolError(e instanceof Error ? e.message : 'Paramètre invalide');
      }
    },
  },
  {
    name: 'upsert_venue',
    title: 'Déclarer une salle',
    description:
      'Crée ou remplace une salle et ses pistes. La première salle devient la salle par défaut ; ses pistes sont reprises par les nouvelles journées.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Salle existante à remplacer (absent = création)' },
        name: { type: 'string' },
        stripCount: { type: 'number', description: 'Nombre de pistes numérotées 1…n' },
        isDefault: { type: 'boolean', description: 'Salle par défaut' },
        ...dryRun,
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      const input = {
        id: optStr(args, 'id', 64),
        name: reqStr(args, 'name', 80),
        stripCount: optInt(args, 'stripCount', 0, 100),
        isDefault: optBool(args, 'isDefault'),
      };
      if (dryRunOf(args)) return { dryRun: true, wouldSave: input };
      try {
        return upsertVenue(writeDomain(deps), input);
      } catch (e) {
        throw new McpToolError(e instanceof Error ? e.message : 'Salle invalide');
      }
    },
  },
  {
    name: 'set_default_venue',
    title: 'Salle par défaut',
    description: 'Choisit la salle utilisée par défaut (list_venues).',
    inputSchema: {
      type: 'object',
      properties: { venueId: { type: 'string' } },
      required: ['venueId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      try {
        return setDefaultVenue(writeDomain(deps), reqStr(args, 'venueId', 64));
      } catch (e) {
        throw new McpToolError(e instanceof Error ? e.message : 'Salle inconnue');
      }
    },
  },
  {
    name: 'import_referees',
    title: 'Importer des arbitres',
    description:
      'Importe un fichier d’arbitres (Engarde .txt / .csv, ou XML avec <Arbitres>) dans une épreuve (« competitionId »), ou dans le groupe d’une journée (« dayId », avec leurs armes d’arbitrage) puis les reporte dans ses épreuves. Doublons ignorés.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionId,
        dayId: { type: 'string', description: 'Journée (day_overview) : arbitres partagés' },
        path: { type: 'string', description: 'Chemin absolu du fichier sur le poste DT' },
        weapons: {
          type: 'array',
          items: { type: 'string', enum: [...REFEREE_WEAPONS] },
          description: 'Armes d’arbitrage (journée) ; vide = toutes',
        },
        ...dryRun,
      },
      required: ['path'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => importReferees(deps, args),
  },
  {
    name: 'start_remote_server',
    title: 'Démarrer le serveur distant',
    description:
      'Démarre le serveur des tablettes d’arbitre et écrans d’arène d’une épreuve (HTTPS et interface : paramètres du poste). Il écoute sur le réseau local : accord du DT indispensable.',
    inputSchema: {
      type: 'object',
      properties: { ...competitionId, port: { type: 'number', description: 'Port (défaut 8066)' } },
      required: ['competitionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: async (deps, args) => {
      const competition = competitionOrThrow(deps, args.competitionId);
      if (!deps.startRemote) throw new McpToolError('Serveur distant indisponible');
      const result = await deps.startRemote(competition.id, optInt(args, 'port', 1024, 65535));
      if (!result.success) throw new McpToolError(`Démarrage impossible : ${result.error ?? ''}`);
      return result.serverInfo;
    },
  },
  {
    name: 'stop_remote_server',
    title: 'Arrêter le serveur distant',
    description:
      'Arrête le serveur distant d’une épreuve : tablettes et écrans déconnectés. Accord du DT indispensable.',
    inputSchema: { type: 'object', properties: competitionId, required: ['competitionId'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    run: (deps, args) => {
      const competition = competitionOrThrow(deps, args.competitionId);
      if (!deps.stopRemote?.(competition.id)) {
        throw new McpToolError('Aucun serveur distant pour cette épreuve');
      }
      return { stopped: true };
    },
  },
  {
    name: 'delete_competition',
    title: 'Supprimer une épreuve',
    description:
      'Supprime définitivement une épreuve et toutes ses données. Exige son titre exact (« confirmTitle ») et l’accord du DT.',
    inputSchema: {
      type: 'object',
      properties: { ...competitionId, confirmTitle: { type: 'string' }, ...dryRun },
      required: ['competitionId', 'confirmTitle'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    run: (deps, args) => {
      const competition = competitionOrThrow(deps, args.competitionId);
      if (competition.title !== args.confirmTitle) {
        throw new McpToolError('Le titre de confirmation ne correspond pas');
      }
      const fencers = deps.db.getFencersByCompetition(competition.id).length;
      if (dryRunOf(args)) return { dryRun: true, wouldDelete: competition.title, fencers };
      deps.stopRemote?.(competition.id);
      guard(() => deps.db.deleteCompetition(competition.id));
      deps.notify('competitions:changed');
      return { deleted: competition.id, title: competition.title, fencers };
    },
  },
];
