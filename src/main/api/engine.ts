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
} from '../../shared/api/contract';
import { ApiError } from '../../shared/api/client';
import { DomainError, type DomainContext } from '../domain/context';
import { recordScore } from '../domain/sport';
import { checkInFencers } from '../domain/checkIn';
import { onCompetitionEvent } from './events';
import { logger, LogCategory, toError } from '../../shared/services/logger';

type Handler<N extends OperationName> = Contract[N]['kind'] extends 'subscription'
  ? (ctx: DomainContext, input: ParsedInput<N>, emit: (event: Output<N>) => void) => () => void
  : (ctx: DomainContext, input: ParsedInput<N>) => Output<N> | Promise<Output<N>>;

export const handlers: { [N in OperationName]: Handler<N> } = {
  checkIn: (ctx, input) => checkInFencers(ctx, input),
  recordScore: (ctx, { competitionId, ...rest }) => recordScore(ctx, competitionId, rest),
  getMatchCards: (ctx, { matchId }) => ctx.db.getCards(matchId),
  getCardsByMatchIds: (ctx, { matchIds }) => ctx.db.getCardsByMatchIds(matchIds),
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
  if (e instanceof DomainError) return new ApiError(e.code, e.message);
  logger.error(LogCategory.SYSTEM, '[api] erreur interne', toError(e));
  return new ApiError('internal', 'Erreur interne');
}

export function resolveOperation(name: unknown): OperationName {
  if (!isOperation(name))
    throw new ApiError('unknown_operation', `Opération inconnue : ${String(name)}`);
  return name;
}

/** Commande ou requête : validation puis exécution ; lève ApiError */
export async function invoke(ctx: DomainContext, name: unknown, raw: unknown): Promise<unknown> {
  const op = resolveOperation(name);
  if (contract[op].kind === 'subscription') {
    throw new ApiError('unknown_operation', `« ${op} » est un abonnement`);
  }
  const input = parseInput(op, raw);
  try {
    return await (handlers[op] as (c: DomainContext, i: unknown) => unknown)(ctx, input);
  } catch (e) {
    throw toApiError(e);
  }
}

/** Abonnement : validation puis inscription ; retourne la fonction de désabonnement */
export function subscribe(
  ctx: DomainContext,
  name: unknown,
  raw: unknown,
  emit: (event: unknown) => void
): () => void {
  const op = resolveOperation(name);
  if (contract[op].kind !== 'subscription') {
    throw new ApiError('unknown_operation', `« ${op} » n'est pas un abonnement`);
  }
  const input = parseInput(op, raw);
  return (handlers[op] as (c: DomainContext, i: unknown, e: (v: unknown) => void) => () => void)(
    ctx,
    input,
    emit
  );
}
