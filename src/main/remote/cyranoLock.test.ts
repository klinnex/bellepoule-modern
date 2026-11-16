/**
 * Verrou de saisie quand l'appareil de piste maître fait foi (#1829)
 */
import { describe, it, expect } from 'vitest';
import {
  addsCard,
  isCyranoMasterOnline,
  isDeviceSocket,
  keepRemovals,
  lockedScore,
} from './cyranoLock';

describe('cyranoLock (#1829)', () => {
  it('isCyranoMasterOnline : maître et en ligne seulement', () => {
    expect(isCyranoMasterOnline({ cyrano: { piste: '1', mode: 'master', online: true } })).toBe(
      true
    );
    expect(isCyranoMasterOnline({ cyrano: { piste: '1', mode: 'master', online: false } })).toBe(
      false
    );
    expect(isCyranoMasterOnline({ cyrano: { piste: '1', mode: 'display', online: true } })).toBe(
      false
    );
    expect(isCyranoMasterOnline({ cyrano: { piste: '1', mode: 'manual', online: true } })).toBe(
      false
    );
    expect(isCyranoMasterOnline({ cyrano: null })).toBe(false);
    expect(isCyranoMasterOnline(undefined)).toBe(false);
  });

  it('isDeviceSocket : pseudo-socket `cyrano:<piste>` du PisteHub', () => {
    expect(isDeviceSocket('cyrano:1')).toBe(true);
    expect(isDeviceSocket('Xy12tablet')).toBe(false);
    expect(isDeviceSocket(undefined)).toBe(false);
  });

  it('addsCard : ajout détecté par type, retrait et réordonnancement permis', () => {
    expect(addsCard(['yellow'], ['yellow', 'red'])).toBe(true);
    expect(addsCard([], ['p-red'])).toBe(true);
    // Même nombre mais un type remplacé : ajout d'un rouge
    expect(addsCard(['yellow'], ['red'])).toBe(true);
    expect(addsCard(['yellow', 'red'], ['yellow'])).toBe(false);
    expect(addsCard(['yellow', 'red'], ['red', 'yellow'])).toBe(false);
    expect(addsCard(['red', 'red'], ['red'])).toBe(false);
    expect(addsCard(['yellow'], [])).toBe(false);
    expect(addsCard(['yellow'], undefined)).toBe(false);
    expect(addsCard(undefined, ['black'])).toBe(true);
  });

  it('keepRemovals : ajouts ignorés, retraits gardés (remplacement d’un carton)', () => {
    expect(keepRemovals(['yellow'], ['red'])).toEqual([]);
    expect(keepRemovals(['yellow', 'red'], ['red', 'black'])).toEqual(['red']);
    expect(keepRemovals(['red', 'red'], ['red', 'red', 'red'])).toEqual(['red', 'red']);
    expect(keepRemovals(undefined, ['black'])).toEqual([]);
  });

  it('lockedScore : la tablette ne fait que retirer des points', () => {
    expect(lockedScore(3, 4)).toBe(3);
    expect(lockedScore(3, 2)).toBe(2);
    expect(lockedScore(undefined, 4)).toBe(4);
  });
});
