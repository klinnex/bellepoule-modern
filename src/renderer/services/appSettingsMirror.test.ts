// @vitest-environment jsdom
/**
 * Miroir des réglages du poste vers la base (#1880) : langue et thème de l'écran font foi au
 * démarrage, les autres réglages ne remplacent pas une valeur déjà en base ; écritures suivies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetAppSettingsMirror, installAppSettingsMirror } from './appSettingsMirror';

let importLegacy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _resetAppSettingsMirror();
  localStorage.clear();
  importLegacy = vi.fn(async () => []);
  (window as unknown as { electronAPI: unknown }).electronAPI = { settings: { importLegacy } };
});

describe('installAppSettingsMirror', () => {
  it('démarrage : langue et thème écrits, autres réglages seulement s’ils manquent', () => {
    localStorage.setItem('bellepoule-language', 'de');
    localStorage.setItem('bellepoule-theme', 'dark');
    localStorage.setItem('bellepoule-remote-https', 'false');
    installAppSettingsMirror();
    expect(importLegacy).toHaveBeenCalledWith(
      { 'bellepoule-language': 'de', 'bellepoule-theme': 'dark' },
      'write'
    );
    expect(importLegacy).toHaveBeenCalledWith({ 'bellepoule-remote-https': 'false' }, 'missing');
  });

  it('écritures suivies : clés connues seulement, logo effacé', () => {
    installAppSettingsMirror();
    importLegacy.mockClear();
    localStorage.setItem('bellepoule-language', 'en');
    localStorage.setItem('autre-cle', 'x');
    localStorage.removeItem('bellepoule-logo');
    expect(importLegacy.mock.calls).toEqual([
      [{ 'bellepoule-language': 'en' }, 'write'],
      [{ 'bellepoule-logo': null }, 'write'],
    ]);
  });
});
