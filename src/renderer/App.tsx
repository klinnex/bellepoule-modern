/**
 * BellePoule Modern - Main App Component
 * Licensed under GPL-3.0
 */

import React, { useEffect, useCallback, useState, useRef, Suspense } from 'react';
import {
  Home,
  Plus,
  Sun,
  Moon,
  Contrast,
  BookOpen,
  Settings,
  Swords,
  Shield,
  HelpCircle,
  Search,
} from 'lucide-react';
import { Competition } from '../shared/types';
import type { CompetitionCreateData } from '../shared/types/preload';
import { logger, LogCategory } from '@shared/services/logger';
import CompetitionList from './components/CompetitionList';
import { BrandLogo } from './components/common/BrandLogo';

const DemoLauncherModal = React.lazy(() => import('./components/training/DemoLauncherModal'));
const CompetitionView = React.lazy(() => import('./components/CompetitionView'));
const ClubView = React.lazy(() => import('./components/club/ClubView'));
const ClubsHomeSection = React.lazy(() =>
  import('./components/club/ClubPicker').then(m => ({ default: m.ClubsHomeSection }))
);
const CommandPalette = React.lazy(() => import('./components/CommandPalette'));
const NewCompetitionModal = React.lazy(() => import('./components/NewCompetitionModal'));
const ReportIssueModal = React.lazy(() => import('./components/ReportIssueModal'));
const AboutModal = React.lazy(() => import('./components/AboutModal'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const DTCallNotification = React.lazy(() => import('./components/DTCallNotification'));
const PrivacyPrompts = React.lazy(() => import('./components/PrivacyPrompts'));
const UpdateNotification = React.lazy(() => import('./components/UpdateNotification'));
import UpdateMenuButton from './components/UpdateMenuButton';
const KeyboardShortcutsHelp = React.lazy(() => import('./components/KeyboardShortcutsHelp'));
const WikiModal = React.lazy(() => import('./components/WikiModal'));
const WifiQRModal = React.lazy(() =>
  import('./components/WifiQRModal').then(m => ({ default: m.WifiQRModal }))
);
const XiaomiRemotePanel = React.lazy(() =>
  import('./components/XiaomiRemotePanel').then(m => ({ default: m.XiaomiRemotePanel }))
);
const TrainingLauncherModal = React.lazy(
  () => import('./components/training/TrainingLauncherModal')
);
const TrainingPanel = React.lazy(() => import('./components/training/TrainingPanel'));
import { CompetitionViewSkeleton } from './components/Skeleton';
import { ToastProvider, useToast } from './components/Toast';
import { OperationProvider, useOperation } from './components/common/OperationProgress';
import PrintDialogHost from './components/print/PrintDialogHost';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import { TranslationProvider, useTranslation, Theme } from './contexts/TranslationContext';
import { Button } from './components/common/Button';
import { Tooltip } from './components/Tooltip';
import { executeSlashCommand, SHOW_SHORTCUTS_EVENT } from './services/slashCommands';
import { saveActiveSection } from './components/settingsModal.helpers';
import { ErrorBoundary, CompetitionErrorBoundary } from './components/ErrorBoundary';
import { useAppState } from './hooks/useAppState';
import { useAppMenuHandlers } from './hooks/useAppMenuHandlers';
import { useTrainingSession } from './hooks/useTrainingSession';
import { useClubTab } from './hooks/useClubTab';
import { ToolsMenu } from './components/app/ToolsMenu';
import { AppTabBar } from './components/app/AppTabBar';

const THEME_CYCLE: Theme[] = ['default', 'light', 'dark'];
const ThemeIcon: React.FC<{ theme: Theme }> = ({ theme }) => {
  if (theme === 'light') return <Sun size={16} />;
  if (theme === 'dark') return <Moon size={16} />;
  return <Contrast size={16} />;
};

const AppContent: React.FC = () => {
  const { t, theme, changeTheme, changeLanguage } = useTranslation();
  const { showToast, showActionableError } = useToast();
  const { runOperation } = useOperation();
  const { confirm } = useConfirm();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showWikiModal, setShowWikiModal] = useState(false);
  const [showWifiQR, setShowWifiQR] = useState(false);
  const [showTVRemote, setShowTVRemote] = useState(false);
  const [remoteServerUrl, setRemoteServerUrl] = useState<string | null>(null);
  const [remoteArenaCount, setRemoteArenaCount] = useState<number>(1);
  // Entraînement / démo autonome : état et lancement (#1897)
  const {
    showTrainingModal,
    setShowTrainingModal,
    showDemoModal,
    setShowDemoModal,
    trainingActive,
    showTrainingPanel,
    setShowTrainingPanel,
    trainingServerUrl,
    trainingStrips,
    trainingWeapon,
    trainingLaunching,
    handleLaunchTraining,
    handleStartDemo,
    handleLaunchDemo,
    handleStopTraining,
  } = useTrainingSession(showToast);

  const {
    view,
    competitions,
    currentCompetition,
    openCompetitions,
    activeTabId,
    showNewCompetitionModal,
    showReportIssueModal,
    showSettingsModal,
    requestedPhase,
    isLoading,
    setView,
    setCompetitions,
    setCurrentCompetition,
    setOpenCompetitions,
    setActiveTabId,
    setShowNewCompetitionModal,
    setShowReportIssueModal,
    setShowSettingsModal,
    setRequestedPhase,
    loadCompetitions,
    handleUpdateCompetition,
    handleSettingsSave,
    handleTabSwitch,
  } = useAppState(showToast);

  // Mode Club (#1872) : onglet mémorisé, club affiché (logo, nom) — hook dédié (#1897)
  const { clubTabOpen, setClubTabOpen, activeClubId, setActiveClubId, activeClub } =
    useClubTab(view);
  const clubIcon = (size: number) =>
    activeClub?.logo ? (
      <img className="club-icon-logo" src={activeClub.logo} alt="" width={size} height={size} />
    ) : (
      <Shield size={size} aria-hidden="true" />
    );

  // Accueil sans compétition : l'état vide porte déjà le CTA principal
  const isEmptyHome = view === 'home' && !isLoading && competitions.length === 0;

  // Load competitions on mount — attendre db:ready si la fenêtre s'ouvre avant la DB
  useEffect(() => {
    if (window.electronAPI?.onDbReady) {
      // Si la DB n'est pas encore prête, attendre l'event puis charger
      let loaded = false;
      const tryLoad = () => {
        if (!loaded) {
          loaded = true;
          loadCompetitions();
        }
      };
      window.electronAPI.onDbReady(tryLoad);
      // Charger quand même après 1s au cas où db:ready est déjà passé
      const fallback = setTimeout(tryLoad, 1000);
      return () => clearTimeout(fallback);
    } else {
      loadCompetitions();
    }
  }, []);

  // Menu natif et fichiers (.bpm ouvert, sauvegarde) : hook dédié (#1897)
  useAppMenuHandlers({
    onNewCompetition: () => setShowNewCompetitionModal(true),
    onReportIssue: () => setShowReportIssueModal(true),
    onAbout: () => setShowAboutModal(true),
    onOpenSettings: () => setShowSettingsModal(true),
    reloadCompetitions: loadCompetitions,
    openImportedCompetition: id => openImportedCompetitionRef.current(id),
    showToast,
  });

  // Ctrl+K → command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Un scroll (trackpad macOS notamment) sur un input number focus ne doit pas
  // en changer la valeur (comportement natif Chromium trompeur, ex: score max)
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        target.blur();
      }
    };
    document.addEventListener('wheel', handler, { passive: true, capture: true });
    return () => document.removeEventListener('wheel', handler, { capture: true });
  }, []);

  // Sync logo from disk to localStorage so PDF exports always find it
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI
      .getLogo?.()
      .then((logo: string | null) => {
        if (logo) localStorage.setItem('bellepoule-logo', logo);
        else localStorage.removeItem('bellepoule-logo');
      })
      .catch((err: unknown) => {
        logger.warn(
          LogCategory.UI,
          'Impossible de charger le logo',
          err instanceof Error ? err : undefined
        );
      });
    const unsub = window.electronAPI.onLogoLoaded?.((logo: string | null) => {
      if (logo) localStorage.setItem('bellepoule-logo', logo);
      else localStorage.removeItem('bellepoule-logo');
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handleCreateCompetition = useCallback(async (data: Partial<Competition>) => {
    try {
      if (window.electronAPI) {
        // Assurer que le titre est défini
        const competitionData = {
          title: data.title || 'Nouvelle compétition',
          date: data.date || new Date(),
          weapon: data.weapon || 'FOIL',
          gender: data.gender || 'M',
          category: data.category || 'SENIOR',
          ...data,
        };
        const newComp = await window.electronAPI.db.createCompetition(
          competitionData as unknown as CompetitionCreateData
        );
        setCompetitions(prev => [newComp, ...prev]);

        // Ouvrir la compétition dans un nouvel onglet
        const fencers = await window.electronAPI.db.getFencersByCompetition(newComp.id);
        newComp.fencers = fencers;

        setOpenCompetitions(prev => [...prev, { competition: newComp, isDirty: false }]);
        setActiveTabId(newComp.id);
        setCurrentCompetition(newComp);
        setView('competition');
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to create competition', error as Error);
    }
    setShowNewCompetitionModal(false);
  }, []);

  const handleSelectCompetition = useCallback(
    async (competition: Competition) => {
      logger.debug(LogCategory.UI, 'handleSelectCompetition', {
        id: competition.id,
        title: competition.title,
      });

      try {
        if (window.electronAPI) {
          const existingOpenComp = openCompetitions.find(
            open => open.competition.id === competition.id
          );

          if (existingOpenComp) {
            setActiveTabId(competition.id);
            setCurrentCompetition(existingOpenComp.competition);
            setView('competition');
          } else {
            const comp = await window.electronAPI.db.getCompetition(competition.id);

            if (comp) {
              const fencers = await window.electronAPI.db.getFencersByCompetition(competition.id);
              comp.fencers = fencers;

              setOpenCompetitions(prev => [...prev, { competition: comp, isDirty: false }]);
              setActiveTabId(comp.id);
              setCurrentCompetition(comp);
              setView('competition');
            } else {
              logger.error(LogCategory.UI, 'Compétition non trouvée dans la DB', undefined, {
                id: competition.id,
              });
              showToast('Erreur: Compétition non trouvée', 'error');
            }
          }
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to load competition', error as Error);
        showToast('Erreur lors du chargement de la compétition', 'error');
      }
    },
    [openCompetitions, showToast]
  );

  // Ouvrir une compétition par id (ex : compétition séparée créée après poules)
  const handleOpenCompetitionById = useCallback(
    async (competitionId: string) => {
      const comp = await window.electronAPI?.db.getCompetition(competitionId);
      if (!comp) {
        showToast('Erreur: Compétition non trouvée', 'error');
        return;
      }
      setCompetitions(prev => (prev.some(c => c.id === comp.id) ? prev : [comp, ...prev]));
      await handleSelectCompetition(comp);
    },
    [handleSelectCompetition, showToast]
  );

  // Commandes « / » de la palette (docs/COMMANDES.md)
  const handleRunCommand = useCallback(
    (text: string) => {
      setShowCommandPalette(false);
      const competitionId = view === 'competition' ? activeTabId : null;
      void executeSlashCommand(text, {
        t,
        competitions,
        activeCompetitionId: competitionId ?? null,
        openCompetition: id => void handleOpenCompetitionById(id),
        goToPhase: phase => setRequestedPhase(phase),
        newCompetition: () => setShowNewCompetitionModal(true),
        openSettings: () => setShowSettingsModal(true),
        openTraining: () => !trainingActive && setShowTrainingModal(true),
        openWifi: () => setShowWifiQR(true),
        openWiki: () => setShowWikiModal(true),
        openAbout: () => setShowAboutModal(true),
        openReport: () => setShowReportIssueModal(true),
        openHelp: () => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT)),
        setTheme: changeTheme,
        setLanguage: lang => void changeLanguage(lang),
      }).then(res => {
        if (res.message) showToast(res.message, res.ok ? 'success' : 'error');
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, activeTabId, competitions, t, trainingActive, handleOpenCompetitionById]
  );

  // Ouvre (ou recharge) une compétition fusionnée depuis un .bpm (#1117)
  const openImportedCompetition = useCallback(
    async (id: string) => {
      const comp = await window.electronAPI.db.getCompetition(id);
      if (!comp) return;
      comp.fencers = await window.electronAPI.db.getFencersByCompetition(id);
      // Onglet déjà ouvert : le démonter pour relire l'état importé
      setOpenCompetitions(prev => prev.filter(open => open.competition.id !== id));
      setCurrentCompetition(null);
      setActiveTabId(null);
      await new Promise(resolve => setTimeout(resolve, 0));
      setOpenCompetitions(prev => [
        ...prev.filter(open => open.competition.id !== id),
        { competition: comp, isDirty: false },
      ]);
      setActiveTabId(comp.id);
      setCurrentCompetition(comp);
      setView('competition');
    },
    [setOpenCompetitions, setCurrentCompetition, setActiveTabId, setView]
  );
  const openImportedCompetitionRef = useRef(openImportedCompetition);
  openImportedCompetitionRef.current = openImportedCompetition;

  // Compétition affichée → main (« Enregistrer sous » l'exporte seule, #1117)
  useEffect(() => {
    window.electronAPI?.setCurrentCompetition?.(
      view === 'competition' && currentCompetition ? currentCompetition.id : null
    );
  }, [view, currentCompetition]);

  const handleExportCompetition = useCallback(
    async (id: string) => {
      try {
        const res = await runOperation('export', async () =>
          window.electronAPI?.file?.exportCompetition?.(id)
        );
        if (res?.success) showToast('Compétition exportée', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to export competition', error as Error);
        showActionableError('messages.export_competition_failed', error);
      }
    },
    [showToast, showActionableError, runOperation]
  );

  const handleTabClose = useCallback(
    async (competitionId: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }

      const openComp = openCompetitions.find(open => open.competition.id === competitionId);
      if (openComp && openComp.isDirty) {
        const ok = await confirm(
          'Des modifications ne sont pas sauvegardées. Voulez-vous vraiment fermer cette compétition ?'
        );
        if (!ok) {
          return;
        }
      }

      localStorage.removeItem(`bellepoule-remote-launched-${competitionId}`);
      localStorage.removeItem(`bellepoule-remote-port-${competitionId}`);
      // Fermer la saisie distante restée active (#1009) ; erreur ignorée si non démarrée
      window.electronAPI?.remote?.stopServer(competitionId).catch(() => undefined);

      const newOpenCompetitions = openCompetitions.filter(
        open => open.competition.id !== competitionId
      );
      setOpenCompetitions(newOpenCompetitions);

      if (activeTabId === competitionId) {
        if (newOpenCompetitions.length > 0) {
          const nextComp = newOpenCompetitions[newOpenCompetitions.length - 1];
          setActiveTabId(nextComp.competition.id);
          setCurrentCompetition(nextComp.competition);
        } else {
          setActiveTabId(null);
          setCurrentCompetition(null);
          setView('home');
        }
      }
    },
    [openCompetitions, activeTabId, confirm]
  );

  const openClub = useCallback(() => {
    setClubTabOpen(true);
    setActiveTabId(null);
    setView('club');
  }, [setClubTabOpen, setActiveTabId, setView]);

  /** Ouvre l'onglet Club sur un club donné (null : choix / création) — accueil */
  const openClubById = useCallback(
    (id: string | null) => {
      setActiveClubId(id);
      openClub();
    },
    [setActiveClubId, openClub]
  );

  const handleDeleteCompetition = useCallback(
    async (id: string) => {
      try {
        if (window.electronAPI) {
          await window.electronAPI.db.deleteCompetition(id);
          localStorage.removeItem(`bellepoule-remote-launched-${id}`);
          localStorage.removeItem(`bellepoule-remote-port-${id}`);
          setCompetitions(prev => prev.filter(c => c.id !== id));

          // Supprimer l'onglet ouvert pour cette compétition (évite le tab fantôme)
          setOpenCompetitions(prev => {
            const next = prev.filter(open => open.competition.id !== id);
            if (activeTabId === id) {
              if (next.length > 0) {
                const lastComp = next[next.length - 1].competition;
                setActiveTabId(lastComp.id);
                setCurrentCompetition(lastComp);
                setView('competition');
              } else {
                setActiveTabId(null);
                setCurrentCompetition(null);
                setView('home');
              }
            } else if (currentCompetition?.id === id) {
              setCurrentCompetition(null);
              setView('home');
            }
            return next;
          });
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to delete competition', error as Error);
      }
    },
    [activeTabId, currentCompetition]
  );

  return (
    <>
      <Suspense fallback={null}>
        <UpdateNotification />
      </Suspense>
      <Suspense fallback={null}>
        <DTCallNotification />
      </Suspense>
      <Suspense fallback={null}>
        <PrivacyPrompts />
      </Suspense>
      <div className="app">
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
                onClick={() => setShowCommandPalette(true)}
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
            {(openCompetitions.length > 0 || clubTabOpen) && view !== 'home' && (
              <Button
                className="btn-icon-label"
                onClick={() => {
                  setView('home');
                  setActiveTabId(null);
                }}
                title={t('app.back_to_list')}
              >
                <Home size={15} />
                <span className="header-btn-label">{t('app.home')}</span>
              </Button>
            )}
            {!isEmptyHome && (
              <Button
                variant="primary"
                className="btn-icon-label"
                onClick={() => setShowNewCompetitionModal(true)}
              >
                <Plus size={15} />
                {t('menu.new_competition')}
              </Button>
            )}
            <UpdateMenuButton />
            <Button
              variant={view === 'club' ? 'primary' : 'secondary'}
              className="btn-icon-label"
              onClick={openClub}
              title={t('app.club_open')}
            >
              {clubIcon(15)}
              <span className="header-btn-label">{t('app.club')}</span>
            </Button>
            <Button
              variant={trainingActive ? 'danger' : 'secondary'}
              className="btn-icon-label"
              onClick={() => {
                if (!trainingActive) setShowTrainingModal(true);
                else setShowTrainingPanel(v => !v);
              }}
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
              onClick={() => setShowWikiModal(true)}
              title={t('wiki.button_title')}
              aria-label={t('wiki.button_title')}
            >
              <BookOpen size={16} />
            </Button>
            {view === 'competition' && currentCompetition && (
              <ToolsMenu
                onWifiQR={() => setShowWifiQR(true)}
                onTVRemote={() => setShowTVRemote(true)}
                onStartDemo={handleStartDemo}
              />
            )}
            <Button
              className="btn-icon-label"
              onClick={() => setShowSettingsModal(true)}
              title={t('settings.title')}
            >
              <Settings size={15} />
              <span className="header-btn-label">{t('settings.title')}</span>
            </Button>
          </div>
        </header>

        {/* Onglets des compétitions ouvertes (+ onglet Club permanent) — #1897 */}
        {(openCompetitions.length > 0 || clubTabOpen) && (
          <AppTabBar
            view={view}
            activeTabId={activeTabId}
            openCompetitions={openCompetitions}
            setOpenCompetitions={setOpenCompetitions}
            clubTabOpen={clubTabOpen}
            clubIcon={clubIcon}
            clubName={activeClub?.name}
            onHome={() => {
              setView('home');
              setActiveTabId(null);
            }}
            onOpenClub={openClub}
            onCloseClub={() => {
              setClubTabOpen(false);
              if (view === 'club') setView('home');
            }}
            onSwitchTab={handleTabSwitch}
            onCloseTab={handleTabClose}
          />
        )}

        <main className="main">
          {view === 'home' && (
            <ErrorBoundary
              fallback={
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <h3>{t('app.load_error_title')}</h3>
                  <p>{t('app.load_error_message')}</p>
                  <button onClick={() => window.location.reload()}>{t('app.reload')}</button>
                </div>
              }
            >
              {/* Accueil : compétitions puis section Clubs en dessous (une seule zone défilante) */}
              <div className="home-stack">
                <CompetitionList
                  competitions={competitions}
                  isLoading={isLoading}
                  onSelect={handleSelectCompetition}
                  onDelete={handleDeleteCompetition}
                  onExport={handleExportCompetition}
                  onNewCompetition={() => setShowNewCompetitionModal(true)}
                  onStartDemo={window.electronAPI?.training ? handleStartDemo : undefined}
                  onOpenFile={
                    window.electronAPI?.file?.openDialog
                      ? () => void window.electronAPI.file.openDialog()
                      : undefined
                  }
                />
                <Suspense fallback={null}>
                  <ClubsHomeSection onOpenClub={openClubById} />
                </Suspense>
              </div>
            </ErrorBoundary>
          )}

          {view === 'club' && (
            <ErrorBoundary
              fallback={
                <div className="club-view">
                  <h3>{t('app.load_error_title')}</h3>
                </div>
              }
            >
              <Suspense fallback={null}>
                <ClubView clubId={activeClubId} onSelectClub={setActiveClubId} />
              </Suspense>
            </ErrorBoundary>
          )}

          {view === 'competition' && currentCompetition && activeTabId && (
            <CompetitionErrorBoundary key={currentCompetition.id}>
              <Suspense fallback={<CompetitionViewSkeleton />}>
                <CompetitionView
                  competition={currentCompetition}
                  onUpdate={handleUpdateCompetition}
                  requestPhase={requestedPhase ?? undefined}
                  onPhaseApplied={() => setRequestedPhase(null)}
                  onRemoteServerChange={(url, count) => {
                    setRemoteServerUrl(url);
                    setRemoteArenaCount(count);
                  }}
                  onOpenCompetition={handleOpenCompetitionById}
                />
              </Suspense>
            </CompetitionErrorBoundary>
          )}
        </main>

        {showNewCompetitionModal && (
          <Suspense fallback={null}>
            <NewCompetitionModal
              onClose={() => setShowNewCompetitionModal(false)}
              onCreate={handleCreateCompetition}
            />
          </Suspense>
        )}

        {showReportIssueModal && (
          <Suspense fallback={null}>
            <ReportIssueModal onClose={() => setShowReportIssueModal(false)} />
          </Suspense>
        )}

        {showAboutModal && (
          <Suspense fallback={null}>
            <AboutModal onClose={() => setShowAboutModal(false)} />
          </Suspense>
        )}

        <PrintDialogHost />

        {showSettingsModal && (
          <Suspense fallback={null}>
            <SettingsModal
              onClose={() => setShowSettingsModal(false)}
              onSave={handleSettingsSave}
            />
          </Suspense>
        )}

        {showWikiModal && (
          <Suspense fallback={null}>
            <WikiModal onClose={() => setShowWikiModal(false)} />
          </Suspense>
        )}

        {showWifiQR && (
          <Suspense fallback={null}>
            <WifiQRModal onClose={() => setShowWifiQR(false)} />
          </Suspense>
        )}

        {showTVRemote && currentCompetition && (
          <Suspense fallback={null}>
            <XiaomiRemotePanel
              competitionId={currentCompetition.id}
              serverUrl={remoteServerUrl ?? ''}
              arenaCount={remoteArenaCount}
              onClose={() => setShowTVRemote(false)}
            />
          </Suspense>
        )}

        {showCommandPalette && (
          <Suspense fallback={null}>
            <CommandPalette
              competitions={competitions}
              onClose={() => setShowCommandPalette(false)}
              onSelectCompetition={id => {
                setShowCommandPalette(false);
                void handleOpenCompetitionById(id);
              }}
              onNewCompetition={() => {
                setShowCommandPalette(false);
                setShowNewCompetitionModal(true);
              }}
              onOpenSettings={section => {
                setShowCommandPalette(false);
                if (section) saveActiveSection(section);
                setShowSettingsModal(true);
              }}
              onRunCommand={handleRunCommand}
            />
          </Suspense>
        )}

        {/* Overlay d'aide raccourcis clavier (autonome : touche « ? », Échap pour fermer) */}
        <Suspense fallback={null}>
          <KeyboardShortcutsHelp />
        </Suspense>

        {showTrainingModal && (
          <Suspense fallback={null}>
            <TrainingLauncherModal
              onClose={() => setShowTrainingModal(false)}
              onLaunch={handleLaunchTraining}
              isLoading={trainingLaunching}
            />
          </Suspense>
        )}

        {showDemoModal && (
          <Suspense fallback={null}>
            <DemoLauncherModal
              onClose={() => setShowDemoModal(false)}
              onLaunch={weapon => void handleLaunchDemo(weapon)}
              isLoading={trainingLaunching}
            />
          </Suspense>
        )}

        {trainingActive && showTrainingPanel && (
          <Suspense fallback={null}>
            <TrainingPanel
              serverUrl={trainingServerUrl}
              strips={trainingStrips}
              weapon={trainingWeapon}
              onClose={() => setShowTrainingPanel(false)}
              onStop={handleStopTraining}
              onOpenSettings={() => {
                setShowTrainingPanel(false);
                setShowSettingsModal(true);
              }}
            />
          </Suspense>
        )}
      </div>
    </>
  );
};

const App: React.FC = () => {
  return (
    <TranslationProvider>
      <ToastProvider>
        <ConfirmProvider>
          <OperationProvider>
            <AppContent />
          </OperationProvider>
        </ConfirmProvider>
      </ToastProvider>
    </TranslationProvider>
  );
};

export default App;
