/**
 * BellePoule Modern - Paquets MQTT 3.1.1 (#1960)
 * Codec minimal pour le broker intégré OPP2 : CONNECT, CONNACK, PUBLISH (QoS 0 à 2),
 * PUBACK, PUBREC / PUBREL / PUBCOMP, SUBSCRIBE, SUBACK, UNSUBSCRIBE, UNSUBACK, PINGREQ,
 * PINGRESP, DISCONNECT. Aucune dépendance : le broker tourne dans le processus main.
 * Licensed under GPL-3.0
 */

export const PacketType = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  PUBREC: 5,
  PUBREL: 6,
  PUBCOMP: 7,
  SUBSCRIBE: 8,
  SUBACK: 9,
  UNSUBSCRIBE: 10,
  UNSUBACK: 11,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

export type QoS = 0 | 1 | 2;

/** Taille maximale d'un paquet accepté (les messages OPP2 font quelques Ko). */
export const MAX_PACKET_SIZE = 256 * 1024;

export class MqttProtocolError extends Error {}

export interface ConnectPacket {
  type: typeof PacketType.CONNECT;
  protocolName: string;
  protocolLevel: number;
  cleanSession: boolean;
  keepalive: number;
  clientId: string;
  will?: { topic: string; payload: Buffer; qos: QoS; retain: boolean };
  username?: string;
  password?: Buffer;
}

export interface PublishPacket {
  type: typeof PacketType.PUBLISH;
  topic: string;
  payload: Buffer;
  qos: QoS;
  retain: boolean;
  dup: boolean;
  packetId?: number;
}

export interface SubscribePacket {
  type: typeof PacketType.SUBSCRIBE;
  packetId: number;
  subscriptions: { filter: string; qos: QoS }[];
}

export interface UnsubscribePacket {
  type: typeof PacketType.UNSUBSCRIBE;
  packetId: number;
  filters: string[];
}

export interface IdPacket {
  type:
    | typeof PacketType.PUBACK
    | typeof PacketType.PUBREC
    | typeof PacketType.PUBREL
    | typeof PacketType.PUBCOMP
    | typeof PacketType.UNSUBACK;
  packetId: number;
}

export interface SubackPacket {
  type: typeof PacketType.SUBACK;
  packetId: number;
  granted: number[];
}

export interface ConnackPacket {
  type: typeof PacketType.CONNACK;
  sessionPresent: boolean;
  returnCode: number;
}

export interface BarePacket {
  type: typeof PacketType.PINGREQ | typeof PacketType.PINGRESP | typeof PacketType.DISCONNECT;
}

export type MqttPacket =
  | ConnectPacket
  | ConnackPacket
  | PublishPacket
  | SubscribePacket
  | SubackPacket
  | UnsubscribePacket
  | IdPacket
  | BarePacket;

/** Lecteur séquentiel du corps d'un paquet. */
class Reader {
  private pos = 0;
  constructor(private readonly buf: Buffer) {}
  get remaining(): number {
    return this.buf.length - this.pos;
  }
  u8(): number {
    if (this.remaining < 1) throw new MqttProtocolError('paquet tronqué');
    return this.buf[this.pos++];
  }
  u16(): number {
    if (this.remaining < 2) throw new MqttProtocolError('paquet tronqué');
    const v = this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  bytes(): Buffer {
    const len = this.u16();
    if (this.remaining < len) throw new MqttProtocolError('paquet tronqué');
    const v = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return Buffer.from(v);
  }
  str(): string {
    return this.bytes().toString('utf8');
  }
  rest(): Buffer {
    const v = Buffer.from(this.buf.subarray(this.pos));
    this.pos = this.buf.length;
    return v;
  }
}

const asQos = (n: number): QoS => {
  if (n > 2) throw new MqttProtocolError('QoS invalide');
  return n as QoS;
};

function encodeLength(n: number): Buffer {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return Buffer.from(out);
}

const str = (s: string): Buffer => {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([u16(b.length), b]);
};
const bin = (b: Buffer): Buffer => Buffer.concat([u16(b.length), b]);
function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function frame(first: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([first]), encodeLength(body.length), body]);
}

/** Paquet → octets. */
export function encodePacket(p: MqttPacket): Buffer {
  switch (p.type) {
    case PacketType.CONNECT: {
      let flags = 0;
      if (p.cleanSession) flags |= 0x02;
      const parts: Buffer[] = [str(p.clientId)];
      if (p.will) {
        flags |= 0x04 | (p.will.qos << 3) | (p.will.retain ? 0x20 : 0);
        parts.push(str(p.will.topic), bin(p.will.payload));
      }
      if (p.username !== undefined) {
        flags |= 0x80;
        parts.push(str(p.username));
      }
      if (p.password !== undefined) {
        flags |= 0x40;
        parts.push(bin(p.password));
      }
      const head = Buffer.concat([
        str(p.protocolName),
        Buffer.from([p.protocolLevel, flags]),
        u16(p.keepalive),
      ]);
      return frame(0x10, Buffer.concat([head, ...parts]));
    }
    case PacketType.CONNACK:
      return frame(0x20, Buffer.from([p.sessionPresent ? 1 : 0, p.returnCode]));
    case PacketType.PUBLISH: {
      const first = 0x30 | (p.dup ? 0x08 : 0) | (p.qos << 1) | (p.retain ? 1 : 0);
      const parts = [str(p.topic)];
      if (p.qos > 0) parts.push(u16(p.packetId ?? 0));
      parts.push(p.payload);
      return frame(first, Buffer.concat(parts));
    }
    case PacketType.PUBACK:
      return frame(0x40, u16(p.packetId));
    case PacketType.PUBREC:
      return frame(0x50, u16(p.packetId));
    case PacketType.PUBREL:
      return frame(0x62, u16(p.packetId));
    case PacketType.PUBCOMP:
      return frame(0x70, u16(p.packetId));
    case PacketType.SUBSCRIBE:
      return frame(
        0x82,
        Buffer.concat([
          u16(p.packetId),
          ...p.subscriptions.map(s => Buffer.concat([str(s.filter), Buffer.from([s.qos])])),
        ])
      );
    case PacketType.SUBACK:
      return frame(0x90, Buffer.concat([u16(p.packetId), Buffer.from(p.granted)]));
    case PacketType.UNSUBSCRIBE:
      return frame(0xa2, Buffer.concat([u16(p.packetId), ...p.filters.map(str)]));
    case PacketType.UNSUBACK:
      return frame(0xb0, u16(p.packetId));
    case PacketType.PINGREQ:
      return Buffer.from([0xc0, 0]);
    case PacketType.PINGRESP:
      return Buffer.from([0xd0, 0]);
    case PacketType.DISCONNECT:
      return Buffer.from([0xe0, 0]);
  }
}

function decodeBody(first: number, body: Buffer): MqttPacket {
  const type = first >> 4;
  const flags = first & 0x0f;
  const r = new Reader(body);
  switch (type) {
    case PacketType.CONNECT: {
      const protocolName = r.str();
      const protocolLevel = r.u8();
      const f = r.u8();
      const keepalive = r.u16();
      if (f & 0x01) throw new MqttProtocolError('bit réservé de CONNECT');
      const clientId = r.str();
      const p: ConnectPacket = {
        type,
        protocolName,
        protocolLevel,
        cleanSession: (f & 0x02) !== 0,
        keepalive,
        clientId,
      };
      if (f & 0x04) {
        const topic = r.str();
        const payload = r.bytes();
        p.will = { topic, payload, qos: asQos((f >> 3) & 3), retain: (f & 0x20) !== 0 };
      }
      if (f & 0x80) p.username = r.str();
      if (f & 0x40) p.password = r.bytes();
      return p;
    }
    case PacketType.CONNACK:
      return { type, sessionPresent: (r.u8() & 1) === 1, returnCode: r.u8() };
    case PacketType.PUBLISH: {
      const qos = asQos((flags >> 1) & 3);
      const topic = r.str();
      const packetId = qos > 0 ? r.u16() : undefined;
      return {
        type,
        topic,
        payload: r.rest(),
        qos,
        retain: (flags & 1) === 1,
        dup: (flags & 8) !== 0,
        packetId,
      };
    }
    case PacketType.PUBACK:
    case PacketType.PUBREC:
    case PacketType.PUBREL:
    case PacketType.PUBCOMP:
    case PacketType.UNSUBACK:
      return { type, packetId: r.u16() };
    case PacketType.SUBSCRIBE: {
      const packetId = r.u16();
      const subscriptions: SubscribePacket['subscriptions'] = [];
      while (r.remaining > 0) subscriptions.push({ filter: r.str(), qos: asQos(r.u8() & 3) });
      if (subscriptions.length === 0) throw new MqttProtocolError('SUBSCRIBE vide');
      return { type, packetId, subscriptions };
    }
    case PacketType.SUBACK: {
      const packetId = r.u16();
      return { type, packetId, granted: [...r.rest()] };
    }
    case PacketType.UNSUBSCRIBE: {
      const packetId = r.u16();
      const filters: string[] = [];
      while (r.remaining > 0) filters.push(r.str());
      return { type, packetId, filters };
    }
    case PacketType.PINGREQ:
    case PacketType.PINGRESP:
    case PacketType.DISCONNECT:
      return { type };
    default:
      throw new MqttProtocolError(`type de paquet inconnu : ${type}`);
  }
}

/** Découpe un flux TCP en paquets (les paquets peuvent arriver morcelés ou groupés). */
export class PacketParser {
  private buf: Buffer = Buffer.alloc(0);

  constructor(private readonly maxSize = MAX_PACKET_SIZE) {}

  /** Ajoute des octets reçus ; renvoie les paquets complets. Lève une erreur si le flux est invalide. */
  push(chunk: Buffer): MqttPacket[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out: MqttPacket[] = [];
    for (;;) {
      if (this.buf.length < 2) break;
      let len = 0;
      let mult = 1;
      let i = 1;
      let complete = false;
      for (; i < 5 && i < this.buf.length; i++) {
        const byte = this.buf[i];
        len += (byte & 0x7f) * mult;
        mult *= 128;
        if ((byte & 0x80) === 0) {
          complete = true;
          break;
        }
      }
      if (!complete) {
        if (i >= 5) throw new MqttProtocolError('longueur restante invalide');
        break;
      }
      if (len > this.maxSize) throw new MqttProtocolError('paquet trop volumineux');
      const start = i + 1;
      if (this.buf.length < start + len) break;
      out.push(decodeBody(this.buf[0], this.buf.subarray(start, start + len)));
      this.buf = this.buf.subarray(start + len);
    }
    return out;
  }
}

/**
 * Le filtre d'abonnement (`+` = un niveau, `#` = tous les niveaux suivants) couvre-t-il le
 * sujet ? Les sujets commençant par `$` ne sont pas couverts par un joker de premier niveau.
 */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  if (topic.startsWith('$') && (f[0] === '+' || f[0] === '#')) return false;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/** Filtre d'abonnement valide (jokers seulement en niveau entier, `#` en dernier). */
export function isValidFilter(filter: string): boolean {
  if (!filter || filter.length > 65535) return false;
  const levels = filter.split('/');
  return levels.every((l, i) => {
    if (l.includes('#')) return l === '#' && i === levels.length - 1;
    if (l.includes('+')) return l === '+';
    return true;
  });
}

/** Sujet de publication valide (sans joker). */
export const isValidTopic = (topic: string): boolean =>
  !!topic && topic.length <= 65535 && !/[+#\0]/.test(topic);
