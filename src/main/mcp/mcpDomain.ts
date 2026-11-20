/**
 * BellePoule Modern - Outils MCP : passerelle vers la couche domaine (#1880)
 * Contexte de domaine construit depuis les dépendances des outils, erreurs métier
 * renvoyées à l'agent, lecture des arguments.
 * Licensed under GPL-3.0
 */

import { DomainError, type DomainContext } from '../domain/context';
import { McpToolError, type McpDeps } from './mcpTools';
import type { McpWriteDeps } from './mcpWriteTools';

type Args = Record<string, unknown>;

/** Contexte de domaine en lecture */
export const readDomain = (deps: McpDeps): DomainContext => ({ db: deps.db });

/** Écriture hors écran → événement competition:event de l'écran (MCP, IPC du contrat) */
export function emitChangeVia(notify: McpWriteDeps['notify']): DomainContext['emitChange'] {
  return ({ scope, competitionIds }) => {
    if (scope === 'referees') return;
    const type =
      scope === 'settings'
        ? 'settings:changed'
        : scope === 'session'
          ? 'session:changed'
          : scope === 'fencers'
            ? 'fencers:changed'
            : 'competitions:changed';
    if (competitionIds.length === 0) notify(type);
    for (const id of competitionIds) notify(type, id);
  };
}

/** Contexte de domaine en écriture : l'écran ouvert est prévenu (competition:event) */
export function writeDomain(deps: McpWriteDeps): DomainContext {
  return {
    db: deps.db,
    allowedRoots: deps.allowedRoots,
    emitChange: emitChangeVia(deps.notify),
    actor: { source: 'mcp', author: 'agent' },
  };
}

const asToolError = (e: unknown): unknown =>
  e instanceof DomainError ? new McpToolError(`${e.message} (${e.code})`) : e;

/** Erreur métier du domaine → résultat `isError` lisible par l'agent */
export function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw asToolError(e);
  }
}

export async function guardAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw asToolError(e);
  }
}

export function reqStr(args: Args, key: string, max = 1024): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim() || v.length > max) {
    throw new McpToolError(`Argument « ${key} » requis`);
  }
  return v;
}

export function optStr(args: Args, key: string, max = 1024): string | undefined {
  return args[key] === undefined ? undefined : reqStr(args, key, max);
}

export function optInt(args: Args, key: string, min: number, max: number): number | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new McpToolError(`« ${key} » : entier entre ${min} et ${max}`);
  }
  return v;
}

export function reqInt(args: Args, key: string, min: number, max: number): number {
  const v = optInt(args, key, min, max);
  if (v === undefined) throw new McpToolError(`Argument « ${key} » requis`);
  return v;
}

export function optBool(args: Args, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new McpToolError(`« ${key} » : booléen attendu`);
  return v;
}

export function reqPick<T extends string>(args: Args, key: string, allowed: readonly T[]): T {
  const v = optPick(args, key, allowed);
  if (v === undefined) throw new McpToolError(`Argument « ${key} » requis`);
  return v;
}

export function optPick<T extends string>(
  args: Args,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw new McpToolError(`« ${key} » doit valoir : ${allowed.join(', ')}`);
}
