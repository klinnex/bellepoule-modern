// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { TranslationProvider, useTranslation, type Language } from '../TranslationContext';
import { getActiveLocale } from '@shared/utils/localeFormat';

let api: ReturnType<typeof useTranslation>;
function Probe() {
  api = useTranslation();
  return <span data-testid="lang">{api.language}</span>;
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
