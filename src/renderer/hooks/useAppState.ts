import { useState, useCallback } from 'react';
import { Competition } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';

type View = 'home' | 'competition';

export interface OpenCompetition {
  competition: Competition;
  isDirty: boolean;
}

export interface AppState {
  view: View;
  competitions: Competition[];
  currentCompetition: Competition | null;
  openCompetitions: OpenCompetition[];
  activeTabId: string | null;
  showNewCompetitionModal: boolean;
  showReportIssueModal: boolean;
  showSettingsModal: boolean;
  requestedPhase: string | null;
  isLoading: boolean;
}

export interface AppStateActions {
  setView: React.Dispatch<React.SetStateAction<View>>;
  setCompetitions: React.Dispatch<React.SetStateAction<Competition[]>>;
  setCurrentCompetition: React.Dispatch<React.SetStateAction<Competition | null>>;
  setOpenCompetitions: React.Dispatch<React.SetStateAction<OpenCompetition[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowNewCompetitionModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowReportIssueModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedPhase: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loadCompetitions: () => Promise<void>;
  handleUpdateCompetition: (updated: Competition) => void;
  handleBack: () => void;
  handleSettingsSave: (settings: unknown) => void;
  handleTabSwitch: (competitionId: string) => void;
}

export function useAppState(
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): AppState & AppStateActions {
  const [view, setView] = useState<View>('home');
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [currentCompetition, setCurrentCompetition] = useState<Competition | null>(null);
  const [openCompetitions, setOpenCompetitions] = useState<OpenCompetition[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showNewCompetitionModal, setShowNewCompetitionModal] = useState(false);
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [requestedPhase, setRequestedPhase] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCompetitions = useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const comps = await window.electronAPI.db.getAllCompetitions();
        setCompetitions(comps);
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to load competitions', error as Error);
    }
    setIsLoading(false);
  }, []);

  const handleUpdateCompetition = useCallback((updated: Competition) => {
    setCurrentCompetition(prev => (prev?.id === updated.id ? updated : prev));
    setCompetitions(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setOpenCompetitions(prev =>
      prev.map(open =>
        open.competition.id === updated.id ? { ...open, competition: updated, isDirty: true } : open
      )
    );
  }, []);

  const handleBack = useCallback(() => {
    setView('home');
  }, []);

  const handleSettingsSave = useCallback((settings: unknown) => {
    logger.debug(LogCategory.UI, 'Settings saved', { settings });
  }, []);

  const handleTabSwitch = useCallback(
    (competitionId: string) => {
      const openComp = openCompetitions.find(open => open.competition.id === competitionId);
      if (openComp) {
        setActiveTabId(competitionId);
        setCurrentCompetition(openComp.competition);
        setView('competition');
      }
    },
    [openCompetitions]
  );

  return {
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
    setIsLoading,
    loadCompetitions,
    handleUpdateCompetition,
    handleBack,
    handleSettingsSave,
    handleTabSwitch,
  };
}
