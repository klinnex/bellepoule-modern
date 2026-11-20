/**
 * BellePoule Modern - Client abstrait du contrat d'API (#1981)
 * L'écran appelle un BpmClient ; IpcClient (Electron) aujourd'hui, WsClient (navigateur) au lot 3.
 * Même forme d'erreur quel que soit le transport : ApiError { code, message }.
 * Licensed under GPL-3.0
 */
import type { CommandName, Input, Output, QueryName, SubscriptionName } from './contract';

export interface BpmClient {
  call<K extends CommandName>(name: K, input: Input<K>): Promise<Output<K>>;
  query<K extends QueryName>(name: K, input: Input<K>): Promise<Output<K>>;
  subscribe<K extends SubscriptionName>(
    name: K,
    input: Input<K>,
    cb: (event: Output<K>) => void
  ): () => void;
}

/** Codes communs ; une erreur métier garde son code (ex. score_above_max) */
export type ApiErrorCode = 'invalid_input' | 'unknown_operation' | 'internal' | (string & {});

export interface ApiErrorData {
  code: ApiErrorCode;
  message: string;
}

/** Réponse d'un transport : l'IPC Electron perd les classes d'erreur, d'où l'enveloppe */
export type ApiEnvelope<T = unknown> = { ok: true; data: T } | { ok: false; error: ApiErrorData };

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON(): ApiErrorData {
    return { code: this.code, message: this.message };
  }
}

/** Enveloppe → donnée, ou ApiError levée */
export function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope && envelope.ok) return envelope.data;
  const error = envelope && !envelope.ok ? envelope.error : undefined;
  throw new ApiError(error?.code ?? 'internal', error?.message ?? 'Réponse invalide');
}

/** Transport IPC du contrat d'API (préload → IpcClient) */
export interface ApiBridge {
  invoke: (name: string, input: unknown) => Promise<ApiEnvelope>;
  subscribe: (id: string, name: string, input: unknown) => Promise<ApiEnvelope<null>>;
  unsubscribe: (id: string) => void;
  onEvent: (callback: (id: string, event: unknown) => void) => () => void;
}
