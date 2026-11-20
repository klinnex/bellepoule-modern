import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// #1600 : connexion Socket.IO commune des pages distantes (/common.js).
const { bpSocket } = require('./common.js') as {
  bpSocket: ((extra?: object, io?: (o: object) => unknown) => unknown) & { OPTIONS: object };
};

describe('bpSocket (/common.js)', () => {
  it('applique la politique de reconnexion commune', () => {
    const io = vi.fn(() => 'sock');
    expect(bpSocket(undefined, io)).toBe('sock');
    expect(io).toHaveBeenCalledWith({
      reconnection: true,
      reconnectionDelay: 200,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });
  });

  it('permet de surcharger ou compléter les options sans modifier les défauts', () => {
    const io = vi.fn(() => 's');
    bpSocket({ transports: ['websocket'], reconnectionDelay: 300 }, io);
    expect(io).toHaveBeenCalledWith(
      expect.objectContaining({
        transports: ['websocket'],
        reconnectionDelay: 300,
        reconnection: true,
      })
    );
    expect(bpSocket.OPTIONS).toMatchObject({ reconnectionDelay: 200 });
  });

  it('aucune page distante ne reconstruit ces options à la main', () => {
    const dir = __dirname;
    const files = [
      ...fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.html'))
        .map(f => path.join(dir, f)),
      ...fs
        .readdirSync(path.join(dir, 'js'))
        .filter(f => f.endsWith('.js'))
        .map(f => path.join(dir, 'js', f)),
    ];
    const offenders = files.filter(f =>
      /io\(\{[^}]*randomizationFactor/.test(fs.readFileSync(f, 'utf8'))
    );
    expect(offenders.map(f => path.basename(f))).toEqual([]);
  });
});
