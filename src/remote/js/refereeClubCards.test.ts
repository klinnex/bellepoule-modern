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

  it('piste de l’URL', () => {
    expect(cards.arenaFromPath('/arene4/arbitre')).toBe(4);
    expect(cards.arenaFromPath('/kiosk')).toBeNull();
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
    expect(win.fetch).toHaveBeenCalledWith('/api/club/identify?arena=2');
  });

  it('séance reliée : bouton « Cartes » à côté de Retour', async () => {
    document.body.innerHTML =
      '<div><button id="btn-back-to-list" class="btn-x">Retour</button></div>';
    const win = {
      location: { pathname: '/arene2/arbitre', search: '' },
      fetch: vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ active: true, club: 'Cercle', hasMatch: true }),
      }),
      document,
    };
    expect(await cards.install(win, () => null)).toBe(true);
    const btn = document.getElementById('btn-club-cards');
    expect(btn?.textContent).toBe('Cartes');
    expect(btn?.className).toBe('btn-x');
    expect(document.getElementById('club-card-overlay')).toBeNull();
  });

  it('combat déjà sur la piste : vue arbitre directe, cartes via l’en-tête', async () => {
    document.body.innerHTML =
      '<div class="header"><button id="btn-header-menu"></button></div>' +
      '<div><button id="btn-back-to-list" class="btn-x">Retour</button></div>';
    const win = {
      location: { pathname: '/arene1/arbitre', search: '' },
      isSecureContext: true,
      navigator: { mediaDevices: { getUserMedia: vi.fn() } },
      fetch: vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ active: true, club: 'Cercle', hasMatch: true }),
      }),
      document,
    };
    expect(await cards.install(win, () => null)).toBe(true);
    expect(document.getElementById('club-card-overlay')).toBeNull();
    const header = document.getElementById('btn-club-cards-header');
    expect(header?.getAttribute('aria-label')).toMatch(/carte de club/);
    header?.click();
    expect(document.getElementById('club-card-overlay')).not.toBeNull();
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

  it('piste sans combat : lecture des cartes à l’ouverture', async () => {
    document.body.innerHTML =
      '<div><button id="btn-back-to-list" class="btn-x">Retour</button></div>';
    const win = {
      location: { pathname: '/arene3/arbitre', search: '' },
      isSecureContext: false,
      navigator: {},
      fetch: vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ active: true, club: 'Cercle', hasMatch: false }),
      }),
      setTimeout,
      clearTimeout,
      document,
    };
    expect(await cards.install(win, () => null)).toBe(true);
    expect(document.getElementById('club-card-overlay')).not.toBeNull();
  });
});
