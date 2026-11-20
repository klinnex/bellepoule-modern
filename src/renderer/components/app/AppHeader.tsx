/**
 * BellePoule Modern - En-tête de l'application (titre, recherche, aide, navigation,
 * Club, entraînement, thème, wiki, outils, paramètres). Extrait d'App.tsx (#1897).
 * Licensed under GPL-3.0
 */

import React from 'react';
import {
  BookOpen,
  Contrast,
  HelpCircle,
  Home,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Swords,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Tooltip } from '../Tooltip';
import { BrandLogo } from '../common/BrandLogo';
import UpdateMenuButton from '../UpdateMenuButton';
import { ToolsMenu } from './ToolsMenu';
import { useTranslation, type Theme } from '../../contexts/TranslationContext';
import { SHOW_SHORTCUTS_EVENT } from '../../services/slashCommands';

const THEME_CYCLE: Theme[] = ['default', 'light', 'dark'];
const ThemeIcon: React.FC<{ theme: Theme }> = ({ theme }) => {
  if (theme === 'light') return <Sun size={16} />;
  if (theme === 'dark') return <Moon size={16} />;
  return <Contrast size={16} />;
};

interface AppHeaderProps {
  /** Accueil sans compétition : recherche et « Nouvelle compétition » masquées */
  isEmptyHome: boolean;
  showHomeButton: boolean;
  clubActive: boolean;
  /** Compétition affichée : menu Outils */
  showTools: boolean;
  clubIcon: (size: number) => React.ReactNode;
  trainingActive: boolean;
  showTrainingPanel: boolean;
  onSearch: () => void;
  onHome: () => void;
  onNewCompetition: () => void;
  onOpenClub: () => void;
  onTraining: () => void;
  onWiki: () => void;
  onWifiQR: () => void;
  onTVRemote: () => void;
  onStartDemo: () => void;
  onSettings: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  isEmptyHome,
  showHomeButton,
  clubActive,
  showTools,
  clubIcon,
  trainingActive,
  showTrainingPanel,
  onSearch,
  onHome,
  onNewCompetition,
  onOpenClub,
  onTraining,
  onWiki,
  onWifiQR,
  onTVRemote,
  onStartDemo,
  onSettings,
}) => {
  const { t, theme, changeTheme } = useTranslation();
  return (
    <header className="header">
      <div className="header-title">
        <span className="brand-logo-wrap" aria-hidden="true">
          <BrandLogo size={30} />
        </span>
        <span className="header-title-text">{t('app.title')}</span>
      </div>
      {/* Ctrl+K hint — clickable (inutile tant qu'il n'y a rien à chercher) */}
      {!isEmptyHome && (
        <Tooltip content={t('actions.search')} position="bottom">
          <Button
            variant="secondary"
            icon={<Search size={15} aria-hidden="true" />}
            onClick={onSearch}
            aria-label={t('app.palette_title')}
            aria-keyshortcuts="Control+K"
          />
        </Tooltip>
      )}
      <Tooltip content={t('shortcuts.show_help')} position="bottom">
        <Button
          variant="secondary"
          icon={<HelpCircle size={15} aria-hidden="true" />}
          onClick={() =>
            window.dispatchEvent(new CustomEvent(SHOW_SHORTCUTS_EVENT, { detail: 'all' }))
          }
          aria-label={t('shortcuts.show_help')}
          aria-keyshortcuts="?"
        />
      </Tooltip>
      <div className="header-nav">
        {showHomeButton && (
          <Button className="btn-icon-label" onClick={onHome} title={t('app.back_to_list')}>
            <Home size={15} />
            <span className="header-btn-label">{t('app.home')}</span>
          </Button>
        )}
        {!isEmptyHome && (
          <Button variant="primary" className="btn-icon-label" onClick={onNewCompetition}>
            <Plus size={15} />
            {t('menu.new_competition')}
          </Button>
        )}
        <UpdateMenuButton />
        <Button
          variant={clubActive ? 'primary' : 'secondary'}
          className="btn-icon-label"
          onClick={onOpenClub}
          title={t('app.club_open')}
        >
          {clubIcon(15)}
          <span className="header-btn-label">{t('app.club')}</span>
        </Button>
        <Button
          variant={trainingActive ? 'danger' : 'secondary'}
          className="btn-icon-label"
          onClick={onTraining}
          title={
            trainingActive
              ? showTrainingPanel
                ? t('app.training_hide')
                : t('app.training_show')
              : t('app.training_mode')
          }
        >
          <Swords size={15} />
          <span className="header-btn-label">{t('app.training')}</span>
        </Button>
        <Tooltip content={`Thème : ${theme}`}>
          <button
            className="btn-theme-toggle"
            onClick={() => {
              const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
              changeTheme(next);
            }}
            aria-label={`Thème : ${theme}`}
          >
            <ThemeIcon theme={theme} />
          </button>
        </Tooltip>
        <Button
          variant="ghost"
          className="btn-icon"
          onClick={onWiki}
          title={t('wiki.button_title')}
          aria-label={t('wiki.button_title')}
        >
          <BookOpen size={16} />
        </Button>
        {showTools && (
          <ToolsMenu onWifiQR={onWifiQR} onTVRemote={onTVRemote} onStartDemo={onStartDemo} />
        )}
        <Button className="btn-icon-label" onClick={onSettings} title={t('settings.title')}>
          <Settings size={15} />
          <span className="header-btn-label">{t('settings.title')}</span>
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
