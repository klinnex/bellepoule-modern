// @vitest-environment jsdom
/**
 * Tests - Arbitre : identification des tireurs par carte de club (#1872)
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const cards = req('./refereeClubCards.js');

describe('refereeClubCards (#1872)', () => {
  it('lit le QR de la carte ou le code en clair', () => {
    expect(cards.parseCard('BPC1:M:a1b2c3d4e5')).toBe('A1B2C3D4E5');
    expect(cards.parseCard(' a1b2c3d4e5 ')).toBe('A1B2C3D4E5');
    expect(cards.parseCard('BPC1:A:3')).toBeNull();
    expect(cards.parseCard('123')).toBeNull();
    expect(cards.parseCard(null)).toBeNull();
  });

  it('piste de l’URL, identification déjà faite', () => {
    expect(cards.arenaFromPath('/arene4/arbitre')).toBe(4);
    expect(cards.arenaFromPath('/kiosk')).toBeNull();
    expect(cards.alreadyDone('?lobby=1&club=1')).toBe(true);
    expect(cards.alreadyDone('?lobby=1')).toBe(false);
  });

  it('messages d’erreur du serveur', () => {
    expect(cards.errorMessage({ error: 'unknown_card' })).toBe('Carte inconnue dans ce club');
    expect(cards.errorMessage({ error: 'same_member' })).toMatch(/même tireur/);
    expect(cards.errorMessage(null)).toMatch(/pas pu/);
  });

  it('hors Mode Club : rien n’est installé', async () => {
    const win = {
      location: { pathname: '/arene2/arbitre', search: '' },
      fetch: vi.fn().mockResolvedValue({ json: () => Promise.resolve({ active: false }) }),
      document: { getElementById: vi.fn() },
    };
    expect(await cards.install(win, () => null)).toBe(false);
    expect(win.fetch).toHaveBeenCalledWith('/api/club/identify');
  });

  it('séance reliée : bouton « Cartes » à côté de Retour', async () => {
    document.body.innerHTML =
      '<div><button id="btn-back-to-list" class="btn-x">Retour</button></div>';
    const win = {
      location: { pathname: '/arene2/arbitre', search: '?club=1' },
      fetch: vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ active: true, club: 'Cercle' }),
      }),
      document,
    };
    expect(await cards.install(win, () => null)).toBe(true);
    const btn = document.getElementById('btn-club-cards');
    expect(btn?.textContent).toBe('Cartes');
    expect(btn?.className).toBe('btn-x');
    // ?club=1 : identification déjà faite, pas de fenêtre ouverte
    expect(document.getElementById('club-card-overlay')).toBeNull();
  });

  it('sans caméra (HTTP) : interface arbitre directe, pas de fenêtre à l’ouverture', async () => {
    document.body.innerHTML =
      '<div><button id="btn-back-to-list" class="btn-x">Retour</button></div>';
    const win = {
      location: { pathname: '/arene1/arbitre', search: '' },
      isSecureContext: false,
      navigator: {},
      fetch: vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ active: true, club: 'Cercle' }),
      }),
      document,
    };
    expect(cards.cameraUsable(win)).toBe(false);
    expect(await cards.install(win, () => null)).toBe(true);
    expect(document.getElementById('btn-club-cards')).not.toBeNull();
    expect(document.getElementById('club-card-overlay')).toBeNull();
  });

  it('caméra utilisable : contexte sécurisé + getUserMedia', () => {
    expect(
      cards.cameraUsable({
        isSecureContext: true,
        navigator: { mediaDevices: { getUserMedia() {} } },
      })
    ).toBe(true);
    expect(cards.cameraUsable({ isSecureContext: true, navigator: {} })).toBe(false);
  });
});
