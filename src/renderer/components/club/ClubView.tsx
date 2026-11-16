/**
 * BellePoule Modern - Mode Club (#1872) : espace permanent du club, ouvert comme un
 * onglet de compétition. Sous-onglets Membres / Séances / Statistiques.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useConfirm } from '../ConfirmDialog';
import { ClubPicker } from './ClubPicker';
import type { ClubSettings } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { ClubMembersPanel } from './ClubMembersPanel';
import { ClubSessionsPanel } from './ClubSessionsPanel';
import { ClubStatsPanel } from './ClubStatsPanel';
import { ClubTour } from './ClubTour';
import { markCardsPrinted, readCardsPrinted, restartClubTour } from './clubTourFlags';

type ClubTab = 'members' | 'sessions' | 'stats';

const TABS: { id: ClubTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'members', icon: <Users size={15} aria-hidden="true" />, labelKey: 'club.tab_members' },
  {
    id: 'sessions',
    icon: <CalendarDays size={15} aria-hidden="true" />,
    labelKey: 'club.tab_sessions',
  },
  { id: 'stats', icon: <BarChart3 size={15} aria-hidden="true" />, labelKey: 'club.tab_stats' },
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
  const [tab, setTab] = useState<ClubTab>('members');
  const [settings, setSettings] = useState<ClubSettings>({ name: '', stripCount: 1 });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [membersCount, setMembersCount] = useState<number | null>(null);
  const [cardsPrinted, setCardsPrinted] = useState(readCardsPrinted);

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

  const onCardsPrinted = useCallback(() => {
    markCardsPrinted();
    setCardsPrinted(true);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="club-view">
      <header className="club-header">
        {settings.logo ? (
          <img className="club-header-logo" src={settings.logo} alt="" />
        ) : (
          <Shield className="club-header-logo club-header-logo--empty" aria-hidden="true" />
        )}
        <div className="club-grow">
          <h1 className="club-header-title">{settings.name || t('club.default_name')}</h1>
          <p className="club-header-sub">{t('club.subtitle')}</p>
        </div>
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
        {tab === 'members' && (
          <ClubMembersPanel
            clubId={clubId}
            settings={settings}
            onSettingsChange={setSettings}
            onMembersLoaded={setMembersCount}
            onCardsPrinted={onCardsPrinted}
          />
        )}
        {tab === 'sessions' && <ClubSessionsPanel clubId={clubId} settings={settings} />}
        {tab === 'stats' && <ClubStatsPanel clubId={clubId} />}
      </section>

      <ClubTour
        ready={settingsLoaded && membersCount !== null}
        hasName={settings.name.trim() !== ''}
        hasLogo={!!settings.logo}
        membersCount={membersCount ?? 0}
        cardsPrinted={cardsPrinted}
      />
    </div>
  );
};

export default ClubView;
