/**
 * BellePoule Modern - Keyboard Shortcuts Help
 * UX Improvement: Accessible shortcut documentation
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { SLASH_COMMANDS, SHOW_SHORTCUTS_EVENT } from '../services/slashCommands';
import { Command, Compass, Globe, Keyboard, Swords, Zap } from 'lucide-react';
import { Icon } from './common/Icon';

interface Shortcut {
  key: string;
  descriptionKey: string;
  category: 'navigation' | 'actions' | 'competition' | 'global' | 'commands';
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { key: '?', descriptionKey: 'shortcuts.show_help', category: 'global' },
  { key: 'Ctrl + K', descriptionKey: 'shortcuts.quick_search', category: 'global' },
  { key: 'Esc', descriptionKey: 'shortcuts.close_modal', category: 'global' },

  // Navigation
  { key: 'Tab', descriptionKey: 'shortcuts.nav_fields', category: 'navigation' },
  { key: '← ↑ → ↓', descriptionKey: 'shortcuts.nav_matrix', category: 'navigation' },
  { key: 'Enter / Space', descriptionKey: 'shortcuts.activate_card', category: 'navigation' },
  { key: 'Ctrl + 1…8', descriptionKey: 'shortcuts.goto_phase', category: 'navigation' },
  { key: 'Ctrl + ←', descriptionKey: 'shortcuts.prev_phase', category: 'navigation' },
  { key: 'Ctrl + →', descriptionKey: 'shortcuts.next_phase', category: 'navigation' },
  { key: 'Ctrl + T', descriptionKey: 'shortcuts.add_fencer', category: 'navigation' },

  // Actions
  { key: 'Ctrl + S', descriptionKey: 'shortcuts.save', category: 'actions' },
  { key: 'Ctrl + Z', descriptionKey: 'shortcuts.undo', category: 'actions' },
  { key: 'Ctrl + Y', descriptionKey: 'shortcuts.redo', category: 'actions' },
  { key: 'Ctrl + N', descriptionKey: 'shortcuts.new_competition', category: 'actions' },
  { key: 'Ctrl + P', descriptionKey: 'shortcuts.print_sheets', category: 'actions' },

  // Competition
  { key: 'N', descriptionKey: 'shortcuts.next_match', category: 'competition' },
  { key: 'Enter', descriptionKey: 'shortcuts.validate', category: 'competition' },
  // Saisie simplifiée de la matrice de poule (#1990)
  {
    key: 'Tab / Shift + Tab',
    descriptionKey: 'shortcuts.simplified_tab',
    category: 'competition',
  },
  { key: 'V / W + n', descriptionKey: 'shortcuts.simplified_v', category: 'competition' },

  // Commandes « / » de la palette Ctrl+K (docs/COMMANDES.md)
  ...SLASH_COMMANDS.map(c => ({
    key: c.usage,
    descriptionKey: c.descriptionKey,
    category: 'commands' as const,
  })),
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

    const show = (e: Event) => {
      // detail : catégorie à afficher (« all » pour le bouton « ? » de l'en-tête)
      const detail = (e as CustomEvent<string | undefined>).detail;
      setActiveCategory(typeof detail === 'string' ? detail : 'commands');
      setIsOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, show);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(SHOW_SHORTCUTS_EVENT, show);
    };
  }, []);

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: t('shortcuts.category_all'), icon: Keyboard },
    { id: 'global', label: t('shortcuts.category_global'), icon: Globe },
    { id: 'navigation', label: t('shortcuts.category_navigation'), icon: Compass },
    { id: 'actions', label: t('shortcuts.category_actions'), icon: Zap },
    { id: 'competition', label: t('shortcuts.category_competition'), icon: Swords },
    { id: 'commands', label: t('shortcuts.category_commands'), icon: Command },
  ];

  const filteredShortcuts =
    activeCategory === 'all' ? SHORTCUTS : SHORTCUTS.filter(s => s.category === activeCategory);

  return (
    <div className="keyboard-shortcuts-help-1">
      <div className="keyboard-shortcuts-help-2">
        {/* Header */}
        <div className="keyboard-shortcuts-help-3">
          <div>
            <h2 className="keyboard-shortcuts-help-4">
              <Icon icon={Keyboard} /> {t('shortcuts.title')}
            </h2>
            <p className="keyboard-shortcuts-help-5">{t('shortcuts.subtitle')}</p>
          </div>
          <button
            aria-label={t('actions.close')}
            onClick={() => setIsOpen(false)}
            className="keyboard-shortcuts-help-6"
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            ×
          </button>
        </div>

        {/* Category Tabs */}
        <div className="keyboard-shortcuts-help-7">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s',
                backgroundColor:
                  activeCategory === cat.id ? 'var(--color-primary)' : 'var(--color-bg)',
                color: activeCategory === cat.id ? 'white' : 'var(--color-text)',
              }}
            >
              <Icon icon={cat.icon} /> {cat.label}
            </button>
          ))}
        </div>

        {/* Shortcuts List */}
        <div className="keyboard-shortcuts-help-8">
          <div className="keyboard-shortcuts-help-9">
            {filteredShortcuts.map((shortcut, index) => (
              <React.Fragment key={index}>
                <kbd className="keyboard-shortcuts-help-10">{shortcut.key}</kbd>
                <span className="keyboard-shortcuts-help-11">{t(shortcut.descriptionKey)}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="keyboard-shortcuts-help-12">
          {t('shortcuts.footer').split('?')[0]}
          <kbd className="keyboard-shortcuts-help-13">?</kbd>
          {t('shortcuts.footer').split('?')[1]}
        </div>
      </div>
    </div>
  );
};

export default React.memo(KeyboardShortcutsHelp);
