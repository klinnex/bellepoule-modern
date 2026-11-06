// @vitest-environment jsdom
/**
 * Tests unitaires - commandes « / » de la palette (Ctrl+K)
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeSlashCommand,
  matchSlashCommands,
  parseSlashCommand,
  resolveSelection,
  REMOTE_COMMAND_EVENT,
  SLASH_COMMANDS,
  type SlashCommandContext,
} from './slashCommands';
import type { Competition } from '../../shared/types';

const t = (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k);

const makeCtx = (over: Partial<SlashCommandContext> = {}): SlashCommandContext => ({
  t,
  competitions: [{ id: 'c1', title: 'Coupe Alpha' } as unknown as Competition],
  activeCompetitionId: 'c1',
  openCompetition: vi.fn(),
  goToPhase: vi.fn(),
  newCompetition: vi.fn(),
  openSettings: vi.fn(),
  openTraining: vi.fn(),
  openWifi: vi.fn(),
  openWiki: vi.fn(),
  openAbout: vi.fn(),
  openReport: vi.fn(),
  openHelp: vi.fn(),
  setTheme: vi.fn(),
  setLanguage: vi.fn(),
  ...over,
});

const def = (usage: string) => SLASH_COMMANDS.find(c => c.usage === usage)!;

describe('slashCommands – analyse', () => {
  it('parse le nom et les arguments', () => {
    expect(parseSlashCommand('/Update  quiet off')).toEqual({
      name: 'update',
      args: ['quiet', 'off'],
    });
    expect(parseSlashCommand('update')).toBeNull();
    expect(parseSlashCommand('/')).toBeNull();
  });

  it('suggère par préfixe', () => {
    const usages = matchSlashCommands('/upd').map(c => c.usage);
    expect(usages).toContain('/update');
    expect(usages).toContain('/update quiet');
    expect(matchSlashCommands('/remote st').map(c => c.usage)).toEqual([
      '/remote start',
      '/remote stop',
      '/remote status',
    ]);
  });

  it('garde la suggestion quand l’argument est saisi', () => {
    expect(matchSlashCommands('/theme dark').map(c => c.usage)).toEqual([
      '/theme <light|dark|default>',
    ]);
  });

  it('résout la sélection : gabarit, saisie ou complétion', () => {
    expect(resolveSelection('/upd', def('/update quiet'))).toBe('/update quiet');
    expect(resolveSelection('/theme dark', def('/theme <light|dark|default>'))).toBe('/theme dark');
    expect(resolveSelection('/the', def('/theme <light|dark|default>'))).toBeNull();
  });

  it('toutes les commandes ont une description i18n', () => {
    for (const c of SLASH_COMMANDS) expect(c.descriptionKey).toMatch(/^slashCommands\./);
  });
});

describe('slashCommands – exécution', () => {
  const updater = {
    check: vi.fn(),
    setSilentMode: vi.fn().mockResolvedValue({ success: true, silent: true }),
    downloadAndInstall: vi.fn().mockResolvedValue({ success: true }),
    setChannel: vi.fn().mockResolvedValue({ success: true, channel: 'dev' }),
    setAutoCheck: vi.fn().mockResolvedValue({ success: true, enabled: false }),
  };
  const remote = { getServerInfo: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { electronAPI: unknown }).electronAPI = { updater, remote };
  });
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('/update quiet active le mode silencieux, /update quiet off le coupe', async () => {
    await executeSlashCommand('/update quiet', makeCtx());
    expect(updater.setSilentMode).toHaveBeenCalledWith(true);
    await executeSlashCommand('/update quiet off', makeCtx());
    expect(updater.setSilentMode).toHaveBeenCalledWith(false);
  });

  it('/update vérifie et signale une version disponible', async () => {
    updater.check.mockResolvedValue({ hasUpdate: true, latestVersion: '9.9.9' });
    const listener = vi.fn();
    window.addEventListener('bp:show-update', listener);
    const res = await executeSlashCommand('/update', makeCtx());
    window.removeEventListener('bp:show-update', listener);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('9.9.9');
    expect(listener).toHaveBeenCalled();
  });

  it('/update channel et /update auto', async () => {
    await executeSlashCommand('/update channel dev', makeCtx());
    expect(updater.setChannel).toHaveBeenCalledWith('dev');
    await executeSlashCommand('/update auto off', makeCtx());
    expect(updater.setAutoCheck).toHaveBeenCalledWith(false);
    const bad = await executeSlashCommand('/update channel beta', makeCtx());
    expect(bad.ok).toBe(false);
  });

  it('/remote start ouvre la phase et émet l’événement', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    window.addEventListener(REMOTE_COMMAND_EVENT, listener);
    const ctx = makeCtx();
    const res = await executeSlashCommand('/remote start', ctx);
    vi.runAllTimers();
    window.removeEventListener(REMOTE_COMMAND_EVENT, listener);
    vi.useRealTimers();
    expect(res.ok).toBe(true);
    expect(ctx.goToPhase).toHaveBeenCalledWith('remote');
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe('start');
  });

  it('/remote exige une compétition ouverte', async () => {
    const res = await executeSlashCommand('/remote stop', makeCtx({ activeCompetitionId: null }));
    expect(res).toEqual({ ok: false, message: 'slashCommands.no_competition' });
  });

  it('/remote status donne l’URL', async () => {
    remote.getServerInfo.mockResolvedValue({
      success: true,
      serverInfo: { url: 'https://1.2.3.4:8066' },
    });
    const res = await executeSlashCommand('/remote status', makeCtx());
    expect(res.message).toContain('https://1.2.3.4:8066');
  });

  it('/phase, /open, /theme, /lang', async () => {
    const ctx = makeCtx();
    await executeSlashCommand('/phase tableau', ctx);
    expect(ctx.goToPhase).toHaveBeenCalledWith('tableau');
    await executeSlashCommand('/open alpha', ctx);
    expect(ctx.openCompetition).toHaveBeenCalledWith('c1');
    await executeSlashCommand('/theme dark', ctx);
    expect(ctx.setTheme).toHaveBeenCalledWith('dark');
    await executeSlashCommand('/lang zh-hk', ctx);
    expect(ctx.setLanguage).toHaveBeenCalledWith('zh-HK');
    expect((await executeSlashCommand('/phase nope', ctx)).ok).toBe(false);
  });

  it('commande inconnue → erreur', async () => {
    const res = await executeSlashCommand('/foo', makeCtx());
    expect(res.ok).toBe(false);
    expect(res.message).toContain('/foo');
  });

  it('une exception devient un message d’erreur', async () => {
    updater.check.mockRejectedValue(new Error('réseau'));
    const res = await executeSlashCommand('/update', makeCtx());
    expect(res).toEqual({ ok: false, message: 'réseau' });
  });
});
