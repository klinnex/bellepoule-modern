/**
 * BellePoule Modern - Registre des écrans / tablettes connectés au serveur distant
 * (télécommande des écrans). Extrait de remoteScoreServer.ts (#1896, lot 1).
 * Licensed under GPL-3.0
 */
import type { Server as SocketIOServer } from 'socket.io';

export interface ConnectedClient {
  socketId: string;
  clientType: 'arena' | 'kiosk' | 'public' | 'pool' | 'dashboard' | 'lobby' | 'referee';
  arenaId?: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
  lastSeen: string;
  label?: string;
  screenId?: string;
  battery?: { level: number; charging: boolean; updatedAt: string };
}

/** Commande envoyée à un écran (`server:command`) */
export interface ClientCommand {
  type: string;
  url?: string;
  text?: string;
  duration?: number;
}

export interface KioskModeConfig {
  poules: boolean;
  classement: boolean;
  direct: boolean;
  suivants: boolean;
  tableau: boolean;
  rotationSec: number;
  eta?: boolean;
}

export class ClientRegistry {
  /** socketId → client connecté */
  readonly clients = new Map<string, ConnectedClient>();
  /** Libellés persistants par screenId (survivent aux reconnexions) */
  readonly screenLabels = new Map<string, string>();

  constructor(
    private readonly io: () => SocketIOServer,
    /** Liste modifiée : prévenir la fenêtre principale */
    private readonly onChange: () => void
  ) {}

  list(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  send(socketId: string, command: ClientCommand): void {
    this.io().to(socketId).emit('server:command', command);
  }

  broadcast(command: ClientCommand): void {
    this.io().emit('server:command', command);
  }

  rename(socketId: string, label: string): void {
    const client = this.clients.get(socketId);
    if (!client) return;
    client.label = label;
    if (client.screenId) this.screenLabels.set(client.screenId, label);
    this.onChange();
    // Notifier l'écran de son nouveau nom
    this.io()
      .to(socketId)
      .emit('server:command', { type: 'identify', screenLabel: label, duration: 3000 });
  }

  identify(socketId: string): void {
    const client = this.clients.get(socketId);
    const label = client?.label ?? client?.screenId ?? socketId.slice(0, 8);
    this.io()
      .to(socketId)
      .emit('server:command', { type: 'identify', screenLabel: label, duration: 5000 });
  }

  setKioskMode(socketId: string, config: KioskModeConfig): void {
    this.io().to(socketId).emit('server:command', { type: 'kiosk:config', kioskConfig: config });
    this.io().to(socketId).emit('server:command', { type: 'navigate', url: '/kiosk' });
  }
}
