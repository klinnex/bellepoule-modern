/**
 * BellePoule Modern - Broker MQTT intégré pour OPP2 (#1960)
 * Broker MQTT 3.1.1 minimal, dans le processus main : aucune installation pour le club.
 * Gère : messages retenus, dernière volonté (LWT), QoS 0 / 1 (QoS 2 accepté en entrée,
 * distribué en QoS 1), keepalive, jokers `+` / `#`. Sessions toujours « propres » (pas de
 * file conservée après déconnexion : OPP2 s'appuie sur les messages retenus).
 * BellePoule s'y branche sans socket (`publish` / `subscribe`, interface `Opp2Bus`).
 * Authentification et droits d'écriture : crochets `authenticate` / `authorizePublish`
 * (identifiants par appareil, droits par rôle : lot sécurité de #1960).
 * Licensed under GPL-3.0
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import {
  encodePacket,
  isValidFilter,
  isValidTopic,
  PacketParser,
  PacketType,
  topicMatches,
  type ConnectPacket,
  type MqttPacket,
  type PublishPacket,
  type QoS,
} from './mqttPacket';
import type { Opp2Bus, Opp2BusMessageHandler } from './bus';

export interface BrokerClientInfo {
  clientId: string;
  username?: string;
  address: string;
}

export interface MqttBrokerOptions {
  /** Interface d'écoute ; vide = toutes */
  host?: string;
  /** Contrôle des identifiants à la connexion (absent : tout client accepté) */
  authenticate?: (info: BrokerClientInfo, password: Buffer | undefined) => boolean;
  /** Droit de publier sur un sujet (absent : tout est permis) */
  authorizePublish?: (info: BrokerClientInfo, topic: string) => boolean;
  /** Délai de connexion : CONNECT attendu sous ce délai (ms) */
  connectTimeoutMs?: number;
}

export interface MqttBrokerEvents {
  clientConnected: [info: BrokerClientInfo];
  clientDisconnected: [info: BrokerClientInfo];
  /** Paquet invalide, refus d'authentification ou de publication */
  clientError: [info: BrokerClientInfo | null, reason: string];
}

interface Retained {
  payload: Buffer;
  qos: QoS;
}

interface Delivery {
  topic: string;
  payload: Buffer;
  qos: QoS;
  retain: boolean;
}

class BrokerClient {
  readonly parser = new PacketParser();
  info: BrokerClientInfo;
  connected = false;
  will?: ConnectPacket['will'];
  readonly subscriptions = new Map<string, QoS>();
  private nextId = 0;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private keepaliveMs = 0;
  /** Identifiants QoS 2 reçus, en attente de PUBREL */
  readonly pendingRel = new Set<number>();

  constructor(
    readonly socket: net.Socket,
    private readonly onTimeout: () => void
  ) {
    this.info = { clientId: '', address: socket.remoteAddress ?? '' };
  }

  send(p: MqttPacket): void {
    if (!this.socket.destroyed) this.socket.write(encodePacket(p));
  }

  deliver(d: Delivery, subQos: QoS): void {
    const qos = Math.min(d.qos, subQos, 1) as QoS;
    this.send({
      type: PacketType.PUBLISH,
      topic: d.topic,
      payload: d.payload,
      qos,
      retain: d.retain,
      dup: false,
      packetId: qos > 0 ? this.allocId() : undefined,
    });
  }

  private allocId(): number {
    this.nextId = (this.nextId % 65535) + 1;
    return this.nextId;
  }

  /** Keepalive : 1,5 × l'intervalle annoncé sans paquet → coupure (spéc. MQTT § 3.1.2.10). */
  setKeepalive(seconds: number): void {
    this.keepaliveMs = seconds > 0 ? seconds * 1500 : 0;
    this.touch();
  }

  touch(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = this.keepaliveMs ? setTimeout(this.onTimeout, this.keepaliveMs) : null;
  }

  dispose(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }
}

interface LocalSub {
  filter: string;
  handler: Opp2BusMessageHandler;
}

export class MqttBroker extends EventEmitter<MqttBrokerEvents> implements Opp2Bus {
  private server: net.Server | null = null;
  private readonly clients = new Set<BrokerClient>();
  private readonly byId = new Map<string, BrokerClient>();
  private readonly retained = new Map<string, Retained>();
  private readonly local = new Set<LocalSub>();
  private boundPort = 0;

  constructor(private readonly options: MqttBrokerOptions = {}) {
    super();
  }

  get running(): boolean {
    return this.server !== null;
  }

  get port(): number {
    return this.boundPort;
  }

  /** Clients connectés (identifiant, utilisateur, adresse). */
  getClients(): BrokerClientInfo[] {
    return [...this.clients].filter(c => c.connected).map(c => ({ ...c.info }));
  }

  /** Démarre l'écoute TCP ; renvoie le port effectif (0 = port libre choisi par le système). */
  start(port = 1883): Promise<number> {
    if (this.server) return Promise.resolve(this.boundPort);
    return new Promise((resolve, reject) => {
      const server = net.createServer(socket => this.accept(socket));
      server.once('error', reject);
      server.listen(port, this.options.host || undefined, () => {
        server.off('error', reject);
        server.on('error', () => undefined);
        this.server = server;
        const addr = server.address();
        this.boundPort = typeof addr === 'object' && addr ? addr.port : port;
        resolve(this.boundPort);
      });
    });
  }

  /** Arrête le broker : clients coupés sans dernière volonté, messages retenus conservés. */
  stop(): Promise<void> {
    const server = this.server;
    if (!server) return Promise.resolve();
    this.server = null;
    for (const c of [...this.clients]) {
      c.will = undefined;
      c.socket.destroy();
      this.drop(c);
    }
    return new Promise(resolve => server.close(() => resolve()));
  }

  // ── Interface Opp2Bus (client interne, sans socket) ──────────────────────────

  publish(
    topic: string,
    payload: Buffer | string,
    opts: { qos?: QoS; retain?: boolean } = {}
  ): void {
    if (!isValidTopic(topic)) return;
    const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
    this.route({ topic, payload: buf, qos: opts.qos ?? 0, retain: opts.retain ?? false });
  }

  subscribe(filter: string, handler: Opp2BusMessageHandler): () => void {
    if (!isValidFilter(filter)) throw new Error(`filtre MQTT invalide : ${filter}`);
    const sub: LocalSub = { filter, handler };
    this.local.add(sub);
    for (const [topic, r] of this.retained)
      if (topicMatches(filter, topic)) this.callLocal(sub, topic, r.payload, true);
    return () => this.local.delete(sub);
  }

  /** Message retenu sur un sujet (diagnostic, tests). */
  getRetained(topic: string): Buffer | undefined {
    return this.retained.get(topic)?.payload;
  }

  // ── Réseau ───────────────────────────────────────────────────────────────────

  private accept(socket: net.Socket): void {
    socket.setNoDelay(true);
    const client = new BrokerClient(socket, () => socket.destroy());
    this.clients.add(client);
    const connectTimer = setTimeout(() => {
      if (!client.connected) socket.destroy();
    }, this.options.connectTimeoutMs ?? 10_000);
    socket.on('data', chunk => {
      let packets: MqttPacket[];
      try {
        packets = client.parser.push(chunk);
      } catch (err) {
        this.emit('clientError', client.connected ? client.info : null, String(err));
        socket.destroy();
        return;
      }
      for (const p of packets) {
        if (socket.destroyed) return;
        client.touch();
        this.handle(client, p);
      }
    });
    socket.on('error', () => undefined);
    socket.on('close', () => {
      clearTimeout(connectTimer);
      this.drop(client);
    });
  }

  /** Fin de connexion : dernière volonté publiée si la coupure n'était pas annoncée. */
  private drop(client: BrokerClient): void {
    if (!this.clients.delete(client)) return;
    client.dispose();
    if (this.byId.get(client.info.clientId) === client) this.byId.delete(client.info.clientId);
    if (!client.connected) return;
    client.connected = false;
    const will = client.will;
    client.will = undefined;
    if (will) this.route({ ...will, retain: will.retain });
    this.emit('clientDisconnected', client.info);
  }

  private handle(client: BrokerClient, p: MqttPacket): void {
    if (!client.connected && p.type !== PacketType.CONNECT) {
      client.socket.destroy();
      return;
    }
    switch (p.type) {
      case PacketType.CONNECT:
        this.onConnect(client, p);
        return;
      case PacketType.PUBLISH:
        this.onPublish(client, p);
        return;
      case PacketType.PUBREL:
        client.pendingRel.delete(p.packetId);
        client.send({ type: PacketType.PUBCOMP, packetId: p.packetId });
        return;
      case PacketType.SUBSCRIBE: {
        const granted = p.subscriptions.map(s => {
          if (!isValidFilter(s.filter)) return 0x80;
          const qos = Math.min(s.qos, 1) as QoS;
          client.subscriptions.set(s.filter, qos);
          return qos;
        });
        client.send({ type: PacketType.SUBACK, packetId: p.packetId, granted });
        // Messages retenus envoyés après le SUBACK (spéc. MQTT § 3.3.1.3)
        p.subscriptions.forEach((s, i) => {
          if (granted[i] === 0x80) return;
          for (const [topic, r] of this.retained)
            if (topicMatches(s.filter, topic))
              client.deliver(
                { topic, payload: r.payload, qos: r.qos, retain: true },
                granted[i] as QoS
              );
        });
        return;
      }
      case PacketType.UNSUBSCRIBE:
        for (const f of p.filters) client.subscriptions.delete(f);
        client.send({ type: PacketType.UNSUBACK, packetId: p.packetId });
        return;
      case PacketType.PINGREQ:
        client.send({ type: PacketType.PINGRESP });
        return;
      case PacketType.DISCONNECT:
        client.will = undefined;
        client.socket.end();
        return;
      default:
        // PUBACK / PUBREC / PUBCOMP des livraisons sortantes : sessions propres, rien à suivre
        return;
    }
  }

  private onConnect(client: BrokerClient, p: ConnectPacket): void {
    if (client.connected) {
      // Second CONNECT : violation du protocole
      client.socket.destroy();
      return;
    }
    const supported =
      (p.protocolName === 'MQTT' && p.protocolLevel === 4) ||
      (p.protocolName === 'MQIsdp' && p.protocolLevel === 3);
    if (!supported) {
      client.send({ type: PacketType.CONNACK, sessionPresent: false, returnCode: 1 });
      client.socket.end();
      return;
    }
    const clientId = p.clientId || `bp-${Math.random().toString(36).slice(2, 10)}`;
    client.info = { clientId, username: p.username, address: client.info.address };
    if (this.options.authenticate && !this.options.authenticate(client.info, p.password)) {
      this.emit('clientError', client.info, 'authentification refusée');
      client.send({ type: PacketType.CONNACK, sessionPresent: false, returnCode: 5 });
      client.socket.end();
      return;
    }
    if (p.will && !isValidTopic(p.will.topic)) {
      client.socket.destroy();
      return;
    }
    // Même identifiant déjà connecté : l'ancienne connexion est coupée (spéc. MQTT § 3.1.4)
    const previous = this.byId.get(clientId);
    if (previous && previous !== client) previous.socket.destroy();
    this.byId.set(clientId, client);
    client.connected = true;
    client.will = p.will && this.mayPublish(client, p.will.topic) ? p.will : undefined;
    client.setKeepalive(p.keepalive);
    client.send({ type: PacketType.CONNACK, sessionPresent: false, returnCode: 0 });
    this.emit('clientConnected', client.info);
  }

  private mayPublish(client: BrokerClient, topic: string): boolean {
    return !this.options.authorizePublish || this.options.authorizePublish(client.info, topic);
  }

  private onPublish(client: BrokerClient, p: PublishPacket): void {
    if (!isValidTopic(p.topic)) {
      client.socket.destroy();
      return;
    }
    const allowed = this.mayPublish(client, p.topic);
    if (p.qos === 1) client.send({ type: PacketType.PUBACK, packetId: p.packetId ?? 0 });
    if (p.qos === 2) {
      client.send({ type: PacketType.PUBREC, packetId: p.packetId ?? 0 });
      // Doublon QoS 2 (DUP) : déjà distribué
      if (client.pendingRel.has(p.packetId ?? 0)) return;
      client.pendingRel.add(p.packetId ?? 0);
    }
    if (!allowed) {
      this.emit('clientError', client.info, `publication refusée sur ${p.topic}`);
      return;
    }
    this.route({ topic: p.topic, payload: p.payload, qos: p.qos, retain: p.retain });
  }

  /** Distribution : retenu mémorisé, abonnés réseau, abonnés internes. */
  private route(d: Delivery): void {
    if (d.retain) {
      if (d.payload.length === 0) this.retained.delete(d.topic);
      else this.retained.set(d.topic, { payload: d.payload, qos: d.qos });
    }
    for (const c of this.clients) {
      if (!c.connected) continue;
      let best = -1;
      for (const [filter, qos] of c.subscriptions)
        if (qos > best && topicMatches(filter, d.topic)) best = qos;
      // Livraison en direct : drapeau retain à 0 (spéc. MQTT § 3.3.1.3)
      if (best >= 0) c.deliver({ ...d, retain: false }, best as QoS);
    }
    for (const sub of [...this.local])
      if (topicMatches(sub.filter, d.topic)) this.callLocal(sub, d.topic, d.payload, false);
  }

  private callLocal(sub: LocalSub, topic: string, payload: Buffer, retained: boolean): void {
    try {
      sub.handler(topic, payload, { retained });
    } catch (err) {
      this.emit('clientError', null, `abonné interne : ${String(err)}`);
    }
  }
}
