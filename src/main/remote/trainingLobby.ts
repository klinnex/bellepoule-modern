/**
 * BellePoule Modern - Lobby du mode entraînement (#1500) : occupation des pistes.
 * Une piste est occupée par un seul client (identifiant aléatoire propre à l'onglet) ;
 * elle se libère à la demande (retour lobby, fermeture de page) ou après 3 minutes
 * sans activité du client. Logique pure : l'horloge est injectée.
 * Licensed under GPL-3.0
 */

/** Inactivité au-delà de laquelle une piste est libérée (3 minutes). */
export const LOBBY_IDLE_MS = 3 * 60 * 1000;

/** Identifiant client valide : 8 à 64 caractères alphanumériques, tiret ou souligné. */
export const CLIENT_ID_RE = /^[\w-]{8,64}$/;

export interface LobbyArena {
  number: number;
  occupied: boolean;
  /** Piste tenue par le client demandeur. */
  mine: boolean;
}

export class TrainingLobby {
  private readonly claims = new Map<number, { clientId: string; lastActivity: number }>();

  constructor(private readonly idleMs: number = LOBBY_IDLE_MS) {}

  private purge(now: number): void {
    for (const [arena, c] of this.claims) {
      if (now - c.lastActivity >= this.idleMs) this.claims.delete(arena);
    }
  }

  /** Réserve (ou rafraîchit) la piste. Faux si un autre client la tient. */
  claim(arena: number, clientId: string, now: number = Date.now()): boolean {
    this.purge(now);
    const current = this.claims.get(arena);
    if (current && current.clientId !== clientId) return false;
    // Un client ne tient qu'une piste à la fois : changer de piste libère la précédente
    for (const [other, c] of this.claims) {
      if (c.clientId === clientId && other !== arena) this.claims.delete(other);
    }
    this.claims.set(arena, { clientId, lastActivity: now });
    return true;
  }

  /** Libère la piste si elle est tenue par ce client (sans effet sinon). */
  release(arena: number, clientId: string): void {
    if (this.claims.get(arena)?.clientId === clientId) this.claims.delete(arena);
  }

  /** Libère toutes les pistes d'un client (fermeture de page, retour lobby). */
  releaseAll(clientId: string): void {
    for (const [arena, c] of this.claims) {
      if (c.clientId === clientId) this.claims.delete(arena);
    }
  }

  /** État des pistes vu par `clientId` (peut être vide pour un visiteur anonyme). */
  list(arenaNumbers: number[], clientId: string, now: number = Date.now()): LobbyArena[] {
    this.purge(now);
    return [...arenaNumbers]
      .sort((a, b) => a - b)
      .map(number => {
        const c = this.claims.get(number);
        return { number, occupied: !!c, mine: !!c && c.clientId === clientId };
      });
  }

  clear(): void {
    this.claims.clear();
  }
}
