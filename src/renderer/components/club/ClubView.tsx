/**
 * BellePoule Modern - Mode Club (#1872) : espace permanent du club, ouvert comme un
 * onglet de compétition. Sous-onglets Identité / Membres / Maîtres d'armes / Séances /
 * Statistiques / Exercices / Matériel.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  Dumbbell,
  GraduationCap,
  Package,
  Pencil,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { exportClubBackup } from './clubBackup';
import { ClubSyncModal } from './ClubSyncModal';
import { ClubPicker } from './ClubPicker';
import { ClubIdentityCard } from './ClubIdentityCard';
import type { ClubSettings } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { ClubMembersPanel } from './ClubMembersPanel';
import { ClubSessionsPanel } from './ClubSessionsPanel';
import { ClubCoachesPanel } from './ClubCoachesPanel';
import { ClubSessionMenu } from './ClubSessionMenu';
import { ClubStatsPanel } from './ClubStatsPanel';
import { ClubExercisesPanel } from './ClubExercisesPanel';
import { ClubInventoryPanel } from './ClubInventoryPanel';
import { ClubTour } from './ClubTour';
import type { ClubTourStepId } from './clubTourFlags';
import { markCardsPrinted, readCardsPrinted, restartClubTour } from './clubTourFlags';

type ClubTab =
  'identity' | 'members' | 'coaches' | 'sessions' | 'stats' | 'exercises' | 'inventory';

const TABS: { id: ClubTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'identity', icon: <Shield size={15} aria-hidden="true" />, labelKey: 'club.tab_identity' },
  { id: 'members', icon: <Users size={15} aria-hidden="true" />, labelKey: 'club.tab_members' },
  {
    id: 'coaches',
    icon: <GraduationCap size={15} aria-hidden="true" />,
    labelKey: 'clubCoach.tab',
  },
  {
    id: 'sessions',
    icon: <CalendarDays size={15} aria-hidden="true" />,
    labelKey: 'club.tab_sessions',
  },
  { id: 'stats', icon: <BarChart3 size={15} aria-hidden="true" />, labelKey: 'club.tab_stats' },
  {
    id: 'exercises',
    icon: <Dumbbell size={15} aria-hidden="true" />,
    labelKey: 'clubExercises.tab',
  },
  {
    id: 'inventory',
    icon: <Package size={15} aria-hidden="true" />,
    labelKey: 'clubInventory.tab',
  },
];

interface ClubViewProps {
  /** Club affiché ; null = choix ou création d'un club */
  clubId: string | null;
  onSelectClub: (clubId: string | null) => void;
}

export const ClubView: React.FC<ClubViewProps> = ({ clubId, onSelectClub }) => {
  if (!clubId) return <ClubPicker onSelect={onSelectClub} />;
  return <ClubSpace key={clubId} clubId={clubId} onSelectClub={onSelectClub} />;
};

const ClubSpace: React.FC<{
  clubId: string;
  onSelectClub: (clubId: string | null) => void;
}> = ({ clubId, onSelectClub }) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [tab, setTab] = useState<ClubTab>('members');
  const [settings, setSettings] = useState<ClubSettings>({ name: '', stripCount: 1 });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [membersCount, setMembersCount] = useState<number | null>(null);
  const [cardsPrinted, setCardsPrinted] = useState(readCardsPrinted);
  // Synchronisation menu global ↔ onglet Séances (chacun recharge quand l'autre modifie)
  const [menuRevision, setMenuRevision] = useState(0);
  const [syncOpen, setSyncOpen] = useState(false);
  const [panelRevision, setPanelRevision] = useState(0);
  const bumpMenu = useCallback(() => setMenuRevision(r => r + 1), []);
  const bumpPanel = useCallback(() => setPanelRevision(r => r + 1), []);
  // Séance affichée dans l'onglet Séances (plusieurs séances ouvertes possibles)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const showSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setTab('sessions');
  }, []);

  // Parcours guidé : l'onglet suit l'étape (nom et logo → Identité ; membres, cartes → Membres)
  const showTourStep = useCallback((step: ClubTourStepId) => {
    setTab(step === 'identity' || step === 'logo' ? 'identity' : 'members');
  }, []);

  const loadSettings = useCallback(async () => {
    const api = window.electronAPI?.club;
    if (!api) return;
    const club = await api.getClub(clubId);
    // Club supprimé ou inconnu : retour au choix du club
    if (!club) {
      onSelectClub(null);
      return;
    }
    setSettings(club);
    setSettingsLoaded(true);
  }, [clubId, onSelectClub]);

  const deleteClub = async () => {
    const api = window.electronAPI?.club;
    if (!api) return;
    const ok = await confirm({
      message: t('clubs.delete_confirm', { name: settings.name }),
      confirmLabel: t('actions.delete'),
    });
    if (!ok) return;
    await api.deleteClub(clubId);
    onSelectClub(null);
  };

  const saveBackup = async () => {
    try {
      if (await exportClubBackup(clubId, settings.name, t)) {
        showToast(t('clubs.backup_saved', { name: settings.name }), 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const onCardsPrinted = useCallback(() => {
    markCardsPrinted();
    setCardsPrinted(true);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Reprise d'un fichier modifié sur un autre poste : recharger le club et ses panneaux
  useEffect(() => {
    const off = window.electronAPI?.club?.onSynced?.(id => {
      if (id !== clubId) return;
      void loadSettings();
      bumpPanel();
    });
    return () => off?.();
  }, [clubId, loadSettings, bumpPanel]);

  return (
    <div className="club-view">
      <header className="club-header">
        {settings.logo ? (
          <img className="club-header-logo" src={settings.logo} alt="" />
        ) : (
          <Shield className="club-header-logo club-header-logo--empty" aria-hidden="true" />
        )}
        <div className="club-grow">
          <div className="club-title-group">
            <h1 className="club-header-title">{settings.name || t('club.default_name')}</h1>
            <Button
              variant="ghost"
              size="sm"
              icon={<Pencil size={14} aria-hidden="true" />}
              aria-label={t('club.identity')}
              title={t('club.identity')}
              onClick={() => setTab('identity')}
            />
          </div>
          <p className="club-header-sub">{t('club.subtitle')}</p>
        </div>
        <ClubSessionMenu
          clubId={clubId}
          revision={menuRevision}
          onChanged={bumpPanel}
          onPrepare={() => setTab('sessions')}
          onShow={showSession}
        />
        <Button
          variant="ghost"
          icon={<Sparkles size={15} aria-hidden="true" />}
          onClick={() => {
            setTab('members');
            restartClubTour();
          }}
        >
          {t('clubTour.restart')}
        </Button>
        <Button
          variant="ghost"
          icon={<RefreshCw size={15} aria-hidden="true" />}
          title={t('clubs.sync_button_help')}
          onClick={() => setSyncOpen(true)}
        >
          {t('clubs.sync_button')}
        </Button>
        <Button
          icon={<Save size={15} aria-hidden="true" />}
          title={t('clubs.backup_export_help')}
          onClick={() => void saveBackup()}
        >
          {t('clubs.backup_export')}
        </Button>
        <Button
          icon={<ArrowLeftRight size={15} aria-hidden="true" />}
          onClick={() => onSelectClub(null)}
        >
          {t('clubs.switch')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} aria-hidden="true" />}
          aria-label={t('clubs.delete')}
          title={t('clubs.delete')}
          onClick={() => void deleteClub()}
        />
      </header>

      {syncOpen && (
        <ClubSyncModal clubId={clubId} onChanged={bumpPanel} onClose={() => setSyncOpen(false)} />
      )}

      <nav className="club-nav" aria-label={t('club.nav_label')}>
        {TABS.map(item => (
          <Button
            key={item.id}
            variant={tab === item.id ? 'primary' : 'ghost'}
            icon={item.icon}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </nav>

      <section className="club-content">
        {tab === 'identity' && (
          <ClubIdentityCard clubId={clubId} settings={settings} onSettingsChange={setSettings} />
        )}
        {tab === 'members' && (
          <ClubMembersPanel
            clubId={clubId}
            settings={settings}
            onMembersLoaded={setMembersCount}
            onCardsPrinted={onCardsPrinted}
          />
        )}
        {tab === 'coaches' && <ClubCoachesPanel clubId={clubId} />}
        {tab === 'sessions' && (
          <ClubSessionsPanel
            clubId={clubId}
            settings={settings}
            revision={panelRevision}
            onChanged={bumpMenu}
            activeSessionId={activeSessionId}
            onActiveChange={setActiveSessionId}
          />
        )}
        {tab === 'stats' && <ClubStatsPanel clubId={clubId} />}
        {tab === 'exercises' && <ClubExercisesPanel />}
        {tab === 'inventory' && <ClubInventoryPanel clubId={clubId} />}
      </section>

      <ClubTour
        ready={settingsLoaded && membersCount !== null}
        hasName={settings.name.trim() !== ''}
        hasLogo={!!settings.logo}
        membersCount={membersCount ?? 0}
        cardsPrinted={cardsPrinted}
        onStep={showTourStep}
      />
    </div>
  );
};

export default ClubView;
