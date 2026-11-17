/**
 * BellePoule Modern - Mode Club : sauvegarde d'un club (.bpclub) et chargement sur un
 * autre poste (boîtes de dialogue + appels IPC).
 * Licensed under GPL-3.0
 */

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Nom de fichier proposé : <club>-AAAA-MM-JJ.bpclub */
export function backupFileName(clubName: string, date = new Date()): string {
  const base =
    clubName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'club';
  return `${base}-${date.toISOString().slice(0, 10)}.bpclub`;
}

const filters = (t: TFn) => [{ name: t('clubs.backup_file'), extensions: ['bpclub'] }];

/** Sauvegarde le club ; false si annulé */
export async function exportClubBackup(clubId: string, clubName: string, t: TFn): Promise<boolean> {
  const api = window.electronAPI;
  if (!api?.dialog?.saveFile || !api.club) return false;
  const r = await api.dialog.saveFile({
    title: t('clubs.backup_export'),
    defaultPath: backupFileName(clubName),
    filters: filters(t),
  });
  if (!r || r.canceled || !r.filePath) return false;
  await api.club.exportBackup(clubId, r.filePath);
  return true;
}

/**
 * Charge une sauvegarde ; si le club existe déjà, demande confirmation avant de remplacer.
 * Renvoie le club chargé, ou null si annulé.
 */
export async function importClubBackup(
  t: TFn,
  confirmReplace: () => Promise<boolean>
): Promise<{ clubId: string; clubName: string; replaced: boolean } | null> {
  const api = window.electronAPI;
  if (!api?.dialog?.openFile || !api.club) return null;
  const r = await api.dialog.openFile({ title: t('clubs.backup_import'), filters: filters(t) });
  if (!r?.filePath) return null;
  try {
    return await api.club.importBackup(r.filePath, false);
  } catch (e) {
    if (!String(e instanceof Error ? e.message : e).includes('CLUB_EXISTS')) throw e;
    if (!(await confirmReplace())) return null;
    return api.club.importBackup(r.filePath, true);
  }
}
