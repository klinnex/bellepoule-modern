/**
 * BellePoule Modern - Client MQTT 3.1.1 minimal (#1960)
 * Sert d'appareil OPP2 simulé dans les tests et prépare le raccordement à un broker externe.
 * Session propre, QoS 0 / 1, dernière volonté, keepalive (PINGREQ).
 * Licensed under GPL-3.0
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import { encodePacket, PacketParser, PacketType, type MqttPacket, type QoS } from './mqttPacket';

export interface MqttClientOptions {
  host?: string;
  port: number;
  clientId: string;
  keepalive?: number;
  username?: string;
  password?: string;
  will?: { topic: string; payload: string; qos?: QoS; retain?: boolean };
}

export interface MqttClientEvents {
  message: [topic: string, payload: Buffer, retained: boolean];
  close: [];
}

export class MqttClient extends EventEmitter<MqttClientEvents> {
  private socket: net.Socket | null = null;
  private readonly parser = new PacketParser();
  private nextId = 0;
  private readonly waiting = new Map<number, () => void>();
  private ping: NodeJS.Timeout | null = null;

  constructor(private readonly options: MqttClientOptions) {
    super();
  }

  /** Connexion ; rejette si le broker refuse (code CONNACK). */
  connect(): Promise<void> {
    const o = this.options;
    return new Promise((resolve, reject) => {
      const socket = net.connect(o.port, o.host ?? '127.0.0.1');
      this.socket = socket;
      let connacked = false;
      socket.once('error', err => {
        if (!connacked) reject(err);
      });
      socket.on('error', () => undefined);
      socket.on('close', () => {
        if (this.ping) clearInterval(this.ping);
        this.ping = null;
        if (!connacked) reject(new Error('connexion fermée'));
        this.emit('close');
      });
      socket.on('data', chunk => {
        for (const p of this.parser.push(chunk)) {
          if (p.type === PacketType.CONNACK) {
            connacked = true;
            if (p.returnCode !== 0) reject(new Error(`CONNACK ${p.returnCode}`));
            else resolve();
            continue;
          }
          this.handle(p);
        }
      });
      socket.on('connect', () => {
        this.write({
          type: PacketType.CONNECT,
          protocolName: 'MQTT',
          protocolLevel: 4,
          cleanSession: true,
          keepalive: o.keepalive ?? 30,
          clientId: o.clientId,
          username: o.username,
          password: o.password !== undefined ? Buffer.from(o.password) : undefined,
          will: o.will
            ? {
                topic: o.will.topic,
                payload: Buffer.from(o.will.payload),
                qos: o.will.qos ?? 1,
                retain: o.will.retain ?? true,
              }
            : undefined,
        });
        if (o.keepalive)
          this.ping = setInterval(
            () => this.write({ type: PacketType.PINGREQ }),
            o.keepalive * 500
          );
      });
    });
  }

  private handle(p: MqttPacket): void {
    switch (p.type) {
      case PacketType.PUBLISH:
        if (p.qos === 1) this.write({ type: PacketType.PUBACK, packetId: p.packetId ?? 0 });
        this.emit('message', p.topic, p.payload, p.retain);
        return;
      case PacketType.PUBACK:
      case PacketType.UNSUBACK:
      case PacketType.SUBACK:
        this.waiting.get(p.packetId)?.();
        this.waiting.delete(p.packetId);
        return;
      default:
        return;
    }
  }

  private write(p: MqttPacket): void {
    if (this.socket && !this.socket.destroyed) this.socket.write(encodePacket(p));
  }

  private allocId(): number {
    this.nextId = (this.nextId % 65535) + 1;
    return this.nextId;
  }

  private request(build: (id: number) => MqttPacket): Promise<void> {
    const id = this.allocId();
    return new Promise(resolve => {
      this.waiting.set(id, resolve);
      this.write(build(id));
    });
  }

  /** Publication ; en QoS 1, résolue au PUBACK. */
  publish(
    topic: string,
    payload: string | Buffer,
    opts: { qos?: QoS; retain?: boolean } = {}
  ): Promise<void> {
    const qos = (opts.qos ?? 0) > 0 ? 1 : 0;
    const body = typeof payload === 'string' ? Buffer.from(payload) : payload;
    const base = {
      type: PacketType.PUBLISH,
      topic,
      payload: body,
      retain: !!opts.retain,
      dup: false,
    };
    if (qos === 0) {
      this.write({ ...base, qos: 0 } as MqttPacket);
      return Promise.resolve();
    }
    return this.request(packetId => ({ ...base, qos: 1, packetId }) as MqttPacket);
  }

  subscribe(filter: string, qos: QoS = 1): Promise<void> {
    return this.request(packetId => ({
      type: PacketType.SUBSCRIBE,
      packetId,
      subscriptions: [{ filter, qos }],
    }));
  }

  /** Déconnexion annoncée (pas de dernière volonté). */
  end(): void {
    this.write({ type: PacketType.DISCONNECT });
    this.socket?.end();
  }

  /** Coupure brutale (la dernière volonté est publiée par le broker). */
  destroy(): void {
    this.socket?.destroy();
  }
}
