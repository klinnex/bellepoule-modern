/**
 * BellePoule Modern - Main App Component
 * Licensed under GPL-3.0
 */

import React, { useEffect, useCallback, useState, useRef, Suspense } from 'react';
import { Home, Plus, Radio, Sun, Moon, Contrast, BookOpen, Settings, X, Swords, Wrench, Wifi, Tv2 } from 'lucide-react';
import { Competition, PhaseType } from '../shared/types';
import type { CompetitionCreateData } from '../shared/types/preload';
import { logger, LogCategory } from '@shared/services/logger';
import CompetitionList from './components/CompetitionList';
const CompetitionView = React.lazy(() => import('./components/CompetitionView'));
const CommandPalette = React.lazy(() => import('./components/CommandPalette'));
const NewCompetitionModal = React.lazy(() => import('./components/NewCompetitionModal'));
const ReportIssueModal = React.lazy(() => import('./components/ReportIssueModal'));
const AboutModal = React.lazy(() => import('./components/AboutModal'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const DTCallNotification = React.lazy(() => import('./components/DTCallNotification'));
const UpdateNotification = React.lazy(() => import('./components/UpdateNotification'));
const KeyboardShortcutsHelp = React.lazy(() => import('./components/KeyboardShortcutsHelp'));
const WikiModal = React.lazy(() => import('./components/WikiModal'));
const WifiQRModal = React.lazy(() => import('./components/WifiQRModal').then(m => ({ default: m.WifiQRModal })));
const XiaomiRemotePanel = React.lazy(() => import('./components/XiaomiRemotePanel').then(m => ({ default: m.XiaomiRemotePanel })));
const TrainingLauncherModal = React.lazy(() => import('./components/training/TrainingLauncherModal'));
const TrainingPanel = React.lazy(() => import('./components/training/TrainingPanel'));
import { ToastProvider, useToast } from './components/Toast';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import { TranslationProvider, useTranslation, Theme } from './contexts/TranslationContext';
import { ErrorBoundary, CompetitionErrorBoundary } from './components/ErrorBoundary';
import { useAppState } from './hooks/useAppState';

const PHASE_BADGE: Record<string, { label: string; cls: string }> = {
  [PhaseType.CHECKIN]: { label: 'Appel', cls: 'badge-checkin' },
  [PhaseType.POOL]: { label: 'Poules', cls: 'badge-pool' },
  [PhaseType.QUEST]: { label: 'Quest', cls: 'badge-pool' },
  [PhaseType.DIRECT_ELIMINATION]: { label: 'Tableau', cls: 'badge-tableau' },
  [PhaseType.CLASSIFICATION]: { label: 'Résultats', cls: 'badge-results' },
};

const THEME_CYCLE: Theme[] = ['default', 'light', 'dark'];
const ThemeIcon: React.FC<{ theme: Theme }> = ({ theme }) => {
  if (theme === 'light') return <Sun size={16} />;
  if (theme === 'dark') return <Moon size={16} />;
  return <Contrast size={16} />;
};

const AppContent: React.FC = () => {
  const { t, isLoading: translationLoading, theme, changeTheme } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showWikiModal, setShowWikiModal] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showWifiQR, setShowWifiQR] = useState(false);
  const [showTVRemote, setShowTVRemote] = useState(false);
  const [remoteServerUrl, setRemoteServerUrl] = useState<string | null>(null);
  const [remoteArenaCount, setRemoteArenaCount] = useState<number>(1);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [trainingActive, setTrainingActive] = useState(false);
  const [showTrainingPanel, setShowTrainingPanel] = useState(false);
  const [trainingServerUrl, setTrainingServerUrl] = useState('');
  const [trainingStrips, setTrainingStrips] = useState(1);
  const [trainingWeapon, setTrainingWeapon] = useState('');
  const [trainingLaunching, setTrainingLaunching] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const [toolsMenuPos, setToolsMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

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
    handleBack,
    handleSettingsSave,
    handleTabSwitch,
  } = useAppState(showToast);

  // Load competitions on mount — attendre db:ready si la fenêtre s'ouvre avant la DB
  useEffect(() => {
    if (window.electronAPI?.onDbReady) {
      // Si la DB n'est pas encore prête, attendre l'event puis charger
      let loaded = false;
      const tryLoad = () => { if (!loaded) { loaded = true; loadCompetitions(); } };
      window.electronAPI.onDbReady(tryLoad);
      // Charger quand même après 1s au cas où db:ready est déjà passé
      const fallback = setTimeout(tryLoad, 1000);
      return () => clearTimeout(fallback);
    } else {
      loadCompetitions();
    }
  }, []);

  // Listen for menu events
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onMenuNewCompetition(() => setShowNewCompetitionModal(true));
      window.electronAPI.onMenuReportIssue(() => setShowReportIssueModal(true));
      window.electronAPI.onShowAbout(() => setShowAboutModal(true));

      // Listen for file operations
      window.electronAPI.onFileOpened(async (filepath: string) => {
        logger.debug(LogCategory.UI, 'Fichier .BPM ouvert', { filepath });
        await loadCompetitions();
      });

      window.electronAPI.onFileSaved(async (filepath: string) => {
        logger.debug(LogCategory.UI, 'Fichier sauvegardé', { filepath });
      });

      // Listen for save events
      window.electronAPI.onMenuSave(() => {
        showToast('Sauvegarde effectuée', 'success');
      });

      window.electronAPI.onMenuOpenSettings(() => {
        setShowSettingsModal(true);
      });

      window.electronAPI.onAutosaveCompleted(() => {
        logger.debug(LogCategory.UI, 'Autosave OK');
      });

      window.electronAPI.onAutosaveFailed(() => {
        showToast('Échec de la sauvegarde automatique', 'error');
      });
    }

    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('menu:open-settings');
        window.electronAPI.removeAllListeners('menu:new-competition');
        window.electronAPI.removeAllListeners('menu:report-issue');
        window.electronAPI.removeAllListeners('menu:show-about');
        window.electronAPI.removeAllListeners('file:opened');
        window.electronAPI.removeAllListeners('file:saved');
        window.electronAPI.removeAllListeners('menu:save');
        window.electronAPI.removeAllListeners('autosave:completed');
        window.electronAPI.removeAllListeners('autosave:failed');
      }
    };
  }, []);

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

  // Sync logo from disk to localStorage so PDF exports always find it
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getLogo?.().then((logo: string | null) => {
      if (logo) localStorage.setItem('bellepoule-logo', logo);
      else localStorage.removeItem('bellepoule-logo');
    }).catch((err: unknown) => {
      logger.warn(LogCategory.UI, 'Impossible de charger le logo', err instanceof Error ? err : undefined);
    });
    const unsub = window.electronAPI.onLogoLoaded?.((logo: string | null) => {
      if (logo) localStorage.setItem('bellepoule-logo', logo);
      else localStorage.removeItem('bellepoule-logo');
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);


  useEffect(() => {
    if (!showToolsMenu) return;
    const rect = toolsBtnRef.current?.getBoundingClientRect();
    if (rect) setToolsMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    const handler = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setShowToolsMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showToolsMenu]);

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
        const newComp = await window.electronAPI.db.createCompetition(competitionData as unknown as CompetitionCreateData);
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

  const handleSelectCompetition = useCallback(async (competition: Competition) => {
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
  }, [openCompetitions, showToast]);

  const handleTabClose = useCallback(async (competitionId: string, e?: React.MouseEvent) => {
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
  }, [openCompetitions, activeTabId, confirm]);

  const handleLaunchTraining = useCallback(async (weapon: string, strips: number, customRules?: any) => {
    if (!window.electronAPI?.training) return;
    setTrainingLaunching(true);
    try {
      const startRes = await window.electronAPI.training.startServer();
      if (!startRes.success || !startRes.serverInfo) {
        showToast(startRes.error ?? 'Impossible de démarrer le serveur', 'error');
        return;
      }
      const sessionRes = await window.electronAPI.training.startSession(strips, weapon, customRules);
      if (!sessionRes.success) {
        await window.electronAPI.training.stopServer();
        showToast(sessionRes.error ?? 'Impossible de démarrer la session', 'error');
        return;
      }
      setTrainingServerUrl(startRes.serverInfo.url);
      setTrainingStrips(strips);
      setTrainingWeapon(weapon);
      setTrainingActive(true);
      setShowTrainingPanel(true);
      setShowTrainingModal(false);
    } catch (err) {
      showToast('Erreur lors du lancement de l\'entraînement', 'error');
    } finally {
      setTrainingLaunching(false);
    }
  }, [showToast]);

  const handleStopTraining = useCallback(async () => {
    if (!window.electronAPI?.training) return;
    try {
      await window.electronAPI.training.stopSession();
      await window.electronAPI.training.stopServer();
    } catch { /* ignore */ }
    setTrainingActive(false);
    setShowTrainingPanel(false);
    setTrainingServerUrl('');
    setTrainingStrips(1);
    setTrainingWeapon('');
  }, []);

  const handleDeleteCompetition = useCallback(async (id: string) => {
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
  }, [activeTabId, currentCompetition]);


  return (
    <>
      <Suspense fallback={null}><UpdateNotification /></Suspense>
      <Suspense fallback={null}><DTCallNotification /></Suspense>
      <div className="app">
        <header className="header">
          <div className="header-title">
            <Swords size={22} strokeWidth={1.75} />
            {t('app.title')}
          </div>
          {/* Ctrl+K hint — clickable */}
          <button
            className="header-search-hint"
            onClick={() => setShowCommandPalette(true)}
            title="Ouvrir la palette de commandes (Ctrl+K)"
          >
            <span>Rechercher…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="header-nav">
            {openCompetitions.length > 0 && view === 'competition' && (
              <button
                className="btn btn-secondary btn-icon-label"
                onClick={() => {
                  setView('home');
                  setActiveTabId(null);
                }}
                title={t('app.back_to_list')}
              >
                <Home size={15} />
                {t('app.home')}
              </button>
            )}
            <button className="btn btn-primary btn-icon-label" onClick={() => setShowNewCompetitionModal(true)}>
              <Plus size={15} />
              {t('menu.new_competition')}
            </button>
            <button
              className={`btn btn-icon-label ${trainingActive ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => {
                if (!trainingActive) setShowTrainingModal(true);
                else setShowTrainingPanel(v => !v);
              }}
              title={trainingActive ? (showTrainingPanel ? 'Masquer le panneau entraînement' : 'Afficher le panneau entraînement') : 'Mode entraînement'}
            >
              <Swords size={15} />
              Entraînement
            </button>
            {view === 'competition' && currentCompetition && (
              <button
                className="btn btn-secondary btn-icon-label"
                onClick={() => {
                  setRequestedPhase('remote');
                }}
                title={t('phases.remote')}
              >
                <Radio size={15} />
                {t('phases.remote')}
              </button>
            )}
            <button
              className="btn-theme-toggle"
              onClick={() => {
                const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
                changeTheme(next);
              }}
              title={`Thème : ${theme}`}
            >
              <ThemeIcon theme={theme} />
            </button>
            <button
              className="btn btn-icon"
              onClick={() => setShowWikiModal(true)}
              title={t('wiki.button_title')}
            >
              <BookOpen size={16} />
            </button>
            {view === 'competition' && currentCompetition && (
              <div ref={toolsMenuRef} style={{ position: 'relative' }}>
                <button
                  ref={toolsBtnRef}
                  className="btn btn-secondary btn-icon-label"
                  onClick={() => setShowToolsMenu(v => !v)}
                  title="Outils"
                  aria-haspopup="true"
                  aria-expanded={showToolsMenu}
                >
                  <Wrench size={15} /> Outils
                </button>
                {showToolsMenu && (
                  <div
                    style={{
                      position: 'fixed',
                      right: toolsMenuPos.right,
                      top: toolsMenuPos.top,
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-xl)',
                      minWidth: '200px',
                      zIndex: 1100,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      className="comp-header-dropdown-item"
                      onClick={() => { setShowWifiQR(true); setShowToolsMenu(false); }}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <Wifi size={15} /> QR Code WiFi
                    </button>
                    <button
                      className="comp-header-dropdown-item"
                      onClick={() => { setShowTVRemote(true); setShowToolsMenu(false); }}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <Tv2 size={15} /> Télécommande TV
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              className="btn btn-secondary btn-icon-label"
              onClick={() => setShowSettingsModal(true)}
              title={t('settings.title')}
            >
              <Settings size={15} />
              {t('settings.title')}
            </button>
          </div>
        </header>

        {/* Onglets des compétitions ouvertes */}
        {openCompetitions.length > 0 && (
          <div
            className="tabs-container"
            style={{
              background: '#f8fafc',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              padding: '0 1rem',
              gap: '0.25rem',
              overflowX: 'auto',
            }}
          >
            {/* Onglet Général/Accueil */}
            <div
              className={`tab ${view === 'home' ? 'tab-active' : ''}`}
              onClick={() => {
                setView('home');
                setActiveTabId(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                background: view === 'home' ? 'white' : 'transparent',
                border: view === 'home' ? '1px solid #e5e7eb' : '1px solid transparent',
                borderBottom: view === 'home' ? '1px solid white' : 'none',
                marginBottom: view === 'home' ? '-1px' : '0',
                transition: 'all 0.15s ease',
                position: 'relative',
                minWidth: '120px',
              }}
              onMouseEnter={e => {
                if (view !== 'home') {
                  e.currentTarget.style.background = '#f1f5f9';
                }
              }}
              onMouseLeave={e => {
                if (view !== 'home') {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span
                style={{
                  fontWeight: view === 'home' ? '600' : '400',
                  color: view === 'home' ? '#1f2937' : '#6b7280',
                  fontSize: '0.875rem',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Home size={13} /> {t('app.home')}
              </span>
            </div>

            {openCompetitions.map(openComp => (
              <div
                key={openComp.competition.id}
                className={`tab ${activeTabId === openComp.competition.id ? 'tab-active' : ''} ${draggedTabId === openComp.competition.id ? 'tab-dragging' : ''}`}
                draggable
                onDragStart={() => setDraggedTabId(openComp.competition.id)}
                onDragEnd={() => setDraggedTabId(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (!draggedTabId || draggedTabId === openComp.competition.id) return;
                  setOpenCompetitions(prev => {
                    const from = prev.findIndex(o => o.competition.id === draggedTabId);
                    const to = prev.findIndex(o => o.competition.id === openComp.competition.id);
                    if (from === -1 || to === -1) return prev;
                    const next = [...prev];
                    const [moved] = next.splice(from, 1);
                    next.splice(to, 0, moved);
                    return next;
                  });
                  setDraggedTabId(null);
                }}
                onClick={() => handleTabSwitch(openComp.competition.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px 8px 0 0',
                  cursor: 'grab',
                  background: activeTabId === openComp.competition.id ? 'white' : 'transparent',
                  border: activeTabId === openComp.competition.id ? '1px solid #e5e7eb' : '1px solid transparent',
                  borderBottom: activeTabId === openComp.competition.id ? '1px solid white' : 'none',
                  marginBottom: activeTabId === openComp.competition.id ? '-1px' : '0',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  minWidth: '150px',
                  opacity: draggedTabId === openComp.competition.id ? 0.4 : 1,
                }}
                onMouseEnter={e => {
                  if (activeTabId !== openComp.competition.id) {
                    e.currentTarget.style.background = '#f1f5f9';
                  }
                }}
                onMouseLeave={e => {
                  if (activeTabId !== openComp.competition.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {/* Dot coloré de la compétition */}
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: openComp.competition.color || '#3B5BDB',
                  boxShadow: `0 0 0 2px ${(openComp.competition.color || '#3B5BDB')}33`,
                }} />
                <span
                  style={{
                    fontWeight: activeTabId === openComp.competition.id ? '600' : '400',
                    color: activeTabId === openComp.competition.id ? '#1f2937' : '#6b7280',
                    fontSize: '0.875rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                  }}
                >
                  {openComp.competition.title}
                  {openComp.isDirty && (
                    <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>●</span>
                  )}
                  {(() => {
                    const phase = openComp.competition.phases?.[openComp.competition.currentPhaseIndex];
                    const badge = phase ? PHASE_BADGE[phase.type] : null;
                    return badge ? (
                      <span className={`tab-phase-badge ${badge.cls}`}>{badge.label}</span>
                    ) : null;
                  })()}
                </span>
                <button
                  onClick={e => handleTabClose(openComp.competition.id, e)}
                  style={{
                    background: 'none', border: 'none', color: '#6b7280',
                    cursor: 'pointer', padding: '0.125rem', borderRadius: '3px',
                    fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6b7280'; }}
                  title={t('app.close_tab')}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
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
              <CompetitionList
                competitions={competitions}
                isLoading={isLoading}
                onSelect={handleSelectCompetition}
                onDelete={handleDeleteCompetition}
                onNewCompetition={() => setShowNewCompetitionModal(true)}
              />
            </ErrorBoundary>
          )}

          {view === 'competition' && currentCompetition && activeTabId && (
            <CompetitionErrorBoundary key={currentCompetition.id}>
              <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Chargement…</div>}>
                <CompetitionView
                  competition={currentCompetition}
                  onUpdate={handleUpdateCompetition}
                  requestPhase={requestedPhase ?? undefined}
                  onPhaseApplied={() => setRequestedPhase(null)}
                  onRemoteServerChange={(url, count) => { setRemoteServerUrl(url); setRemoteArenaCount(count); }}
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

        {showSettingsModal && (
          <Suspense fallback={null}>
            <SettingsModal onClose={() => setShowSettingsModal(false)} onSave={handleSettingsSave} />
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
                handleTabSwitch(id);
              }}
              onNewCompetition={() => {
                setShowCommandPalette(false);
                setShowNewCompetitionModal(true);
              }}
              onOpenSettings={() => {
                setShowCommandPalette(false);
                setShowSettingsModal(true);
              }}
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

        {trainingActive && showTrainingPanel && (
          <Suspense fallback={null}>
            <TrainingPanel
              serverUrl={trainingServerUrl}
              strips={trainingStrips}
              weapon={trainingWeapon}
              onClose={() => setShowTrainingPanel(false)}
              onStop={handleStopTraining}
              onOpenSettings={() => { setShowTrainingPanel(false); setShowSettingsModal(true); }}
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
          <AppContent />
        </ConfirmProvider>
      </ToastProvider>
    </TranslationProvider>
  );
};

export default App;
