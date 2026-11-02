import { describe, it, expect } from 'vitest';
import { buildBookFrontHTML, computeStartPages, escHtml } from './bookToc';

describe('bookToc', () => {
  it('pages de départ après garde + sommaire', () => {
    expect(computeStartPages([1, 3, 2])).toEqual([3, 4, 7]);
  });
  it('échappe le HTML', () => {
    expect(escHtml('<a>&"\'')).toBe('&lt;a&gt;&amp;&quot;&#39;');
  });
  it('sommaire avec numéros de page', () => {
    const html = buildBookFrontHTML({
      competitionTitle: 'Open <1>',
      toc: [{ title: 'Poule 1' }, { title: 'Tableau' }],
      pageCounts: [2, 1],
      labels: { contents: 'Sommaire', page: 'Page' },
    });
    expect(html).toContain('Open &lt;1&gt;');
    expect(html).toContain('Page 3');
    expect(html).toContain('Page 5');
  });
  it('sans comptage : pas de numéros', () => {
    const html = buildBookFrontHTML({
      competitionTitle: 'X',
      toc: [{ title: 'Poule 1' }],
      labels: { contents: 'Sommaire', page: 'Page' },
    });
    expect(html).not.toContain('book-toc-page">');
  });
});
