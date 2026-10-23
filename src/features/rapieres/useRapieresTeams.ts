/**
 * BellePoule Modern - Tournoi des rapières : équipes enregistrées comme tireurs (#1118)
 * Création / mise à jour d'une équipe et import d'un export d'inscriptions (#1211).
 * Licensed under GPL-3.0
 */

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
  updateFencer: (id: string, updates: Partial<Fencer>) => Promise<void>;
  setRapieresTeam: (id: string, info: RapieresTeamInfo) => void;
}

export function useRapieresTeams({
  competitionDate,
  addFencer,
  updateFencer,
  setRapieresTeam,
}: UseRapieresTeamsOptions) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Nom = nom d'équipe, prénom = noms des deux tireurs, club = niveau (affiché partout)
  const rapieresFencerFields = (team: RapieresTeamDraft) => ({
    lastName: team.name,
    firstName: teamMembersLabel(team.info.fencers),
    club: t(`rapieres.level_${team.info.level}`),
  });

  const handleSaveRapieresTeam = async (team: RapieresTeamDraft, fencer?: Fencer) => {
    if (fencer) {
      await updateFencer(fencer.id, rapieresFencerFields(team));
      setRapieresTeam(fencer.id, team.info);
      return;
    }
    const added = await addFencer({
      ...rapieresFencerFields(team),
      gender: Gender.MIXED,
      nationality: 'FRA',
      status: FencerStatus.NOT_CHECKED_IN,
    } as NewFencer);
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
    for (const team of teams) await handleSaveRapieresTeam(team);
    showToast(
      t('rapieres.import_done', { n: String(teams.length) }) +
        (skipped.length ? ' ' + t('rapieres.import_skipped', { lines: skipped.join(', ') }) : ''),
      skipped.length ? 'warning' : 'success'
    );
  };

  return { rapieresFencerFields, handleSaveRapieresTeam, handleImportRapieresTeams };
}
