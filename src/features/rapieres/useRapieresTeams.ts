/**
 * BellePoule Modern - Tournoi des rapières : équipes enregistrées comme tireurs (#1118)
 * Création / mise à jour d'une équipe et import d'un export d'inscriptions (#1211).
 * Licensed under GPL-3.0
 */

import { useState } from 'react';
import { Fencer, FencerStatus, Gender } from '../../shared/types';
import { useToast } from '../../renderer/components/Toast';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import { RapieresTeamInfo } from './rapieres.types';
import { teamMembersLabel } from './rapieresCalculations';
import { parseRapieresTeams } from './rapieresImport';
import { RapieresTeamDraft } from './RapieresTeamModal';

type NewFencer = Omit<Fencer, 'id' | 'createdAt' | 'updatedAt'>;

interface UseRapieresTeamsOptions {
  competitionDate?: Date | string;
  addFencer: (fencer: NewFencer) => Promise<Fencer | null | undefined>;
  /** Ajout groupé : addFencer en boucle n'en garde qu'un (closure sur la liste périmée) */
  bulkAddFencers: (fencers: NewFencer[]) => Promise<Fencer[]>;
  updateFencer: (id: string, updates: Partial<Fencer>) => Promise<void>;
  setRapieresTeam: (id: string, info: RapieresTeamInfo) => void;
}

export function useRapieresTeams({
  competitionDate,
  addFencer,
  bulkAddFencers,
  updateFencer,
  setRapieresTeam,
}: UseRapieresTeamsOptions) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  // Fichier lu, en attente de sélection des équipes (fenêtre d'import)
  const [rapieresImport, setRapieresImport] = useState<{
    filename: string;
    teams: RapieresTeamDraft[];
    skipped: number[];
  } | null>(null);

  // Nom = nom d'équipe, prénom = noms des deux tireurs, club = niveau (affiché partout)
  const rapieresFencerFields = (team: RapieresTeamDraft) => ({
    lastName: team.name,
    firstName: teamMembersLabel(team.info.fencers),
    club: t(`rapieres.level_${team.info.level}`),
  });

  const newTeamFencer = (team: RapieresTeamDraft) =>
    ({
      ...rapieresFencerFields(team),
      gender: Gender.MIXED,
      nationality: 'FRA',
      status: FencerStatus.NOT_CHECKED_IN,
    }) as NewFencer;

  const handleSaveRapieresTeam = async (team: RapieresTeamDraft, fencer?: Fencer) => {
    if (fencer) {
      await updateFencer(fencer.id, rapieresFencerFields(team));
      setRapieresTeam(fencer.id, team.info);
      return;
    }
    const added = await addFencer(newTeamFencer(team));
    if (added) setRapieresTeam(added.id, team.info);
  };

  // Import d'un export d'inscriptions (CSV / XLSX), une équipe par ligne (#1211)
  const handleImportRapieresTeams = async () => {
    const result = await window.electronAPI.dialog.openFile({
      title: t('rapieres.import_teams'),
      filters: [
        { name: 'CSV / Excel', extensions: ['csv', 'xlsx'] },
        { name: '*', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (!result?.filePath) return;
    const refDate = competitionDate ? new Date(competitionDate) : new Date();
    const { teams, skipped } = parseRapieresTeams(result.content || '', refDate);
    if (teams.length === 0) {
      showToast(t('rapieres.import_empty'), 'error');
      return;
    }
    const filename = result.filePath.split(/[/\\]/).pop() || result.filePath;
    setRapieresImport({ filename, teams, skipped });
  };

  // Équipes cochées dans la fenêtre d'import : ajout groupé
  const confirmRapieresImport = async (teams: RapieresTeamDraft[]) => {
    if (teams.length === 0) return;
    const added = await bulkAddFencers(teams.map(newTeamFencer));
    added.forEach((fencer, i) => setRapieresTeam(fencer.id, teams[i].info));
    showToast(t('rapieres.import_done', { n: String(added.length) }), 'success');
  };

  return {
    rapieresFencerFields,
    handleSaveRapieresTeam,
    handleImportRapieresTeams,
    /** Props de la fenêtre de sélection (null = fermée) */
    rapieresImportModal: rapieresImport && {
      ...rapieresImport,
      onImport: confirmRapieresImport,
      onClose: () => setRapieresImport(null),
    },
  };
}
