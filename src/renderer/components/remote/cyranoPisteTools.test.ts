/**
 * Outils de la table des pistes Cyrano : profils, lot, import / export (#1829)
 */
import { describe, it, expect } from 'vitest';
import {
  CYRANO_PROFILES,
  MAX_PISTES,
  buildBatch,
  exportPistes,
  parsePistesImport,
} from './cyranoPisteTools';

const EFP11 = CYRANO_PROFILES[1];
const STD = CYRANO_PROFILES[0];

describe('profils constructeur (#1829)', () => {
  it('port 50100 en standard, 50101 en EFP1.1', () => {
    expect(STD).toMatchObject({ port: 50100, protocol: 'auto' });
    expect(EFP11).toMatchObject({ port: 50101, protocol: 'EFP1.1' });
  });
});

describe('ajout en lot', () => {
  it('profil Saint-George : port 50101, IP 192.168.1.(100 + piste)', () => {
    const sg = CYRANO_PROFILES.find(p => p.id === 'saintgeorge')!;
    const rows = buildBatch(sg, 7, 2, []);
    expect(rows[0]).toMatchObject({ piste: '7', ip: '192.168.1.107', port: 50101, arena: 7 });
    expect(rows[1].ip).toBe('192.168.1.108');
    expect(buildBatch(sg, 155, 1, [])[0].ip).toBe('');
  });

  it('numéros consécutifs, piste n ↔ arène n, port du profil', () => {
    const rows = buildBatch(EFP11, 1, 3, []);
    expect(rows.map(r => r.piste)).toEqual(['1', '2', '3']);
    expect(rows[2]).toMatchObject({ arena: 3, port: 50101, protocol: 'EFP1.1', ip: '' });
  });

  it('ignore les numéros déjà présents', () => {
    const rows = buildBatch(STD, 1, 2, [{ piste: '2', ip: '10.0.0.2' }]);
    expect(rows.map(r => r.piste)).toEqual(['1', '3']);
  });

  it('ne dépasse jamais le maximum de pistes', () => {
    const existing = Array.from({ length: MAX_PISTES - 2 }, (_, i) => ({
      piste: `x${i}`,
      ip: '',
    }));
    expect(buildBatch(STD, 1, 10, existing)).toHaveLength(2);
  });
});

describe('export / import', () => {
  const pistes = [
    { piste: '1', ip: '10.0.0.1', port: 50100, arena: 1, protocol: 'auto' as const },
    {
      piste: '2',
      ip: '10.0.0.2',
      port: 50101,
      arena: 2,
      protocol: 'EFP1.1' as const,
      mode: 'display' as const,
    },
  ];

  it('aller-retour sans perte', () => {
    const res = parsePistesImport(exportPistes(pistes));
    expect(res).toEqual({ ok: true, pistes, rejected: 0 });
  });

  it('accepte aussi un tableau nu', () => {
    const res = parsePistesImport(JSON.stringify(pistes));
    expect(res.ok && res.pistes).toHaveLength(2);
  });

  it('écarte les lignes invalides et les doublons, et le compte est rendu', () => {
    const text = JSON.stringify([
      { piste: '1', ip: '10.0.0.1' },
      { piste: '1', ip: '10.0.0.9' },
      { piste: '', ip: '10.0.0.3' },
      { piste: '4', ip: '10.0.0.4', port: 70000 },
      { piste: '5', ip: '10.0.0.5', protocol: 'XYZ' },
    ]);
    const res = parsePistesImport(text);
    expect(res).toMatchObject({ ok: true, rejected: 4 });
    expect(res.ok && res.pistes.map(p => p.piste)).toEqual(['1']);
  });

  it('refuse le JSON cassé, le mauvais format et la liste vide', () => {
    expect(parsePistesImport('{ pas du json')).toEqual({ ok: false, error: 'invalid_json' });
    expect(parsePistesImport('{"foo":1}')).toEqual({ ok: false, error: 'invalid_format' });
    expect(parsePistesImport('[]')).toEqual({ ok: false, error: 'empty' });
  });
});
