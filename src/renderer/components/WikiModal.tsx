import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  ARTICLES, CATEGORY_LABELS, getLang, getTitle, getContent,
  SEARCH_PLACEHOLDER, NO_RESULTS_LABEL,
} from './wiki/wikiData';
import { renderSection } from './wiki/WikiArticleRenderer';

interface Props {
  onClose: () => void;
}

const WikiModal: React.FC<Props> = ({ onClose }) => {
  const { language } = useTranslation();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const lang = getLang(language);

  const [selectedId, setSelectedId] = useState<string>('quickstart');
  const [query, setQuery] = useState('');

  const filteredArticles = useMemo(() => {
    if (!query.trim()) return ARTICLES;
    const q = query.toLowerCase();
    return ARTICLES.filter(a => {
      if (getTitle(a, lang).toLowerCase().includes(q)) return true;
      const sections = getContent(a, lang);
      return sections.some(s => {
        if (s.text?.toLowerCase().includes(q)) return true;
        if (s.items?.some(item => item.toLowerCase().includes(q))) return true;
        if (s.shortcuts?.some(sh => sh.desc.toLowerCase().includes(q) || sh.key.toLowerCase().includes(q))) return true;
        return false;
      });
    });
  }, [query, lang]);

  const selectedArticle = useMemo(
    () => ARTICLES.find(a => a.id === selectedId) ?? ARTICLES[0],
    [selectedId]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setQuery('');
  }, []);

  const categories = ['start', 'competition', 'phases', 'remote', 'advanced'] as const;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Documentation"
        style={{ background: 'var(--color-surface, #fff)', borderRadius: 12, width: '100%', maxWidth: 900, height: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, #e5e7eb)', flexShrink: 0 }}>
          <span style={{ fontSize: '1.4rem' }}>📖</span>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1, color: 'var(--color-text, #1f2937)' }}>
            Documentation
          </h1>
          <input
            type="search"
            placeholder={SEARCH_PLACEHOLDER[lang]}
            value={query}
            onChange={e => { setQuery(e.target.value); }}
            style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, padding: '0.4rem 0.75rem', fontSize: '0.875rem', width: 200, outline: 'none', background: 'var(--color-bg, #f3f4f6)' }}
          />
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-light, #6b7280)', padding: '0.25rem', borderRadius: 4, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <nav style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--color-border, #e5e7eb)', overflowY: 'auto', padding: '0.75rem 0' }}>
            {categories.map(cat => {
              const catArticles = filteredArticles.filter(a => a.category === cat);
              if (catArticles.length === 0) return null;
              const catLabel = CATEGORY_LABELS[cat];
              return (
                <div key={cat} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-light, #6b7280)', padding: '0.25rem 1rem' }}>
                    {catLabel.icon} {catLabel[lang]}
                  </div>
                  {catArticles.map(article => (
                    <button
                      key={article.id}
                      onClick={() => handleSelect(article.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        width: '100%', padding: '0.4rem 1rem', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.875rem',
                        background: selectedId === article.id ? 'var(--color-primary, #3b82f6)' : 'transparent',
                        color: selectedId === article.id ? '#fff' : 'var(--color-text, #1f2937)',
                        fontWeight: selectedId === article.id ? 600 : 400,
                        borderRadius: 0,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{article.icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getTitle(article, lang)}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
            {filteredArticles.length === 0 && (
              <div style={{ padding: '1rem', color: 'var(--color-text-light, #6b7280)', fontSize: '0.875rem', textAlign: 'center' }}>
                {NO_RESULTS_LABEL[lang]}
              </div>
            )}
          </nav>

          <article style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text, #1f2937)' }}>
              <span>{selectedArticle.icon}</span>
              {getTitle(selectedArticle, lang)}
            </h1>
            {getContent(selectedArticle, lang).map((section, idx) => renderSection(section, idx))}
          </article>
        </div>
      </div>
    </div>
  );
};

export default WikiModal;
