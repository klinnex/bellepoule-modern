/**
 * BellePoule Modern - Adaptateur IPC du contrat d'API (#1981)
 * Trois canaux pour toutes les opérations : api:invoke (commande, requête), api:subscribe /
 * api:unsubscribe (abonnements, événements sur api:event). Réponse en enveloppe ApiEnvelope.
 * Licensed under GPL-3.0
 */
import { ipcMain, type WebContents } from 'electron';
import type { ApiEnvelope } from '../../../shared/api/client';
import type { CommandContext } from '../commands/context';
import { invoke, subscribe, toApiError } from './engine';

export const API_CHANNELS = {
  invoke: 'api:invoke',
  subscribe: 'api:subscribe',
  unsubscribe: 'api:unsubscribe',
  event: 'api:event',
} as const;

/** Exécute une opération et rend une enveloppe sérialisable (sans exception) */
export async function invokeEnvelope(
  ctx: CommandContext,
  name: unknown,
  input: unknown
): Promise<ApiEnvelope> {
  try {
    return { ok: true, data: await invoke(ctx, name, input) };
  } catch (e) {
    return { ok: false, error: toApiError(e).toJSON() };
  }
}

export function registerApiHandlers(ctx: CommandContext): void {
  /** Abonnements actifs par fenêtre : id fourni par le renderer → désabonnement */
  const subs = new Map<WebContents, Map<string, () => void>>();
  const release = (sender: WebContents, id?: string) => {
    const own = subs.get(sender);
    if (!own) return;
    for (const [key, off] of own) {
      if (id !== undefined && key !== id) continue;
      off();
      own.delete(key);
    }
    if (own.size === 0) subs.delete(sender);
  };

  ipcMain.handle(API_CHANNELS.invoke, (_e, name: unknown, input: unknown) =>
    invokeEnvelope(ctx, name, input)
  );

  ipcMain.handle(
    API_CHANNELS.subscribe,
    (e, id: unknown, name: unknown, input: unknown): ApiEnvelope<null> => {
      const sender = e.sender;
      try {
        if (typeof id !== 'string' || !id || id.length > 100) {
          throw toApiError(new Error('identifiant d’abonnement invalide'));
        }
        const off = subscribe(ctx, name, input, event => {
          if (!sender.isDestroyed()) sender.send(API_CHANNELS.event, id, event);
        });
        let own = subs.get(sender);
        if (!own) {
          own = new Map();
          subs.set(sender, own);
          sender.once('destroyed', () => release(sender));
        }
        own.get(id)?.();
        own.set(id, off);
        return { ok: true, data: null };
      } catch (err) {
        return { ok: false, error: toApiError(err).toJSON() };
      }
    }
  );

  ipcMain.on(API_CHANNELS.unsubscribe, (e, id: unknown) => {
    if (typeof id === 'string') release(e.sender, id);
  });
}
