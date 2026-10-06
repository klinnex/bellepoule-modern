/**
 * BellePoule Modern - Keyboard Shortcuts Help
 * UX Improvement: Accessible shortcut documentation
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/TranslationContext';

interface Shortcut {
  key: string;
  descriptionKey: string;
  category: 'navigation' | 'actions' | 'competition' | 'global';
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { key: '?', descriptionKey: 'shortcuts.show_help', category: 'global' },
  { key: 'Ctrl + K', descriptionKey: 'shortcuts.quick_search', category: 'global' },
  { key: 'Esc', descriptionKey: 'shortcuts.close_modal', category: 'global' },

  // Navigation
  { key: 'Ctrl + 1', descriptionKey: 'shortcuts.go_pools', category: 'navigation' },
  { key: 'Ctrl + 2', descriptionKey: 'shortcuts.go_tableau', category: 'navigation' },
  { key: 'Ctrl + 3', descriptionKey: 'shortcuts.go_results', category: 'navigation' },
  { key: 'Tab', descriptionKey: 'shortcuts.nav_fields', category: 'navigation' },

  // Actions
  { key: 'Ctrl + S', descriptionKey: 'shortcuts.save', category: 'actions' },
  { key: 'Ctrl + Z', descriptionKey: 'shortcuts.undo', category: 'actions' },
  { key: 'Ctrl + Y', descriptionKey: 'shortcuts.redo', category: 'actions' },
  { key: 'Ctrl + N', descriptionKey: 'shortcuts.new_competition', category: 'actions' },
  { key: 'Ctrl + P', descriptionKey: 'shortcuts.print_sheets', category: 'actions' },

  // Competition
  { key: 'F5', descriptionKey: 'shortcuts.refresh_data', category: 'competition' },
  { key: 'Space', descriptionKey: 'shortcuts.timer', category: 'competition' },
  { key: '↑ ↓', descriptionKey: 'shortcuts.nav_list', category: 'competition' },
  { key: 'Enter', descriptionKey: 'shortcuts.validate', category: 'competition' },
];

export const KeyboardShortcutsHelp: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ne pas intercepter « ? » pendant une saisie texte
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !isTyping) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: t('shortcuts.category_all'), icon: '⌨️' },
    { id: 'global', label: t('shortcuts.category_global'), icon: '🌍' },
    { id: 'navigation', label: t('shortcuts.category_navigation'), icon: '🧭' },
    { id: 'actions', label: t('shortcuts.category_actions'), icon: '⚡' },
    { id: 'competition', label: t('shortcuts.category_competition'), icon: '🤺' },
  ];

  const filteredShortcuts =
    activeCategory === 'all' ? SHORTCUTS : SHORTCUTS.filter(s => s.category === activeCategory);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          width: '90%',
          maxWidth: '700px',
          maxHeight: '80vh',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', color: '#111827' }}>
              ⌨️ {t('shortcuts.title')}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
              {t('shortcuts.subtitle')}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '8px',
              borderRadius: '8px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            ×
          </button>
        </div>

        {/* Category Tabs */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s',
                backgroundColor: activeCategory === cat.id ? '#3b82f6' : '#f3f4f6',
                color: activeCategory === cat.id ? 'white' : '#374151',
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Shortcuts List */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            maxHeight: '400px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            {filteredShortcuts.map((shortcut, index) => (
              <React.Fragment key={index}>
                <kbd
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#111827',
                    boxShadow: '0 2px 0 #d1d5db',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shortcut.key}
                </kbd>
                <span
                  style={{
                    fontSize: '15px',
                    color: '#374151',
                    paddingLeft: '8px',
                  }}
                >
                  {t(shortcut.descriptionKey)}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            fontSize: '13px',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          {t('shortcuts.footer').split('?')[0]}
          <kbd
            style={{
              padding: '2px 6px',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            ?
          </kbd>
          {t('shortcuts.footer').split('?')[1]}
        </div>
      </div>
    </div>
  );
};

export default React.memo(KeyboardShortcutsHelp);
