import { describe, it, expect } from 'vitest';
import {
  encodePacket,
  isValidFilter,
  isValidTopic,
  PacketParser,
  PacketType,
  topicMatches,
  MqttProtocolError,
  type MqttPacket,
} from './mqttPacket';

const roundtrip = (p: MqttPacket) => new PacketParser().push(encodePacket(p));

describe('paquets MQTT 3.1.1 (#1960)', () => {
  it('CONNECT avec dernière volonté et identifiants : aller-retour', () => {
    const p: MqttPacket = {
      type: PacketType.CONNECT,
      protocolName: 'MQTT',
      protocolLevel: 4,
      cleanSession: true,
      keepalive: 30,
      clientId: 'piste-3',
      will: {
        topic: 'openpiste/3/apparatus/connection',
        payload: Buffer.from('{"online":false}'),
        qos: 1,
        retain: true,
      },
      username: 'piste-3',
      password: Buffer.from('secret'),
    };
    expect(roundtrip(p)).toEqual([p]);
  });

  it('PUBLISH QoS 1 retenu : aller-retour', () => {
    const p: MqttPacket = {
      type: PacketType.PUBLISH,
      topic: 'openpiste/3/apparatus/score',
      payload: Buffer.from('{"seq":1}'),
      qos: 1,
      retain: true,
      dup: false,
      packetId: 42,
    };
    expect(roundtrip(p)).toEqual([p]);
  });

  it('flux morcelé puis groupé', () => {
    const a = encodePacket({ type: PacketType.PINGREQ });
    const b = encodePacket({
      type: PacketType.PUBLISH,
      topic: 't',
      payload: Buffer.alloc(300, 1),
      qos: 0,
      retain: false,
      dup: false,
    });
    const parser = new PacketParser();
    const all = Buffer.concat([a, b]);
    expect(parser.push(all.subarray(0, 3))).toHaveLength(1);
    expect(parser.push(all.subarray(3, 10))).toHaveLength(0);
    const rest = parser.push(all.subarray(10));
    expect(rest).toHaveLength(1);
    expect((rest[0] as { payload: Buffer }).payload.length).toBe(300);
  });

  it('paquet trop volumineux ou type inconnu : erreur de protocole', () => {
    expect(() => new PacketParser(10).push(Buffer.from([0x30, 0x7f]))).toThrow(MqttProtocolError);
    expect(() => new PacketParser().push(Buffer.from([0xf0, 0x00]))).toThrow(MqttProtocolError);
  });

  it('jokers + et #', () => {
    expect(topicMatches('openpiste/+/apparatus/#', 'openpiste/3/apparatus/score')).toBe(true);
    expect(topicMatches('openpiste/+/apparatus/#', 'openpiste/3/software/score')).toBe(false);
    expect(topicMatches('openpiste/#', 'openpiste')).toBe(true);
    expect(topicMatches('openpiste/+', 'openpiste/3/x')).toBe(false);
    expect(topicMatches('#', '$SYS/x')).toBe(false);
    expect(isValidFilter('a/#/b')).toBe(false);
    expect(isValidFilter('a/b+')).toBe(false);
    expect(isValidTopic('a/+')).toBe(false);
  });
});
