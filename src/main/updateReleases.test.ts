import { describe, it, expect } from 'vitest';
import {
  compareVersionPoints,
  isNewerRelease,
  parseReleaseBuild,
  parseReleaseVersion,
  pickLatestRelease,
} from './updateReleases';

const dev = (b: number) => ({
  name: `🧪 BellePoule Modern 1.2.1-dev.${b} (Build #${b})`,
  tag_name: `v1.2.1-dev.${b}`,
  prerelease: true,
});
const devOf = (v: string, b: number) => ({
  name: `🧪 BellePoule Modern ${v}-dev.${b} (Build #${b})`,
  tag_name: `v${v}-dev.${b}`,
  prerelease: true,
});
const rc = (v: string, b: number) => ({
  name: `🩹 BellePoule Modern ${v}-rc.${b} (Build #${b})`,
  tag_name: `v${v}-rc.${b}`,
  prerelease: true,
});
const stable = (v: string, b: number) => ({
  name: `🚀 BellePoule Modern ${v} (Build #${b})`,
  tag_name: `v${v}`,
  prerelease: false,
});

describe('parseReleaseBuild', () => {
  it('lit le build dans le nom, sinon le tag, sinon le corps', () => {
    expect(parseReleaseBuild(dev(1625))).toBe(1625);
    expect(parseReleaseBuild({ name: 'x', tag_name: 'v1.2.1-dev.1700' })).toBe(1700);
    expect(parseReleaseBuild({ name: 'v1.3.0', body: 'Build #1800' })).toBe(1800);
    expect(parseReleaseBuild({ name: 'v1.3.0' })).toBe(0);
  });
});

describe('pickLatestRelease', () => {
  const list = [stable('1.2.1', 1620), dev(1625), dev(1624), stable('1.2.0', 1446)];

  it('canal dev : build le plus élevé, quel que soit l’ordre', () => {
    expect(pickLatestRelease(list, true)?.tag_name).toBe('v1.2.1-dev.1625');
  });

  it('canal stable : ignore les pré-releases', () => {
    expect(pickLatestRelease(list, false)?.tag_name).toBe('v1.2.1');
  });

  it('ignore les brouillons ; null si rien', () => {
    expect(pickLatestRelease([{ ...dev(9999), draft: true }, dev(1)], true)?.tag_name).toBe(
      'v1.2.1-dev.1'
    );
    expect(pickLatestRelease([dev(1)], false)).toBeNull();
  });
});

describe('parseReleaseVersion', () => {
  it('lit X.Y.Z dans le tag, sinon le nom', () => {
    expect(parseReleaseVersion(devOf('3.0.0', 1990))).toBe('3.0.0');
    expect(parseReleaseVersion(rc('2.0.1', 1991))).toBe('2.0.1');
    expect(parseReleaseVersion({ name: 'BellePoule Modern 1.4.2' })).toBe('1.4.2');
    expect(parseReleaseVersion({ name: 'x' })).toBeNull();
  });

  it('lit le build des pré-releases de maintenance', () => {
    expect(parseReleaseBuild({ tag_name: 'v2.0.1-rc.1991' })).toBe(1991);
  });
});

describe('compareVersionPoints', () => {
  it('X.Y.Z d’abord, build ensuite', () => {
    expect(
      compareVersionPoints({ version: '3.0.0', build: 1990 }, { version: '2.0.1', build: 1995 })
    ).toBeGreaterThan(0);
    expect(
      compareVersionPoints({ version: '2.0.1', build: 1995 }, { version: '2.0.0', build: 1964 })
    ).toBeGreaterThan(0);
    expect(
      compareVersionPoints({ version: '3.0.0', build: 1991 }, { version: '3.0.0', build: 1990 })
    ).toBeGreaterThan(0);
    expect(
      compareVersionPoints({ version: '3.0.0', build: 1990 }, { version: '3.0.0', build: 1990 })
    ).toBe(0);
  });

  it('version inconnue : build seul', () => {
    expect(
      compareVersionPoints({ version: null, build: 1800 }, { version: '1.2.0', build: 1700 })
    ).toBeGreaterThan(0);
  });
});

describe('branche de maintenance', () => {
  const list = [
    rc('2.0.1', 1995),
    stable('2.0.1', 1995),
    devOf('3.0.0', 1993),
    stable('2.0.0', 1964),
  ];

  it('canal dev : la 3.0.0-dev l’emporte sur un correctif 2.0.1 au build plus élevé', () => {
    expect(pickLatestRelease(list, true)?.tag_name).toBe('v3.0.0-dev.1993');
  });

  it('canal stable : le correctif 2.0.1', () => {
    expect(pickLatestRelease(list, false)?.tag_name).toBe('v2.0.1');
  });

  it('un 3.0.0-dev ne se voit pas proposer la 2.0.1', () => {
    expect(isNewerRelease(stable('2.0.1', 1995), { version: '3.0.0', build: 1993 })).toBe(false);
  });

  it('un 2.0.0 stable se voit proposer la 2.0.1', () => {
    expect(isNewerRelease(stable('2.0.1', 1995), { version: '2.0.0', build: 1964 })).toBe(true);
  });

  it('un testeur 3.0.0-dev.1995 ne redescend pas vers la 3.0.0 (Build #1990)', () => {
    expect(isNewerRelease(stable('3.0.0', 1990), { version: '3.0.0', build: 1995 })).toBe(false);
  });
});
