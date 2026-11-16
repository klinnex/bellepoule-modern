/**
 * Réglages RGPD (#1882) : validation, persistance, date limite de conservation.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readPrivacySettings,
  retentionCutoff,
  sanitizePrivacySettings,
  writePrivacySettings,
} from './privacySettings';
import { DEFAULT_PRIVACY_SETTINGS } from '../shared/types/privacy';

describe('privacySettings', () => {
  it('ignore les valeurs invalides', () => {
    expect(
      sanitizePrivacySettings({
        nameMasking: 'x',
        competitionRetentionMonths: -1,
        memberRetentionMonths: 1.5,
        retentionAction: 'drop',
        autoPurge: 'oui',
      })
    ).toEqual(DEFAULT_PRIVACY_SETTINGS);
    expect(
      sanitizePrivacySettings({ nameMasking: 'initial', competitionRetentionMonths: 36 })
    ).toMatchObject({ nameMasking: 'initial', competitionRetentionMonths: 36 });
  });

  it('persiste dans userData, défaut si absent ou corrompu', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-'));
    expect(readPrivacySettings(dir)).toEqual(DEFAULT_PRIVACY_SETTINGS);
    const s = { ...DEFAULT_PRIVACY_SETTINGS, nameMasking: 'initials' as const, autoPurge: true };
    writePrivacySettings(dir, s);
    expect(readPrivacySettings(dir)).toEqual(s);
    fs.writeFileSync(path.join(dir, 'privacy-settings.json'), '{oops');
    expect(readPrivacySettings(dir)).toEqual(DEFAULT_PRIVACY_SETTINGS);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('calcule la date limite (0 = illimitée)', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    expect(retentionCutoff(0, now)).toBeNull();
    expect(retentionCutoff(24, now)).toBe('2024-06-15T12:00:00.000Z');
  });
});
