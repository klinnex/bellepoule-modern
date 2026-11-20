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
  readonly session: S['session'];
  readonly stripPlan: S['stripPlan'];
  readonly setStripPlan: S['setStripPlan'];
}

/** Plus grand numéro de piste qu'une épreuve peut accueillir */
export const MAX_HOSTED_STRIP = 99;

/** La piste `n` peut-elle recevoir du travail de cette épreuve ? (hors pistes indisponibles) */
export function canHostStrip(ctx: ArenaSetupContext, n: number): boolean {
  return (
    Number.isInteger(n) && n >= 1 && n <= MAX_HOSTED_STRIP && !ctx.stripPlan.unavailable.includes(n)
  );
}

/**
 * Piste libérée d'une journée (#1878) : l'épreuve accueille la piste `n` même hors de sa plage.
 * Les arènes manquantes sont créées sans toucher aux existantes (matchs, files, jetons) et
 * héritent du mot de passe de la dernière arène ; la séance et le plan des pistes sont élargis
 * pour que tablettes, kiosque et tableau de bord voient la piste.
 */
export function hostStrip(ctx: ArenaSetupContext, n: number): boolean {
  if (!canHostStrip(ctx, n)) return false;
  if (n > ctx.arenaCount) {
    const inherited = ctx.arenas.get(`arena${ctx.arenaCount}`)?.password;
    for (let i = 1; i <= n; i++) {
      if (ctx.arenas.has(`arena${i}`)) continue;
      createArena(ctx, i);
      if (inherited) ctx.arenas.get(`arena${i}`)!.password = inherited;
    }
    ctx.arenaCount = n;
    const strips = ctx.session?.strips;
    if (strips)
      for (let i = strips.length + 1; i <= n; i++) strips.push({ number: i, status: 'available' });
    logger.info(NET, `[RemoteScoreServer] Arènes étendues jusqu'à la piste ${n} (piste libérée)`);
  }
  // Plan des pistes : la piste reçue devient visible (diffuse aussi la liste des arènes)
  ctx.setStripPlan({ ...ctx.stripPlan, start: Math.min(ctx.stripPlan.start, n) });
  return ctx.arenas.has(`arena${n}`);
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
    'session',
    'stripPlan',
  ],
  methods: [
    'clearArenaCombatState',
    'assignMatchToArena',
    'updateArena',
    'persistArenaState',
    'setStripPlan',
  ],
} as const;
