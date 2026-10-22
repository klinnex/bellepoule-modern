/**
 * Données publiques du serveur distant (#1194) : ni date de naissance, ni licence, ni IP,
 * ni photo (hors affichage des photos) dans les réponses REST et les paquets Socket.IO.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { createPublicParser, publicJson, stripPersonalData } from './publicDto';

const fencer = () => ({
  id: 'f1',
  ref: 3,
  lastName: 'DUPONT',
  firstName: 'Léa',
  club: 'CE Lille',
  nationality: 'FRA',
  status: 'Q',
  birthDate: '2012-04-01',
  license: '123456',
  photo: 'data:image/png;base64,AAAA',
});

describe('stripPersonalData', () => {
  it('retire date de naissance, licence et photo à toute profondeur, sans muter', () => {
    const pools = [{ id: 'p1', fencers: [fencer()], matches: [{ fencerA: fencer() }] }];
    const out = stripPersonalData({ pools });
    const f = out.pools[0].fencers[0] as Record<string, unknown>;
    expect(f).toEqual({
      id: 'f1',
      ref: 3,
      lastName: 'DUPONT',
      firstName: 'Léa',
      club: 'CE Lille',
      nationality: 'FRA',
      status: 'Q',
    });
    expect(out.pools[0].matches[0].fencerA).not.toHaveProperty('license');
    expect(pools[0].fencers[0].license).toBe('123456');
  });

  it('photo conservée sur demande (affichage des photos actif)', () => {
    const out = stripPersonalData({ fencerA: fencer() }, true);
    expect(out.fencerA.photo).toBe('data:image/png;base64,AAAA');
    expect(out.fencerA).not.toHaveProperty('birthDate');
  });

  it('retire le code (licence) des arbitres et les IP des événements', () => {
    const out = stripPersonalData({
      code: 'auth.required',
      referees: [{ id: 'r1', name: 'Jean Arbitre', code: '998877', isActive: true }],
      events: [{ id: 'e1', eventType: 'touch', ipAddress: '192.168.1.20' }],
    });
    expect(out.code).toBe('auth.required');
    expect(out.referees[0]).toEqual({ id: 'r1', name: 'Jean Arbitre', isActive: true });
    expect(out.events[0]).toEqual({ id: 'e1', eventType: 'touch' });
  });

  it('valeurs non objets et instances (Date, Buffer) inchangées', () => {
    const d = new Date(0);
    expect(stripPersonalData(d)).toBe(d);
    expect(stripPersonalData('x')).toBe('x');
    expect(stripPersonalData(null)).toBeNull();
    const b = Buffer.from('ab');
    expect(stripPersonalData({ b }).b).toBe(b);
  });
});

describe('publicJson (REST)', () => {
  it('GET sans cookie : aucune donnée personnelle dans le JSON', async () => {
    const app = express();
    app.use(publicJson());
    app.get('/api/pools', (_req, res) => res.json({ pools: [{ fencers: [fencer()] }] }));
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const text = await (await fetch(`http://127.0.0.1:${port}/api/pools`)).text();
      expect(text).toContain('DUPONT');
      expect(text).not.toMatch(/birthDate|license|photo|123456/);
    } finally {
      server.close();
    }
  });
});

describe('createPublicParser (Socket.IO)', () => {
  const encode = (keepPhotos: boolean) => {
    const parser = createPublicParser(() => keepPhotos);
    const packet = {
      type: parser.PacketType.EVENT,
      nsp: '/',
      data: ['arena:arena1:update', { match: { fencerA: fencer(), fencerB: fencer() } }],
    };
    const [encoded] = new parser.Encoder().encode(packet);
    return { packet, encoded: String(encoded) };
  };

  it('paquet sortant filtré, paquet source intact', () => {
    const { packet, encoded } = encode(false);
    expect(encoded).toContain('DUPONT');
    expect(encoded).not.toMatch(/birthDate|license|photo/);
    expect((packet.data[1] as any).match.fencerA.license).toBe('123456');
  });

  it('photo diffusée quand l’affichage des photos est actif, jamais la licence', () => {
    const { encoded } = encode(true);
    expect(encoded).toContain('data:image/png;base64,AAAA');
    expect(encoded).not.toMatch(/birthDate|license/);
  });

  it('décodage côté client inchangé (format standard)', () => {
    const parser = createPublicParser(() => false);
    const { encoded } = encode(false);
    const decoder = new parser.Decoder();
    let decoded: any;
    decoder.on('decoded', (p: any) => (decoded = p));
    decoder.add(encoded);
    expect(decoded.data[0]).toBe('arena:arena1:update');
    expect(decoded.data[1].match.fencerA.lastName).toBe('DUPONT');
  });
});
