/**
 * BellePoule Modern - Command Palette (Ctrl+K)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Competition } from '../../shared/types';
import { useTranslation } from '../contexts/TranslationContext';
import { categoryLabel } from '../../shared/utils/categoryLabel';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  competitions: Competition[];
  onClose: () => void;
  onSelectCompetition: (id: string) => void;
  onNewCompetition: () => void;
  onOpenSettings: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  competitions,
  onClose,
  onSelectCompetition,
  onNewCompetition,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Liste des commandes mémoïsée : ne se reconstruit que si les entrées changent
  const allCommands = useMemo<Command[]>(() => {
    const staticCommands: Command[] = [
      {
        id: 'new-competition',
        label: t('menu.new_competition'),
        icon: '➕',
        action: () => {
          onClose();
          onNewCompetition();
        },
        keywords: ['new', 'nouveau', 'creer', 'create'],
      },
      {
        id: 'settings',
        label: t('settings.title'),
        icon: '⚙️',
        action: () => {
          onClose();
          onOpenSettings();
        },
        keywords: ['settings', 'parametres', 'config', 'theme', 'langue'],
      },
    ];
    const competitionCommands: Command[] = competitions.map(c => ({
      id: `comp-${c.id}`,
      label: c.title,
      description: `${c.weapon} · ${categoryLabel(c.category, t)} · ${c.fencers.length} tireurs`,
      icon: '🏆',
      action: () => {
        onClose();
        onSelectCompetition(c.id);
      },
      keywords: [c.title.toLowerCase(), c.weapon, c.category],
    }));
    return [...staticCommands, ...competitionCommands];
  }, [competitions, t, onClose, onNewCompetition, onOpenSettings, onSelectCompetition]);

  // Mémoïsé pour éviter le recalcul à chaque changement de selectedIndex
  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      cmd =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.keywords?.some(k => k.includes(q))
    );
  }, [query, allCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filtered, selectedIndex, onClose]
  );

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="command-palette-search">
          <span className="command-palette-search-icon">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une compétition ou une action…"
            className="command-palette-input"
            aria-label="Search commands"
          />
          {query && (
            <button className="command-palette-clear" onClick={() => setQuery('')}>
              ✕
            </button>
          )}
        </div>

        <div ref={listRef} className="command-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">Aucun résultat</div>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`command-palette-item ${i === selectedIndex ? 'command-palette-item-selected' : ''}`}
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(i)}
                role="option"
                aria-selected={i === selectedIndex}
              >
                <span className="command-palette-item-icon">{cmd.icon}</span>
                <span className="command-palette-item-content">
                  <span className="command-palette-item-label">{cmd.label}</span>
                  {cmd.description && (
                    <span className="command-palette-item-description">{cmd.description}</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span>
            <kbd>↑↓</kbd> naviguer
          </span>
          <span>
            <kbd>↵</kbd> sélectionner
          </span>
          <span>
            <kbd>Esc</kbd> fermer
          </span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CommandPalette);
