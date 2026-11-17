/**
 * BellePoule Modern - Création et réinitialisation des arènes du serveur distant
 * (extrait de remoteScoreServer.ts, #1896).
 * Licensed under GPL-3.0
 */
import type { Arena } from '../../shared/types/remote';
import type { RemoteScoreServer } from '../remoteScoreServer';
import { logger, LogCategory } from '../../shared/services/logger';

type S = RemoteScoreServer;
const NET = LogCategory.NETWORK;

export interface ArenaSetupContext {
  readonly arenas: S['arenas'];
  arenaCount: S['arenaCount'];
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenaEventBuffer: S['arenaEventBuffer'];
  readonly arenaNextMatchIndex: S['arenaNextMatchIndex'];
  readonly clearArenaCombatState: S['clearArenaCombatState'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly assignMatchToArena: S['assignMatchToArena'];
  readonly updateArena: S['updateArena'];
  readonly persistArenaState: S['persistArenaState'];
}

/** Arène `i` vide (file d'attente comprise) */
export function createArena(ctx: ArenaSetupContext, i: number): void {
  const arena: Arena = {
    id: `arena${i}`,
    name: `Arène ${i}`,
    number: i,
    currentMatch: null,
    status: 'idle',
    startTime: null,
    settings: {
      matchDuration: 180, // 3 minutes par défaut
      breakDuration: 30, // 30 secondes entre les matchs
      autoAdvance: false,
    },
  };
  ctx.arenas.set(arena.id, arena);
  ctx.arenaMatchQueue.set(arena.id, []);
  logger.info(NET, `[RemoteScoreServer] Arène ${i} créée ✓`);
}

/** Recrée `arenaCount` arènes ; les mots de passe des arènes sont conservés */
export function initializeArenas(ctx: ArenaSetupContext, arenaCount = 4): void {
  ctx.arenaCount = arenaCount;
  logger.info(NET, `[RemoteScoreServer] Initialisation de ${arenaCount} arènes...`);
  const savedPasswords = new Map<string, string>();
  ctx.arenas.forEach((arena, id) => {
    if (arena.password) savedPasswords.set(id, arena.password);
  });
  ctx.arenas.clear();
  ctx.arenaEventBuffer.clear();
  ctx.arenaMatchQueue.clear();
  ctx.arenaNextMatchIndex.clear();
  ctx.clearArenaCombatState();

  for (let i = 1; i <= arenaCount; i++) createArena(ctx, i);
  savedPasswords.forEach((pwd, id) => {
    const arena = ctx.arenas.get(id);
    if (arena) arena.password = pwd;
  });
  logger.info(NET, `[RemoteScoreServer] ${arenaCount} arènes initialisées avec succès ✓`);
}

/** Fin des vagues : match de poule non commencé retiré des pistes, place au tableau (#1118) */
export function dropPendingPoolMatches(ctx: ArenaSetupContext): void {
  for (const [arenaId, arena] of ctx.arenas) {
    const cur = arena.currentMatch;
    if (!cur?.poolId || cur.isTableau || arena.status === 'in_progress') continue;
    ctx.arenaRefereeSelected.set(arenaId, false);
    const queue = (ctx.arenaMatchQueue.get(arenaId) || []).filter(m => !m.poolId || m.isTableau);
    const next = queue[0];
    ctx.arenaMatchQueue.set(arenaId, queue.slice(next ? 1 : 0));
    if (next) {
      ctx.assignMatchToArena(arenaId, next);
    } else {
      arena.currentMatch = null;
      arena.status = 'idle';
      arena.startTime = null;
      ctx.updateArena(arenaId, { status: 'idle', currentMatch: null, startTime: null });
      ctx.persistArenaState(arenaId);
    }
  }
}

/** Champs et méthodes du serveur exposés à ce contexte via liveContext (#1896) */
export const ARENA_SETUP_CONTEXT_KEYS = {
  state: [
    'arenas',
    'arenaCount',
    'arenaMatchQueue',
    'arenaEventBuffer',
    'arenaNextMatchIndex',
    'arenaRefereeSelected',
  ],
  methods: ['clearArenaCombatState', 'assignMatchToArena', 'updateArena', 'persistArenaState'],
} as const;
