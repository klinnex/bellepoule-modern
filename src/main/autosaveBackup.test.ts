import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AUTOSAVE_FILE_NAME, competitionAutosaveName, writeBackupSettings } from './backupSettings';
import { runBackupAutosave, type AutosaveSource } from './autosaveBackup';

const tmpDirs: string[] = [];
const makeTmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-autosave-'));
  tmpDirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Base factice : chaque export écrit un fichier de contenu identifiable */
function fakeDb(
  comps: { id: string; title?: string; settings?: { backupDir?: string } }[]
): AutosaveSource & { exportCompetitionToFile: ReturnType<typeof vi.fn> } {
  return {
    exportToFile: vi.fn(async (p: string) => fs.writeFileSync(p, 'GLOBAL')),
    exportCompetitionToFile: vi.fn(async (id: string, p: string) =>
      fs.writeFileSync(p, `COMP ${id}`)
    ),
    getAllCompetitions: () => comps,
  };
}

describe('runBackupAutosave', () => {
  it('écrit la base complète dans le dossier global', async () => {
    const userData = makeTmp();
    const docs = makeTmp();
    await runBackupAutosave(fakeDb([]), userData, docs);
    const target = path.join(docs, 'BellePoule', AUTOSAVE_FILE_NAME);
    expect(fs.readFileSync(target, 'utf8')).toBe('GLOBAL');
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
  });

  it('utilise le dossier global réglé par l’utilisateur', async () => {
    const userData = makeTmp();
    const global = makeTmp();
    writeBackupSettings(userData, { dir: global });
    await runBackupAutosave(fakeDb([]), userData, makeTmp());
    expect(fs.existsSync(path.join(global, AUTOSAVE_FILE_NAME))).toBe(true);
  });

  it('une compétition avec dossier dédié est copiée seule dans ce dossier', async () => {
    const dedicated = path.join(makeTmp(), 'Challenge');
    const db = fakeDb([
      { id: 'c1', title: 'Challenge: M', settings: { backupDir: dedicated } },
      { id: 'c2', title: 'Sans dossier', settings: {} },
    ]);
    await runBackupAutosave(db, makeTmp(), makeTmp());
    expect(db.exportCompetitionToFile).toHaveBeenCalledTimes(1);
    const file = path.join(dedicated, competitionAutosaveName('Challenge: M', 'c1'));
    expect(fs.readFileSync(file, 'utf8')).toBe('COMP c1');
  });

  it('un dossier dédié invalide (relatif) est ignoré', async () => {
    const db = fakeDb([{ id: 'c1', title: 'X', settings: { backupDir: 'relatif' } }]);
    await runBackupAutosave(db, makeTmp(), makeTmp());
    expect(db.exportCompetitionToFile).not.toHaveBeenCalled();
  });

  it('un échec sur une compétition n’empêche pas les autres', async () => {
    const good = path.join(makeTmp(), 'ok');
    const db = fakeDb([
      { id: 'bad', title: 'B', settings: { backupDir: path.join(makeTmp(), 'x') } },
      { id: 'good', title: 'G', settings: { backupDir: good } },
    ]);
    db.exportCompetitionToFile.mockImplementationOnce(async () => {
      throw new Error('disque plein');
    });
    await expect(runBackupAutosave(db, makeTmp(), makeTmp())).rejects.toThrow(/disque plein/);
    expect(fs.existsSync(path.join(good, competitionAutosaveName('G', 'good')))).toBe(true);
  });
});

describe('competitionAutosaveName', () => {
  it('assainit le titre et ajoute un suffixe d’id', () => {
    expect(competitionAutosaveName('Coupe: 1/2 "Club"', 'abcdef123456')).toBe(
      'Coupe 12 Club-abcdef12-autosave.bpm'
    );
  });
  it('titre vide → « competition »', () => {
    expect(competitionAutosaveName('', 'id')).toBe('competition-id-autosave.bpm');
  });
});
