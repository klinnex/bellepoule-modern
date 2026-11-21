/**
 * BellePoule Modern - Moteur du contrat d'API (#1981)
 * Implémentation de chaque opération du contrat, validation des entrées et forme d'erreur
 * unique (ApiError) : les adaptateurs IPC, MCP et (lot 3) WebSocket passent tous par ici.
 * Licensed under GPL-3.0
 */
import type { z } from 'zod';
import {
  contract,
  type Contract,
  type OperationName,
  type Output,
  type ParsedInput,
} from '../../../shared/api/contract';
import { ApiError } from '../../../shared/api/client';
import { CommandError, type CommandContext } from '../commands/context';
import { recordScore } from '../commands/sport';
import {
  assignPoolReferee,
  assignPoolReferees,
  setRefereeingSettings,
} from '../commands/refereeing';
import { checkInFencers } from '../commands/checkIn';
import { getCompetitionOrThrow } from '../commands/competitions';
import { v4 as uuidv4 } from 'uuid';
import type { StoredJournalEvent } from '../../../database/repos/eventLogRepo';
import { onCompetitionEvent, publishCompetitionEvent } from './events';
import { logger, LogCategory, toError } from '../../../shared/services/logger';

/** Événement du journal tel que le contrat l'expose (sans l'épreuve, déjà connue) */
const publicEvent = ({ competitionId: _c, ...e }: StoredJournalEvent) => e;

/** Événements manquants joints au refus revision_conflict (borne : le client relit au-delà) */
const CONFLICT_EVENTS = 200;

type Handler<N extends OperationName> = Contract[N]['kind'] extends 'subscription'
  ? (ctx: CommandContext, input: ParsedInput<N>, emit: (event: Output<N>) => void) => () => void
  : (ctx: CommandContext, input: ParsedInput<N>) => Output<N> | Promise<Output<N>>;

export const handlers: { [N in OperationName]: Handler<N> } = {
  checkIn: (ctx, input) => checkInFencers(ctx, input),
  recordScore: (ctx, { competitionId, ...rest }) => recordScore(ctx, competitionId, rest),
  setRefereeingSettings: (ctx, { competitionId, expectedRevision: _r, ...patch }) =>
    setRefereeingSettings(ctx, competitionId, patch),
  assignReferees: (ctx, { competitionId, expectedRevision: _r, ...options }) =>
    assignPoolReferees(ctx, competitionId, options),
  assignReferee: (ctx, { competitionId, expectedRevision: _r, ...input }) =>
    assignPoolReferee(ctx, competitionId, input),
  getMatchCards: (ctx, { matchId }) => ctx.db.getCards(matchId),
  getCardsByMatchIds: (ctx, { matchIds }) => ctx.db.getCardsByMatchIds(matchIds),
  getCompetitionEvents: (ctx, { competitionId, since, limit }) => {
    getCompetitionOrThrow(ctx, competitionId);
    return {
      revision: ctx.db.eventLog.getRevision(competitionId),
      events: ctx.db.eventLog.getSince(competitionId, since ?? 0, limit ?? 1000).map(publicEvent),
    };
  },
  getMatchHistory: (ctx, { competitionId, matchId }) => {
    getCompetitionOrThrow(ctx, competitionId);
    return ctx.db.eventLog.getMatchHistory(competitionId, matchId).map(publicEvent);
  },
  onCompetitionEvents: (_ctx, { competitionId }, emit) =>
    onCompetitionEvent(e => {
      if (!competitionId || !e.competitionId || e.competitionId === competitionId) emit(e);
    }),
};

export const isOperation = (name: unknown): name is OperationName =>
  typeof name === 'string' && Object.prototype.hasOwnProperty.call(contract, name);

/** Message d'entrée invalide, identique pour tous les transports */
export function formatIssues(name: string, error: z.ZodError): string {
  const details = error.issues
    .slice(0, 5)
    .map(i => (i.path.length ? `${i.path.join('.')} : ${i.message}` : i.message))
    .join(' ; ');
  return `Entrée invalide pour « ${name} » — ${details}`;
}

/** Valide l'entrée d'une opération ; ApiError sinon */
export function parseInput<N extends OperationName>(name: N, raw: unknown): ParsedInput<N> {
  const parsed = contract[name].input.safeParse(raw ?? {});
  if (!parsed.success) throw new ApiError('invalid_input', formatIssues(name, parsed.error));
  return parsed.data as ParsedInput<N>;
}

/** Toute erreur → ApiError (code stable, message pour l'opérateur ou l'agent) */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof CommandError) return new ApiError(e.code, e.message);
  logger.error(LogCategory.SYSTEM, '[api] erreur interne', toError(e));
  return new ApiError('internal', 'Erreur interne');
}

export function resolveOperation(name: unknown): OperationName {
  if (!isOperation(name))
    throw new ApiError('unknown_operation', `Opération inconnue : ${String(name)}`);
  return name;
}

/** Commande ou requête : validation puis exécution ; lève ApiError */
export async function invoke(ctx: CommandContext, name: unknown, raw: unknown): Promise<unknown> {
  const op = resolveOperation(name);
  if (contract[op].kind === 'subscription') {
    throw new ApiError('unknown_operation', `« ${op} » est un abonnement`);
  }
  const input = parseInput(op, raw);
  const handler = handlers[op] as (c: CommandContext, i: unknown) => unknown;
  const log = contract[op].kind === 'command' ? journalOf(ctx, input) : null;
  if (!log) {
    try {
      return await handler(ctx, input);
    } catch (e) {
      throw toApiError(e);
    }
  }
  return runJournaled(ctx, handler, input, log);
}

/** Commande d'épreuve journalisée : transaction, révision, diffusion aux abonnés */
function runJournaled(
  ctx: CommandContext,
  handler: (c: CommandContext, i: unknown) => unknown,
  input: unknown,
  log: { competitionId: string; expected?: number; commandId?: string }
): unknown {
  let run: CommandRun<unknown>;
  try {
    run = runCommand(
      ctx,
      log.competitionId,
      { expected: log.expected, commandId: log.commandId },
      commandCtx => handler(commandCtx, input)
    );
  } catch (e) {
    throw toApiError(e);
  }
  const { result, before, after } = run;
  if (after === before) return result;
  // Diffusion à tous les abonnés de l'épreuve (#1980)
  publishCompetitionEvent({
    type: 'journal:appended',
    competitionId: log.competitionId,
    revision: after,
  });
  return result && typeof result === 'object' && !Array.isArray(result)
    ? { ...result, revision: after }
    : result;
}

/**
 * Commande d'épreuve appelée de façon synchrone dans le main (serveur distant, appareils
 * de piste, #1980) : mêmes validation, transaction, journal et diffusion que `invoke`.
 */
export function invokeCommandSync<N extends OperationName>(
  ctx: CommandContext,
  name: N,
  raw: unknown
): Output<N> {
  if (contract[name].kind !== 'command') {
    throw new ApiError('unknown_operation', `« ${name} » n’est pas une commande`);
  }
  const input = parseInput(name, raw);
  const handler = handlers[name] as (c: CommandContext, i: unknown) => unknown;
  const log = journalOf(ctx, input);
  if (!log) throw new ApiError('internal', `« ${name} » : journal de l’épreuve indisponible`);
  return runJournaled(ctx, handler, input, log) as Output<N>;
}

/** Commande portant sur une épreuve dont le journal est disponible */
function journalOf(ctx: CommandContext, input: unknown) {
  const { competitionId, expectedRevision, commandId } = (input ?? {}) as {
    competitionId?: unknown;
    expectedRevision?: unknown;
    commandId?: unknown;
  };
  if (typeof competitionId !== 'string' || !ctx.db.eventLog) return null;
  return {
    competitionId,
    expected: typeof expectedRevision === 'number' ? expectedRevision : undefined,
    commandId: typeof commandId === 'string' ? commandId : undefined,
  };
}

export interface CommandRun<T> {
  result: T;
  /** Révision du journal avant et après la commande */
  before: number;
  after: number;
}

/**
 * Exécute une commande d'épreuve dans UNE transaction (docs/adr/0006) : lecture de la
 * révision, contrôle de `expectedRevision`, écritures (tables et journal), révision
 * finale. Une commande rejouée (même `commandId`, déjà au journal) est refusée par
 * `command_already_applied` sans rien réécrire (docs/adr/0007).
 * Aucune autre écriture ne peut s'intercaler entre le contrôle et l'ajout au
 * journal ; un refus ou une erreur annule tout. La commande doit être synchrone : un
 * `await` ferait valider la transaction avant ses écritures, elle est refusée.
 */
export function runCommand<T>(
  ctx: CommandContext,
  competitionId: string,
  options: { expected?: number; commandId?: string },
  fn: (commandCtx: CommandContext) => T
): CommandRun<T> {
  const body = (): CommandRun<T> => {
    // Idempotence (ADR-0007) : une commande rejouée (même commandId) n'écrit rien
    if (options.commandId && ctx.db.eventLog.hasCommand(competitionId, options.commandId)) {
      const revision = ctx.db.eventLog.getRevision(competitionId);
      throw new ApiError(
        'command_already_applied',
        `Commande ${options.commandId} déjà appliquée : rien de réécrit (révision ${revision})`,
        { revision, commandId: options.commandId }
      );
    }
    const before = checkRevision(ctx, competitionId, options.expected);
    // Identifiant de la commande : commun à ses événements (corrélation, ADR-0007)
    const result = fn({ ...ctx, commandId: options.commandId ?? uuidv4() });
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      // Rejet éventuel de la promesse ignoré : la commande est refusée de toute façon
      (result as unknown as Promise<unknown>).catch(() => undefined);
      throw new ApiError(
        'internal',
        'Commande asynchrone : interdite dans la transaction du journal (ADR-0006)'
      );
    }
    return { result, before, after: ctx.db.eventLog.getRevision(competitionId) };
  };
  // Contexte sans transaction (tests sans base) : même enchaînement, sans atomicité
  return typeof ctx.db.transaction === 'function' ? ctx.db.transaction(body) : body();
}

/** Révision attendue périmée : refus explicite, avec les événements manquants. */
function checkRevision(ctx: CommandContext, competitionId: string, expected?: number): number {
  const current = ctx.db.eventLog.getRevision(competitionId);
  if (expected === undefined || expected === current) return current;
  const missing =
    expected < current
      ? ctx.db.eventLog.getSince(competitionId, expected, CONFLICT_EVENTS).map(publicEvent)
      : [];
  throw new ApiError(
    'revision_conflict',
    `Révision attendue ${expected}, actuelle ${current} : relire le journal (getCompetitionEvents) puis renvoyer`,
    { revision: current, missing }
  );
}

/** Abonnement : validation puis inscription ; retourne la fonction de désabonnement */
export function subscribe(
  ctx: CommandContext,
  name: unknown,
  raw: unknown,
  emit: (event: unknown) => void
): () => void {
  const op = resolveOperation(name);
  if (contract[op].kind !== 'subscription') {
    throw new ApiError('unknown_operation', `« ${op} » n'est pas un abonnement`);
  }
  const input = parseInput(op, raw);
  return (handlers[op] as (c: CommandContext, i: unknown, e: (v: unknown) => void) => () => void)(
    ctx,
    input,
    emit
  );
}
