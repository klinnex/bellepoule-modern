/**
 * BellePoule Modern - Mode Club (#1872) : plusieurs clubs. Choix / création d'un club
 * (onglet Club) et section « Clubs » de l'accueil (Général), visible dès qu'un club existe.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { FolderOpen, Plus, Shield } from 'lucide-react';
import type { ClubSummary } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmDialog';
import { importClubBackup } from './clubBackup';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useClubs(): [ClubSummary[] | null, () => Promise<void>] {
  const [clubs, setClubs] = useState<ClubSummary[] | null>(null);
  const reload = async () => {
    const api = window.electronAPI?.club;
    setClubs(api ? await api.listClubs() : []);
  };
  useEffect(() => {
    void reload();
  }, []);
  return [clubs, reload];
}

/** Carte d'un club : logo, nom, effectif, séance ouverte */
const ClubCard: React.FC<{ club: ClubSummary; onOpen: () => void }> = ({ club, onOpen }) => {
  const { t } = useTranslation();
  return (
    <button type="button" className="club-tile" onClick={onOpen}>
      {club.logo ? (
        <img className="club-tile-logo" src={club.logo} alt="" />
      ) : (
        <Shield className="club-tile-logo club-header-logo--empty" aria-hidden="true" />
      )}
      <span className="club-tile-body">
        <span className="club-tile-name">{club.name || t('club.default_name')}</span>
        <span className="club-tile-meta">
          {t('clubs.members_n', { count: club.membersCount })}
          {club.openSessionDate && (
            <span className="badge badge-success">
              {t('clubs.open_session', { date: club.openSessionDate })}
            </span>
          )}
        </span>
      </span>
    </button>
  );
};

/** Formulaire de création d'un club */
const NewClubForm: React.FC<{ onCreated: (id: string) => void }> = ({ onCreated }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const api = window.electronAPI?.club;
    if (!api || !name.trim()) return;
    try {
      const club = await api.createClub({ name });
      setName('');
      onCreated(club.id);
    } catch (err) {
      showToast(errText(err), 'error');
    }
  };
  return (
    <form className="club-row" onSubmit={create}>
      <label className="form-label club-grow" data-tour="club-name">
        {t('clubs.new_name')}
        <input
          className="form-input"
          value={name}
          maxLength={100}
          placeholder={t('clubs.new_name_ph')}
          onChange={e => setName(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        icon={<Plus size={15} aria-hidden="true" />}
        disabled={!name.trim()}
      >
        {t('clubs.create')}
      </Button>
    </form>
  );
};

/** Chargement d'une sauvegarde de club (.bpclub) faite sur un autre poste */
const LoadBackup: React.FC<{ onLoaded: (id: string) => void }> = ({ onLoaded }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const load = async () => {
    try {
      const r = await importClubBackup(t, () =>
        confirm({
          message: t('clubs.backup_replace_confirm'),
          confirmLabel: t('clubs.backup_replace'),
        })
      );
      if (!r) return;
      showToast(t('clubs.backup_loaded', { name: r.clubName }), 'success');
      onLoaded(r.clubId);
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };
  return (
    <div className="club-row">
      <p className="club-muted club-grow">{t('clubs.backup_import_help')}</p>
      <Button icon={<FolderOpen size={15} aria-hidden="true" />} onClick={() => void load()}>
        {t('clubs.backup_import')}
      </Button>
    </div>
  );
};

/** Onglet Club sans club choisi : liste des clubs + création */
export const ClubPicker: React.FC<{ onSelect: (clubId: string) => void }> = ({ onSelect }) => {
  const { t } = useTranslation();
  const [clubs] = useClubs();
  if (clubs === null) return null;
  return (
    <div className="club-view">
      <header className="club-header">
        <Shield className="club-header-logo club-header-logo--empty" aria-hidden="true" />
        <div className="club-grow">
          <h1 className="club-header-title">{t('clubs.title')}</h1>
          <p className="club-header-sub">
            {clubs.length === 0 ? t('clubs.first_club') : t('clubs.choose')}
          </p>
        </div>
      </header>
      {clubs.length > 0 && (
        <div className="club-tiles">
          {clubs.map(c => (
            <ClubCard key={c.id} club={c} onOpen={() => onSelect(c.id)} />
          ))}
        </div>
      )}
      <section className="club-card" aria-label={t('clubs.create')}>
        <NewClubForm onCreated={onSelect} />
        <LoadBackup onLoaded={onSelect} />
      </section>
    </div>
  );
};

/** Section « Clubs » de l'accueil : affichée seulement si au moins un club existe */
export const ClubsHomeSection: React.FC<{ onOpenClub: (clubId: string | null) => void }> = ({
  onOpenClub,
}) => {
  const { t } = useTranslation();
  const [clubs] = useClubs();
  if (!clubs || clubs.length === 0) return null;
  return (
    <section className="content club-home" aria-labelledby="club-home-title">
      <div className="club-row club-row--between">
        <h2 id="club-home-title" className="club-card-title">
          {t('clubs.title')}
        </h2>
        <Button
          size="sm"
          icon={<Plus size={14} aria-hidden="true" />}
          onClick={() => onOpenClub(null)}
        >
          {t('clubs.create')}
        </Button>
      </div>
      <div className="club-tiles">
        {clubs.map(c => (
          <ClubCard key={c.id} club={c} onOpen={() => onOpenClub(c.id)} />
        ))}
      </div>
    </section>
  );
};
