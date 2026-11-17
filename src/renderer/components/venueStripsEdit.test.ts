/**
 * Édition des pistes d'une salle (#1880) : validation IPv4 / port et application des saisies.
 */
import { describe, it, expect } from 'vitest';
import {
  applyStripEdits,
  isIpv4,
  isValidPort,
  stripEditError,
  stripToEdit,
} from './venueStripsEdit';

describe('validation', () => {
  it('IPv4', () => {
    expect(isIpv4('192.168.1.5')).toBe(true);
    expect(isIpv4(' 10.0.0.1 ')).toBe(true);
    for (const bad of ['', '256.1.1.1', '1.2.3', '1.2.3.4.5', 'abc', '1.2.3.-4'])
      expect(isIpv4(bad)).toBe(false);
  });

  it('port facultatif entre 1 et 65535', () => {
    for (const ok of ['', ' ', '1', '50100', '65535']) expect(isValidPort(ok)).toBe(true);
    for (const bad of ['0', '65536', '-1', '12.5', 'abc']) expect(isValidPort(bad)).toBe(false);
  });

  it('erreur : IP saisie invalide ou port invalide ; IP vide acceptée', () => {
    const base = { label: '', ip: '', port: '', mode: 'master' as const };
    expect(stripEditError(base)).toBe(false);
    expect(stripEditError({ ...base, ip: '1.2.3.4', port: '50100' })).toBe(false);
    expect(stripEditError({ ...base, ip: '1.2.3' })).toBe(true);
    expect(stripEditError({ ...base, ip: '1.2.3.4', port: '99999' })).toBe(true);
  });
});

describe('stripToEdit', () => {
  it('relit libellé et appareil, mode maître par défaut', () => {
    expect(stripToEdit({ number: 1 })).toEqual({ label: '', ip: '', port: '', mode: 'master' });
    expect(
      stripToEdit({
        number: 2,
        label: 'Bleue',
        cyranoConfig: { ip: '10.0.0.2', port: 50100, mode: 'display' },
      })
    ).toEqual({ label: 'Bleue', ip: '10.0.0.2', port: '50100', mode: 'display' });
  });
});

describe('applyStripEdits', () => {
  it('ne touche pas aux pistes non modifiées', () => {
    const strips = [{ number: 1, label: 'A' }, { number: 2 }];
    expect(applyStripEdits(strips, {})).toEqual(strips);
  });

  it('pose libellé et appareil, garde arène et protocole', () => {
    const strips = [
      { number: 1, cyranoConfig: { ip: '1.1.1.1', port: 1, arena: 3, protocol: 'EFP1' } },
    ];
    expect(
      applyStripEdits(strips, {
        1: { label: ' Rouge ', ip: '10.0.0.9', port: '', mode: 'manual' },
      })
    ).toEqual([
      {
        number: 1,
        label: 'Rouge',
        cyranoConfig: { ip: '10.0.0.9', arena: 3, protocol: 'EFP1', mode: 'manual' },
      },
    ]);
  });

  it('retire l’appareil sans adresse IP, garde le libellé', () => {
    const strips = [{ number: 1, label: 'A', cyranoConfig: { ip: '1.1.1.1' } }];
    expect(
      applyStripEdits(strips, { 1: { label: 'A', ip: ' ', port: '9', mode: 'master' } })
    ).toEqual([{ number: 1, label: 'A' }]);
  });

  it('écrit le port numérique', () => {
    expect(
      applyStripEdits([{ number: 1 }], {
        1: { label: '', ip: '1.2.3.4', port: '50100', mode: 'master' },
      })
    ).toEqual([{ number: 1, cyranoConfig: { ip: '1.2.3.4', port: 50100, mode: 'master' } }]);
  });
});
