/**
 * BellePoule Modern - Main App Component
 * Licensed under GPL-3.0
 */

import React, { useEffect, useCallback, useState, Suspense } from 'react';
import { Shield } from 'lucide-react';
import CompetitionList from './components/CompetitionList';

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
import { TranslationProvider, useTranslation } from './contexts/TranslationContext';
import { executeSlashCommand, SHOW_SHORTCUTS_EVENT } from './services/slashCommands';
import { saveActiveSection } from './components/settingsModal.helpers';
import { ErrorBoundary, CompetitionErrorBoundary } from './components/ErrorBoundary';
import { useAppState } from './hooks/useAppState';
import { useAppMenuHandlers } from './hooks/useAppMenuHandlers';
import { useTrainingSession } from './hooks/useTrainingSession';
import { useClubTab } from './hooks/useClubTab';
import { useCompetitionTabs } from './hooks/useCompetitionTabs';
import { useAppGlobalEffects } from './hooks/useAppGlobalEffects';
import { AppTabBar } from './components/app/AppTabBar';
import { AppHeader } from './components/app/AppHeader';

const AppContent: React.FC = () => {
  const { t, changeTheme, changeLanguage } = useTranslation();
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

  // Effets globaux : chargement initial, Ctrl+K, molette des champs numériques, logo (#1897)
  useAppGlobalEffects({
    loadCompetitions,
    toggleCommandPalette: () => setShowCommandPalette(prev => !prev),
    setCurrentCompetition,
    setOpenCompetitions,
  });

  // Ouverture / fermeture / suppression des compétitions et de leurs onglets (#1897)
  const {
    handleCreateCompetition,
    handleSelectCompetition,
    handleOpenCompetitionById,
    openImportedCompetitionRef,
    handleExportCompetition,
    handleTabClose,
    handleDeleteCompetition,
  } = useCompetitionTabs({
    openCompetitions,
    activeTabId,
    currentCompetition,
    setCompetitions,
    setOpenCompetitions,
    setActiveTabId,
    setCurrentCompetition,
    setView,
    setShowNewCompetitionModal,
    showToast,
    showActionableError,
    runOperation,
    confirm,
  });

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

  // Compétition affichée → main (« Enregistrer sous » l'exporte seule, #1117)
  useEffect(() => {
    window.electronAPI?.setCurrentCompetition?.(
      view === 'competition' && currentCompetition ? currentCompetition.id : null
    );
  }, [view, currentCompetition]);

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
        <AppHeader
          isEmptyHome={isEmptyHome}
          showHomeButton={(openCompetitions.length > 0 || clubTabOpen) && view !== 'home'}
          clubActive={view === 'club'}
          showTools={view === 'competition' && !!currentCompetition}
          clubIcon={clubIcon}
          trainingActive={trainingActive}
          showTrainingPanel={showTrainingPanel}
          onSearch={() => setShowCommandPalette(true)}
          onHome={() => {
            setView('home');
            setActiveTabId(null);
          }}
          onNewCompetition={() => setShowNewCompetitionModal(true)}
          onOpenClub={openClub}
          onTraining={() => {
            if (!trainingActive) setShowTrainingModal(true);
            else setShowTrainingPanel(v => !v);
          }}
          onWiki={() => setShowWikiModal(true)}
          onWifiQR={() => setShowWifiQR(true)}
          onTVRemote={() => setShowTVRemote(true)}
          onStartDemo={handleStartDemo}
          onSettings={() => setShowSettingsModal(true)}
        />

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
                <div className="app-1">
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
