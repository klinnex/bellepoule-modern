/**
 * Handlers IPC `privacy:*` (RGPD, #1882) : conservation, validation des entrées.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Handler = (...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  dialog: { showSaveDialog: vi.fn(async () => ({ canceled: true })) },
  ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) },
}));

import { applyRetention, createPrivacyHandlers } from './privacyHandlers';
import { getNameMasking, setNameMasking } from '../remote/publicDto';
import { DEFAULT_PRIVACY_SETTINGS } from '../../shared/types/privacy';
import type { DatabaseManager } from '../../database';

function fakeDb() {
  const privacy = {
    listRetentionCandidates: vi.fn(() => ({
      competitions: [{ id: 'c1', title: 'A', date: '2019-01-01', fencerCount: 3 }],
      members: [{ id: 'm1', lastName: 'X', firstName: 'Y', clubName: '', lastActivity: '' }],
    })),
    purgeCompetition: vi.fn(),
    anonymizeCompetition: vi.fn(),
    eraseMembersById: vi.fn(),
    anonymizeMembersById: vi.fn(),
    findPersons: vi.fn(() => []),
    anonymizePerson: vi.fn(() => ({ fencers: 0, members: 0, pseudonym: 'P' })),
    erasePerson: vi.fn(() => ({ fencers: 1, members: 0 })),
    competitionIdsOf: vi.fn(() => ['c-open']),
  };
  const compactAfterErasure = vi.fn();
  return {
    privacy,
    compactAfterErasure,
    db: { privacy, isOpen: () => true, compactAfterErasure } as unknown as DatabaseManager,
  };
}

describe('applyRetention', () => {
  it('anonymise par défaut, supprime sur demande', () => {
    const { privacy, db } = fakeDb();
    const s = {
      ...DEFAULT_PRIVACY_SETTINGS,
      competitionRetentionMonths: 12,
      memberRetentionMonths: 12,
    };
    expect(applyRetention(db, s)).toEqual({ competitions: 1, members: 1 });
    expect(privacy.anonymizeCompetition).toHaveBeenCalledWith('c1');
    expect(privacy.anonymizeMembersById).toHaveBeenCalledWith(['m1']);
    applyRetention(db, { ...s, retentionAction: 'delete' });
    expect(privacy.purgeCompetition).toHaveBeenCalledWith('c1', false);
    expect(privacy.eraseMembersById).toHaveBeenCalledWith(['m1']);
  });

  it('restreint à la sélection', () => {
    const { privacy, db } = fakeDb();
    const r = applyRetention(db, DEFAULT_PRIVACY_SETTINGS, {
      competitionIds: [],
      memberIds: ['m1'],
    });
    expect(r).toEqual({ competitions: 0, members: 1 });
    expect(privacy.anonymizeCompetition).not.toHaveBeenCalled();
  });

  it('ignore une compétition ouverte, compacte la base après purge (#1882)', () => {
    const { privacy, db, compactAfterErasure } = fakeDb();
    const r = applyRetention(
      db,
      DEFAULT_PRIVACY_SETTINGS,
      undefined,
      new Date(),
      id => id === 'c1'
    );
    expect(r).toEqual({ competitions: 0, members: 1 });
    expect(privacy.anonymizeCompetition).not.toHaveBeenCalled();
    expect(compactAfterErasure).toHaveBeenCalled();
  });
});

describe('handlers privacy:*', () => {
  let dir: string;
  let privacy: ReturnType<typeof fakeDb>['privacy'];

  beforeEach(() => {
    handlers.clear();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-ipc-'));
    const f = fakeDb();
    privacy = f.privacy;
    createPrivacyHandlers({
      db: f.db,
      getMainWindow: () => null,
      userDataDir: () => dir,
    }).register();
  });

  it('enregistre et applique les réglages (noms abrégés à chaud)', async () => {
    const res = (await handlers.get('privacy:setSettings')!({}, { nameMasking: 'initial' })) as {
      success: boolean;
    };
    expect(res.success).toBe(true);
    expect(getNameMasking()).toBe('initial');
    expect(await handlers.get('privacy:getSettings')!({})).toMatchObject({
      nameMasking: 'initial',
    });
    expect(await handlers.get('privacy:setSettings')!({}, null)).toEqual({
      success: false,
      error: 'invalid_settings',
    });
    setNameMasking('full');
  });

  it('filtre les entrées non fiables', async () => {
    expect(await handlers.get('privacy:findPersons')!({}, 42)).toEqual([]);
    await handlers.get('privacy:anonymizePerson')!(
      {},
      { fencerIds: ['a', 3, null], memberIds: 'x' }
    );
    expect(privacy.anonymizePerson).toHaveBeenCalledWith({ fencerIds: ['a'], memberIds: [] });
  });

  it('compétition ouverte : anonymisation et effacement refusés (#1882)', async () => {
    handlers.clear();
    const f = fakeDb();
    createPrivacyHandlers({
      db: f.db,
      getMainWindow: () => null,
      userDataDir: () => dir,
      isCompetitionBusy: id => id === 'c-open',
    }).register();
    const ref = { fencerIds: ['a'], memberIds: [] };
    await expect(handlers.get('privacy:anonymizePerson')!({}, ref)).rejects.toThrow(
      'competition_open'
    );
    await expect(handlers.get('privacy:erasePerson')!({}, ref)).rejects.toThrow('competition_open');
    expect(f.privacy.anonymizePerson).not.toHaveBeenCalled();
    expect(f.privacy.erasePerson).not.toHaveBeenCalled();
  });

  it('effacement : base compactée ensuite (#1882)', async () => {
    handlers.clear();
    const f = fakeDb();
    createPrivacyHandlers({
      db: f.db,
      getMainWindow: () => null,
      userDataDir: () => dir,
    }).register();
    await handlers.get('privacy:erasePerson')!({}, { fencerIds: ['a'] });
    expect(f.privacy.erasePerson).toHaveBeenCalled();
    expect(f.compactAfterErasure).toHaveBeenCalled();
  });

  it('archive chiffrée : mot de passe trop court, aucun fichier en attente', async () => {
    expect(await handlers.get('privacy:exportEncryptedBpm')!({}, null, 'court')).toEqual({
      success: false,
      error: 'password_too_short',
    });
    expect(await handlers.get('privacy:openEncryptedBpm')!({}, 'motdepasse')).toEqual({
      success: false,
      error: 'no_pending_file',
    });
  });
});
