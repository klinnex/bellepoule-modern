/**
 * Tests - export / import JSON des paramètres (logos inclus)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  buildSettingsExport,
  parseSettingsImport,
  applySettingsValues,
  settingsExportFileName,
  SETTINGS_EXPORT_FORMAT,
} from './settingsTransfer';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    map: m,
  };
}

describe('settingsTransfer', () => {
  it('exporte uniquement les clés connues, logos compris', () => {
    const s = memStorage({
      'bellepoule-theme': 'dark',
      'bellepoule-logo': LOGO,
      'bellepoule-logos': JSON.stringify([{ id: 'a', name: 'Club', data: LOGO }]),
      'bellepoule-settings-section': 'system',
      autre: 'x',
    });
    const out = buildSettingsExport(s, new Date('2026-11-06T10:00:00Z'));
    expect(out.format).toBe(SETTINGS_EXPORT_FORMAT);
    expect(out.exportedAt).toBe('2026-11-06T10:00:00.000Z');
    expect(Object.keys(out.settings).sort()).toEqual([
      'bellepoule-logo',
      'bellepoule-logos',
      'bellepoule-theme',
    ]);
  });

  it('aller-retour export → import restaure les valeurs', () => {
    const src = memStorage({
      'bellepoule-language': 'de',
      'bellepoule-ui-scale': '1.15',
      'bellepoule-quick-mouse-scoring': 'true',
      'bellepoule-tts-config': JSON.stringify({ voiceName: null, rate: 1, announce: {} }),
      'bellepoule-logo': LOGO,
      'bellepoule-logos': JSON.stringify([{ id: 'a', name: 'Club', data: LOGO }]),
    });
    const text = JSON.stringify(buildSettingsExport(src));
    const dst = memStorage();
    applySettingsValues(parseSettingsImport(text), dst);
    expect(Object.fromEntries(dst.map)).toEqual(Object.fromEntries(src.map));
  });

  it('rejette un JSON invalide ou un autre format', () => {
    expect(() => parseSettingsImport('{')).toThrow('invalid_json');
    expect(() => parseSettingsImport('{"format":"autre","version":1,"settings":{}}')).toThrow(
      'invalid_format'
    );
    expect(() =>
      parseSettingsImport(
        JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, version: 99, settings: {} })
      )
    ).toThrow('invalid_format');
  });

  it('ignore les clés inconnues et les valeurs invalides', () => {
    const values = parseSettingsImport(
      JSON.stringify({
        format: SETTINGS_EXPORT_FORMAT,
        version: 1,
        settings: {
          'bellepoule-language': 'xx',
          'bellepoule-theme': 'light',
          'bellepoule-ui-scale': '9',
          'bellepoule-audit-log-enabled': 'oui',
          'bellepoule-logo': 'javascript:alert(1)',
          'bellepoule-tts-config': 'pas du json',
          'bellepoule-logos': JSON.stringify([
            { id: 'a', name: 'ok', data: LOGO },
            { id: 'b', name: 'ko', data: 'http://x' },
          ]),
          'bellepoule-settings-section': 'system',
        },
      })
    );
    expect(values).toEqual({
      'bellepoule-theme': 'light',
      'bellepoule-logos': JSON.stringify([{ id: 'a', name: 'ok', data: LOGO }]),
    });
  });

  it('nom de fichier daté', () => {
    expect(settingsExportFileName(new Date('2026-11-06T10:00:00Z'))).toBe(
      'bellepoule-parametres-2026-11-06.json'
    );
  });
});
