/**
 * Wiki intégré (#1073) : chaque article existe dans les 7 langues avec la même
 * structure que le français (mêmes types de blocs, même ordre). Empêche une
 * langue de diverger quand un article est modifié en français seulement.
 */
import { describe, it, expect } from 'vitest';
import { ARTICLES, CATEGORY_LABELS } from './wikiData';
import type { WikiLang, WikiSection } from './wiki.types';

const LANGS: WikiLang[] = ['fr', 'en', 'de', 'es', 'zh-HK', 'br', 'ca'];
const shape = (sections: WikiSection[] | undefined) =>
  (sections ?? []).map(s => `${s.type}${'items' in s && s.items ? `[${s.items.length}]` : ''}`);

describe('wikiData', () => {
  it('identifiants d’articles uniques', () => {
    const ids = ARTICLES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(ARTICLES.map(a => [a.id, a] as const))('article %s', (_id, article) => {
    it.each(LANGS)('titre et contenu en %s, même structure que fr', lang => {
      expect(article.title[lang], `titre ${lang}`).toBeTruthy();
      const content = article.content[lang];
      expect(content, `contenu ${lang}`).toBeDefined();
      expect(shape(content)).toEqual(shape(article.content.fr));
    });

    it('catégorie connue', () => {
      expect(CATEGORY_LABELS[article.category]).toBeDefined();
    });
  });
});
