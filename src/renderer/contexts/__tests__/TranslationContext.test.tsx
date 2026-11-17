// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { TranslationProvider, useTranslation, type Language } from '../TranslationContext';
import { getActiveLocale } from '@shared/utils/localeFormat';

let api: ReturnType<typeof useTranslation>;
function Probe() {
  api = useTranslation();
  return (
    <>
      <span data-testid="lang">{api.language}</span>
      <span data-testid="locale">{getActiveLocale()}</span>
    </>
  );
}

async function mount(lang: Language) {
  localStorage.setItem('bellepoule-language', lang);
  render(
    <TranslationProvider>
      <Probe />
    </TranslationProvider>
  );
  await screen.findByText(lang);
}

describe('TranslationContext : langue active (#1160)', () => {
  beforeEach(() => localStorage.clear());

  it('attribut lang du document et formats Intl suivent la langue', async () => {
    await mount('de');
    expect(document.documentElement.lang).toBe('de');
    expect(getActiveLocale()).toBe('de-DE');
    await act(() => api.changeLanguage('zh-HK'));
    expect(document.documentElement.lang).toBe('zh-HK');
    expect(getActiveLocale()).toBe('zh-HK');
  });

  it('enfants rendus avec la nouvelle langue (date des cartes, #1213)', async () => {
    await mount('fr');
    expect(screen.getByTestId('locale').textContent).toBe('fr-FR');
    await act(() => api.changeLanguage('en'));
    expect(screen.getByTestId('locale').textContent).toBe('en-GB');
  });

  it('paramètre 0 interpolé (plus remplacé par le gabarit)', async () => {
    await mount('fr');
    (api.translations as Record<string, unknown>).test = { count: '{{count}} tireurs' };
    expect(api.t('test.count', { count: 0 })).toBe('0 tireurs');
  });

  it('pluriel : clés _one / _other selon Intl.PluralRules', async () => {
    await mount('en');
    (api.translations as Record<string, unknown>).test = {
      fencers_one: '{{count}} fencer',
      fencers_other: '{{count}} fencers',
    };
    expect(api.t('test.fencers', { count: 0 })).toBe('0 fencers');
    expect(api.t('test.fencers', { count: 1 })).toBe('1 fencer');
    expect(api.t('test.fencers', { count: 2 })).toBe('2 fencers');
    expect(api.t('test.missing', { count: 2 })).toBe('test.missing');
  });
});

describe('TranslationContext : réglages changés par l’agent (#1880)', () => {
  type Handler = (e: { type: string }) => void;
  let handler: Handler | null;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    handler = null;
    unsubscribe = vi.fn();
    get = vi.fn(async () => ({ language: 'en', theme: 'dark' }));
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onCompetitionEvent: (cb: Handler) => {
        handler = cb;
        return unsubscribe;
      },
      settings: { get },
    };
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('applique la langue et le thème de la base sur settings:changed', async () => {
    await mount('fr');
    await act(async () => {
      handler!({ type: 'settings:changed' });
    });
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('en'));
    expect(api.theme).toBe('dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);
    expect(localStorage.getItem('bellepoule-language')).toBe('en');
    expect(localStorage.getItem('bellepoule-theme')).toBe('dark');
  });

  it('ignore les autres événements, les valeurs identiques et inconnues', async () => {
    await mount('fr');
    await act(async () => {
      handler!({ type: 'competitions:changed' });
    });
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValue({ language: 'fr', theme: 'default' });
    await act(async () => {
      handler!({ type: 'settings:changed' });
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('bellepoule-theme')).toBeNull();
    get.mockResolvedValue({ language: 'xx', theme: 'neon' });
    await act(async () => {
      handler!({ type: 'settings:changed' });
    });
    expect(screen.getByTestId('lang').textContent).toBe('fr');
    expect(api.theme).toBe('default');
  });

  it('se désabonne au démontage', async () => {
    const { unmount } = render(
      <TranslationProvider>
        <Probe />
      </TranslationProvider>
    );
    await screen.findByText('fr');
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
