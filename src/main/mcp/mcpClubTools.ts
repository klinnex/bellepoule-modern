/**
 * BellePoule Modern - Outils MCP : séances du Mode Club (#1872, #1880)
 * Lister, lire, préparer, ouvrir, fermer et rouvrir les séances d'un club, pointer les
 * membres, compléter le bilan. Mêmes dépôts que l'écran (`db.club`) ; fermer la séance
 * la délie du serveur d'entraînement, comme le fait `club:closeSession`.
 * Données personnelles minimales : noms seulement (ni licence, ni date de naissance).
 * Outils d'écriture proposés seulement si « Autoriser l'écriture » est coché.
 * Licensed under GPL-3.0
 */

import type { ClubSession, ClubSessionInput } from '../../shared/types/club';
import { Weapon } from '../../shared/types';
import { linkedClubSession, setLinkedClubSession } from '../remote/clubArena';
import { McpToolError, type McpDeps, type McpTool } from './mcpTools';
import { dryRunOf, type McpWriteTool } from './mcpWriteTools';
import { optBool, optInt, optPick, optStr, reqStr } from './mcpDomain';

type Args = Record<string, unknown>;

const STATUSES = ['planned', 'open', 'closed'] as const;
const WEAPONS = [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE, Weapon.LASER] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MEMBERS_PER_CALL = 200;

const sessionIdProp = {
  sessionId: { type: 'string', description: 'Identifiant de la séance (list_club_sessions)' },
};
const dryRunProp = {
  dryRun: { type: 'boolean', description: 'Décrit le résultat sans rien écrire' },
};

/** Erreur du dépôt (séance ou membre inconnu, date invalide…) → résultat `isError` */
function asToolError(e: unknown): never {
  throw new McpToolError(e instanceof Error ? e.message : 'Séance invalide');
}

function clubSessionOrThrow(deps: McpDeps, id: string): ClubSession {
  const s = deps.db.club.getSession(id);
  if (!s) throw new McpToolError(`Séance inconnue : ${id}`);
  return s;
}

/** Séance sans détail personnel : pour les listes et les réponses d'écriture */
const sessionSummary = (deps: McpDeps, s: ClubSession) => ({
  id: s.id,
  clubId: s.clubId,
  clubName: deps.db.club.getClub(s.clubId)?.name ?? null,
  date: s.date,
  label: s.label ?? null,
  status: s.status,
  weapon: s.weapon ?? null,
  stripCount: s.stripCount,
  attendeeCount: s.attendeeIds.length,
  coachCount: s.coachIds.length,
  openedAt: s.openedAt,
  closedAt: s.closedAt ?? null,
});

/** Nom d'un membre ou d'un maître d'armes, sans données personnelles */
const nameOf = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();

function parseMemberIds(args: Args, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v) || v.length === 0) {
    throw new McpToolError(`Argument « ${key} » : liste d'identifiants non vide attendue`);
  }
  if (v.length > MAX_MEMBERS_PER_CALL) {
    throw new McpToolError(`« ${key} » : ${MAX_MEMBERS_PER_CALL} identifiants au plus`);
  }
  if (!v.every(x => typeof x === 'string' && x.length > 0 && x.length <= 64)) {
    throw new McpToolError(`« ${key} » : identifiants texte attendus`);
  }
  return [...new Set(v as string[])];
}

function parseDate(args: Args, key: string, required: boolean): string | undefined {
  const v = required ? reqStr(args, key, 10) : optStr(args, key, 10);
  if (v !== undefined && !ISO_DATE.test(v)) {
    throw new McpToolError(`« ${key} » : date AAAA-MM-JJ attendue`);
  }
  return v;
}

function parseCoachIds(args: Args): string[] | undefined {
  if (args.coachIds === undefined) return undefined;
  const v = args.coachIds;
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string' && x.length <= 64)) {
    throw new McpToolError('« coachIds » : liste d’identifiants de maîtres d’armes attendue');
  }
  return [...new Set(v as string[])];
}

/** Bilan : note 1 à 5 et textes courts ; seuls les champs fournis sont modifiés */
function parseFeedback(args: Args): ClubSessionInput['feedback'] | undefined {
  const v = args.feedback;
  if (v === undefined) return undefined;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new McpToolError('« feedback » : objet { rating?, wentWell?, toImprove? } attendu');
  }
  const f = v as Record<string, unknown>;
  if (
    f.rating !== undefined &&
    (!Number.isInteger(f.rating) || (f.rating as number) < 1 || (f.rating as number) > 5)
  ) {
    throw new McpToolError('« feedback.rating » : entier entre 1 et 5');
  }
  const rating = f.rating as number | undefined;
  const text = (k: string) => {
    if (f[k] === undefined) return undefined;
    if (typeof f[k] !== 'string' || (f[k] as string).length > 2000) {
      throw new McpToolError(`« feedback.${k} » : texte de 2000 caractères au plus`);
    }
    return f[k] as string;
  };
  return { rating, wentWell: text('wentWell'), toImprove: text('toImprove') };
}

export const MCP_CLUB_READ_TOOLS: McpTool[] = [
  {
    name: 'list_clubs',
    title: 'Lister les clubs',
    description: 'Clubs du Mode Club : identifiant, nom, nombre de pistes, arme par défaut.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: ({ db }) =>
      db.club.listClubs().map(c => ({
        id: c.id,
        name: c.name,
        stripCount: c.stripCount,
        weapon: c.weapon ?? null,
      })),
  },
  {
    name: 'list_club_sessions',
    title: 'Lister les séances d’un club',
    description:
      'Séances d’un club, les plus récentes d’abord : identifiant, date, intitulé, statut (planned : préparée ; open : ouverte ; closed : fermée), nombre de présents. Filtres facultatifs par période et par statut.',
    inputSchema: {
      type: 'object',
      properties: {
        clubId: { type: 'string', description: 'Identifiant du club (list_clubs)' },
        from: { type: 'string', description: 'Date minimale AAAA-MM-JJ' },
        to: { type: 'string', description: 'Date maximale AAAA-MM-JJ' },
        status: { type: 'string', enum: [...STATUSES] },
      },
      required: ['clubId'],
    },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const clubId = reqStr(args, 'clubId', 64);
      const from = parseDate(args, 'from', false);
      const to = parseDate(args, 'to', false);
      const status = optPick(args, 'status', STATUSES);
      if (!deps.db.club.getClub(clubId)) throw new McpToolError(`Club inconnu : ${clubId}`);
      return deps.db.club
        .listSessions(clubId, { from, to })
        .filter(s => !status || s.status === status)
        .map(s => sessionSummary(deps, s));
    },
  },
  {
    name: 'get_club_session',
    title: 'Détail d’une séance',
    description:
      'Séance d’un club : date, intitulé, arme, statut, maîtres d’armes et présents (noms), plan de cours (titres et durées), objectifs, notes et bilan.',
    inputSchema: { type: 'object', properties: { ...sessionIdProp }, required: ['sessionId'] },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const s = clubSessionOrThrow(deps, reqStr(args, 'sessionId', 64));
      const coaches = deps.db.club.listCoaches(s.clubId, true);
      const members = deps.db.club.listMembers(s.clubId, true);
      return {
        ...sessionSummary(deps, s),
        ageFrom: s.ageFrom ?? null,
        ageTo: s.ageTo ?? null,
        objectives: s.objectives ?? null,
        coaches: s.coachIds.map(id => {
          const c = coaches.find(x => x.id === id);
          return { id, name: c ? nameOf(c) : null };
        }),
        attendees: s.attendeeIds.map(id => {
          const m = members.find(x => x.id === id);
          return { id, name: m ? nameOf(m) : null };
        }),
        plan: s.plan.map(p => ({ title: p.title, minutes: p.minutes, done: p.done ?? false })),
        notes: s.notes ?? null,
        feedback: s.feedback ?? null,
      };
    },
  },
];

export const MCP_CLUB_TOOLS: McpWriteTool[] = [
  {
    name: 'create_club_session',
    title: 'Créer une séance',
    description:
      'Crée une séance d’un club : date, intitulé, arme, pistes, maîtres d’armes, objectifs, tranche d’âge du cours. « planned: true » la prépare sans l’ouvrir (start_club_session l’ouvre ensuite) ; sinon elle est ouverte tout de suite.',
    inputSchema: {
      type: 'object',
      properties: {
        clubId: { type: 'string', description: 'Identifiant du club (list_clubs)' },
        date: { type: 'string', description: 'Date AAAA-MM-JJ' },
        label: { type: 'string', description: 'Intitulé de la séance' },
        weapon: {
          type: 'string',
          enum: [...WEAPONS],
          description: 'Arme (règles de la saisie distante)',
        },
        stripCount: { type: 'number', description: 'Nombre de pistes' },
        coachIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Maîtres d’armes encadrant (identifiants du club)',
        },
        objectives: { type: 'string' },
        planned: { type: 'boolean', description: 'Séance préparée, non ouverte' },
        ageFrom: { type: 'string', description: 'Catégorie d’âge de début du cours (U9 … V4)' },
        ageTo: { type: 'string', description: 'Catégorie d’âge de fin du cours (U9 … V4)' },
        ...dryRunProp,
      },
      required: ['clubId', 'date'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, args) => {
      const clubId = reqStr(args, 'clubId', 64);
      const input: ClubSessionInput = {
        date: parseDate(args, 'date', true)!,
        label: optStr(args, 'label', 120),
        weapon: optPick(args, 'weapon', WEAPONS),
        stripCount: optInt(args, 'stripCount', 1, 100),
        coachIds: parseCoachIds(args),
        objectives: optStr(args, 'objectives', 4000),
        planned: optBool(args, 'planned'),
        ageFrom: optStr(args, 'ageFrom', 8),
        ageTo: optStr(args, 'ageTo', 8),
      };
      if (!deps.db.club.getClub(clubId)) throw new McpToolError(`Club inconnu : ${clubId}`);
      if (dryRunOf(args)) return { dryRun: true, wouldCreate: { clubId, ...input } };
      try {
        return sessionSummary(deps, deps.db.club.createSession(clubId, input));
      } catch (e) {
        asToolError(e);
      }
    },
  },
  {
    name: 'start_club_session',
    title: 'Ouvrir une séance préparée',
    description:
      'Ouvre une séance préparée (statut planned). Les autres séances ouvertes restent ouvertes.',
    inputSchema: {
      type: 'object',
      properties: { ...sessionIdProp, ...dryRunProp },
      required: ['sessionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, args) => {
      const s = clubSessionOrThrow(deps, reqStr(args, 'sessionId', 64));
      if (s.status !== 'planned') {
        throw new McpToolError(`Séance non préparée (statut ${s.status}) : ouverture impossible`);
      }
      if (dryRunOf(args)) return { dryRun: true, wouldOpen: s.id };
      return sessionSummary(deps, deps.db.club.startSession(s.id) ?? s);
    },
  },
  {
    name: 'close_club_session',
    title: 'Fermer une séance',
    description:
      'Ferme une séance ouverte. Les combats non terminés sont annulés et la séance est déliée du serveur d’entraînement. Réouverture possible (reopen_club_session).',
    inputSchema: {
      type: 'object',
      properties: { ...sessionIdProp, ...dryRunProp },
      required: ['sessionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, args) => {
      const s = clubSessionOrThrow(deps, reqStr(args, 'sessionId', 64));
      if (s.status !== 'open') {
        throw new McpToolError(`Séance non ouverte (statut ${s.status}) : fermeture impossible`);
      }
      if (dryRunOf(args)) return { dryRun: true, wouldClose: s.id };
      if (linkedClubSession() === s.id) setLinkedClubSession(null);
      return sessionSummary(deps, deps.db.club.closeSession(s.id) ?? s);
    },
  },
  {
    name: 'reopen_club_session',
    title: 'Rouvrir une séance',
    description: 'Rouvre une séance fermée.',
    inputSchema: {
      type: 'object',
      properties: { ...sessionIdProp, ...dryRunProp },
      required: ['sessionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, args) => {
      const s = clubSessionOrThrow(deps, reqStr(args, 'sessionId', 64));
      if (s.status !== 'closed') {
        throw new McpToolError(`Séance non fermée (statut ${s.status}) : réouverture impossible`);
      }
      if (dryRunOf(args)) return { dryRun: true, wouldReopen: s.id };
      return sessionSummary(deps, deps.db.club.reopenSession(s.id) ?? s);
    },
  },
  {
    name: 'update_club_session',
    title: 'Modifier une séance',
    description:
      'Modifie une séance : date, intitulé, arme, pistes, maîtres d’armes, objectifs, notes, tranche d’âge, bilan (note 1 à 5, points forts, à améliorer). Seuls les champs fournis changent.',
    inputSchema: {
      type: 'object',
      properties: {
        ...sessionIdProp,
        date: { type: 'string', description: 'Date AAAA-MM-JJ' },
        label: { type: 'string' },
        weapon: { type: 'string', enum: [...WEAPONS] },
        stripCount: { type: 'number' },
        coachIds: { type: 'array', items: { type: 'string' } },
        objectives: { type: 'string' },
        notes: { type: 'string', description: 'Compte rendu du maître d’armes' },
        feedback: {
          type: 'object',
          description: 'Bilan : rating (1 à 5), wentWell, toImprove',
          properties: {
            rating: { type: 'number' },
            wentWell: { type: 'string' },
            toImprove: { type: 'string' },
          },
        },
        ...dryRunProp,
      },
      required: ['sessionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      const s = clubSessionOrThrow(deps, reqStr(args, 'sessionId', 64));
      const updates: Partial<ClubSessionInput> = {
        date: parseDate(args, 'date', false),
        label: optStr(args, 'label', 120),
        weapon: optPick(args, 'weapon', WEAPONS),
        stripCount: optInt(args, 'stripCount', 1, 100),
        coachIds: parseCoachIds(args),
        objectives: optStr(args, 'objectives', 4000),
        notes: optStr(args, 'notes', 8000),
        feedback: parseFeedback(args),
      };
      for (const k of Object.keys(updates) as (keyof ClubSessionInput)[]) {
        if (updates[k] === undefined) delete updates[k];
      }
      if (Object.keys(updates).length === 0) {
        throw new McpToolError('Aucun champ à modifier');
      }
      if (dryRunOf(args)) return { dryRun: true, sessionId: s.id, wouldUpdate: updates };
      try {
        return sessionSummary(deps, deps.db.club.updateSession(s.id, updates) ?? s);
      } catch (e) {
        asToolError(e);
      }
    },
  },
  {
    name: 'check_in_club_members',
    title: 'Pointer les membres d’une séance',
    description:
      'Pointe (present: true) ou dépointe (present: false) des membres du club pour une séance. Les identifiants viennent de list_members côté écran ; get_club_session donne les présents.',
    inputSchema: {
      type: 'object',
      properties: {
        ...sessionIdProp,
        memberIds: {
          type: 'array',
          items: { type: 'string' },
          description: `Identifiants des membres (${MAX_MEMBERS_PER_CALL} au plus)`,
        },
        present: { type: 'boolean', description: 'true : pointer ; false : dépointer' },
        ...dryRunProp,
      },
      required: ['sessionId', 'memberIds', 'present'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      const s = clubSessionOrThrow(deps, reqStr(args, 'sessionId', 64));
      const memberIds = parseMemberIds(args, 'memberIds');
      const present = optBool(args, 'present');
      if (present === undefined) throw new McpToolError('Argument « present » requis');
      if (dryRunOf(args)) return { dryRun: true, sessionId: s.id, memberIds, present };
      try {
        for (const id of memberIds) deps.db.club.setAttendance(s.id, id, present);
      } catch (e) {
        asToolError(e);
      }
      const after = clubSessionOrThrow(deps, s.id);
      return { ...sessionSummary(deps, after), changed: memberIds.length };
    },
  },
];
