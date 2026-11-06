import { describe, it, expect } from 'vitest';
import { parseReleaseBuild, pickLatestRelease } from './updateReleases';

const dev = (b: number) => ({
  name: `🧪 BellePoule Modern 1.2.1-dev.${b} (Build #${b})`,
  tag_name: `v1.2.1-dev.${b}`,
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
