import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  ARTICLES,
  CATEGORY_LABELS,
  getLang,
  getTitle,
  getContent,
  SEARCH_PLACEHOLDER,
  NO_RESULTS_LABEL,
} from './wiki/wikiData';
import { renderSection } from './wiki/WikiArticleRenderer';

interface Props {
  onClose: () => void;
}

const WikiModal: React.FC<Props> = ({ onClose }) => {
  const { language, t } = useTranslation();
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
        if (
          s.shortcuts?.some(
            sh => sh.desc.toLowerCase().includes(q) || sh.key.toLowerCase().includes(q)
          )
        )
          return true;
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
      className="is-3e6e9e"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('wiki.title')}
        className="is-72bdc9"
      >
        <div className="is-cb0277">
          <span className="is-444c6c">📖</span>
          <h1 className="is-34f232">{t('wiki.title')}</h1>
          <input
            type="search"
            placeholder={SEARCH_PLACEHOLDER[lang]}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
            }}
            className="is-3cf363"
          />
          <button onClick={onClose} aria-label={t('actions.close')} className="is-c10a3c">
            ✕
          </button>
        </div>

        <div className="is-9b1e11">
          <nav className="is-7665df">
            {categories.map(cat => {
              const catArticles = filteredArticles.filter(a => a.category === cat);
              if (catArticles.length === 0) return null;
              const catLabel = CATEGORY_LABELS[cat];
              return (
                <div key={cat} className="mb-2">
                  <div className="is-8236e8">
                    {catLabel.icon} {catLabel[lang]}
                  </div>
                  {catArticles.map(article => (
                    <button
                      key={article.id}
                      onClick={() => handleSelect(article.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.4rem 1rem',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        background:
                          selectedId === article.id ? 'var(--color-primary)' : 'transparent',
                        color: selectedId === article.id ? '#fff' : 'var(--color-text)',
                        fontWeight: selectedId === article.id ? 600 : 400,
                        borderRadius: 0,
                      }}
                    >
                      <span className="flex-shrink-0">{article.icon}</span>
                      <span className="is-9f529b">{getTitle(article, lang)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {filteredArticles.length === 0 && (
              <div className="is-95d09e">{NO_RESULTS_LABEL[lang]}</div>
            )}
          </nav>

          <article className="is-88019c">
            <h1
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--color-text)',
              }}
            >
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
