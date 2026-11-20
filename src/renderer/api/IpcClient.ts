/**
 * BellePoule Modern - Client IPC du contrat d'API (#1981)
 * Transport Electron (window.electronAPI.api) ; WsClient le remplacera dans un navigateur.
 * Licensed under GPL-3.0
 */
import { ApiError, unwrap, type BpmClient } from '../../shared/api/client';
import type { ApiBridge } from '../../shared/types/preload';
import { logger, LogCategory } from '../../shared/services/logger';

let nextId = 0;

export class IpcClient implements BpmClient {
  private readonly listeners = new Map<string, (event: unknown) => void>();
  private offEvents: (() => void) | null = null;

  constructor(private readonly bridge: () => ApiBridge | undefined) {}

  private transport(): ApiBridge {
    const b = this.bridge();
    if (!b) throw new ApiError('unavailable', 'API indisponible (hors Electron)');
    return b;
  }

  private async send(name: string, input: unknown): Promise<never> {
    return unwrap(await this.transport().invoke(name, input)) as never;
  }

  call: BpmClient['call'] = (name, input) => this.send(name, input);
  query: BpmClient['query'] = (name, input) => this.send(name, input);

  subscribe: BpmClient['subscribe'] = (name, input, cb) => {
    const bridge = this.transport();
    const id = `s${++nextId}`;
    this.listeners.set(id, cb as (event: unknown) => void);
    this.offEvents ??= bridge.onEvent((subId, event) => this.listeners.get(subId)?.(event));
    let active = true;
    void bridge.subscribe(id, name, input).then(env => {
      if (!env.ok) {
        this.listeners.delete(id);
        if (active)
          logger.warn(LogCategory.UI, `[api] abonnement ${name} refusé : ${env.error.message}`);
      }
    });
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(id);
      bridge.unsubscribe(id);
      if (this.listeners.size === 0) {
        this.offEvents?.();
        this.offEvents = null;
      }
    };
  };
}

/** Client par défaut de l'écran (services hors React) */
export const defaultBpmClient: BpmClient = new IpcClient(() =>
  typeof window === 'undefined' ? undefined : window.electronAPI?.api
);
