/**
 * BellePoule Modern - Commandes « / » de la palette (Ctrl+K)
 * Registre, analyse et exécution. Doc : docs/COMMANDES.md
 * Licensed under GPL-3.0
 */

import type { Competition } from '../../shared/types';
import type { Language, Theme } from '../contexts/TranslationContext';
import { SHOW_UPDATE_EVENT } from '../components/UpdateMenuButton';

/** Événement fenêtre écouté par RemoteScoreManager (detail : RemoteCommandAction). */
export const REMOTE_COMMAND_EVENT = 'bp:remote-command';
/** Événement fenêtre écouté par KeyboardShortcutsHelp pour s'ouvrir. */
export const SHOW_SHORTCUTS_EVENT = 'bp:show-shortcuts';

export type RemoteCommandAction = 'start' | 'stop';

export interface SlashCommandDef {
  /** Gabarit affiché, ex. « /update quiet » ou « /theme <light|dark|default> » */
  usage: string;
  /** Clé i18n de la description */
  descriptionKey: string;
  icon: string;
  /** Nécessite une compétition ouverte */
  needsCompetition?: boolean;
}

export const PHASES = [
  'checkin',
  'poolprep',
  'pools',
  'quest',
  'ranking',
  'tableau',
  'results',
  'remote',
  'logs',
  'referees',
] as const;

const THEMES: readonly Theme[] = ['light', 'dark', 'default'];
const LANGUAGES: readonly Language[] = [
  'fr',
  'en',
  'br',
  'ca',
  'de',
  'es',
  'pt',
  'it',
  'ru',
  'zh-HK',
];

export const SLASH_COMMANDS: readonly SlashCommandDef[] = [
  { usage: '/help', descriptionKey: 'slashCommands.help', icon: '❓' },
  { usage: '/update', descriptionKey: 'slashCommands.update', icon: '🔄' },
  { usage: '/update quiet', descriptionKey: 'slashCommands.update_quiet', icon: '🔕' },
  { usage: '/update quiet off', descriptionKey: 'slashCommands.update_quiet_off', icon: '🔔' },
  { usage: '/update install', descriptionKey: 'slashCommands.update_install', icon: '⬇️' },
  {
    usage: '/update channel <stable|dev>',
    descriptionKey: 'slashCommands.update_channel',
    icon: '🧪',
  },
  { usage: '/update auto <on|off>', descriptionKey: 'slashCommands.update_auto', icon: '⏱️' },
  {
    usage: '/remote start',
    descriptionKey: 'slashCommands.remote_start',
    icon: '📡',
    needsCompetition: true,
  },
  {
    usage: '/remote stop',
    descriptionKey: 'slashCommands.remote_stop',
    icon: '⏹️',
    needsCompetition: true,
  },
  {
    usage: '/remote status',
    descriptionKey: 'slashCommands.remote_status',
    icon: 'ℹ️',
    needsCompetition: true,
  },
  {
    usage: '/remote url',
    descriptionKey: 'slashCommands.remote_url',
    icon: '🔗',
    needsCompetition: true,
  },
  {
    usage: '/phase <name>',
    descriptionKey: 'slashCommands.phase',
    icon: '🧭',
    needsCompetition: true,
  },
  { usage: '/open <name>', descriptionKey: 'slashCommands.open', icon: '🏆' },
  { usage: '/new', descriptionKey: 'slashCommands.new', icon: '➕' },
  { usage: '/training', descriptionKey: 'slashCommands.training', icon: '⚔️' },
  { usage: '/wifi', descriptionKey: 'slashCommands.wifi', icon: '📶' },
  { usage: '/theme <light|dark|default>', descriptionKey: 'slashCommands.theme', icon: '🎨' },
  { usage: '/lang <code>', descriptionKey: 'slashCommands.lang', icon: '🌐' },
  { usage: '/settings', descriptionKey: 'slashCommands.settings', icon: '⚙️' },
  { usage: '/wiki', descriptionKey: 'slashCommands.wiki', icon: '📖' },
  { usage: '/shortcuts', descriptionKey: 'slashCommands.shortcuts', icon: '⌨️' },
  { usage: '/report', descriptionKey: 'slashCommands.report', icon: '🐞' },
  { usage: '/about', descriptionKey: 'slashCommands.about', icon: 'ℹ️' },
];

/** Partie fixe du gabarit (avant le premier argument « <…> »). */
export const usageBase = (usage: string): string => usage.split(' <')[0];
/** Le gabarit attend-il un argument libre ? */
export const usageHasArg = (usage: string): boolean => usage.includes(' <');

const normalize = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Suggestions pour la saisie courante (commence par « / »). */
export function matchSlashCommands(input: string): SlashCommandDef[] {
  const q = normalize(input);
  const words = q.split(' ');
  return SLASH_COMMANDS.filter(def => {
    const base = usageBase(def.usage);
    // « /upd » → préfixe ; « /theme dark » → la base est déjà saisie
    if (base.startsWith(q)) return true;
    if (!usageHasArg(def.usage)) return false;
    return q.startsWith(`${base} `) && base.split(' ').length < words.length;
  });
}

/**
 * Texte à exécuter quand on valide une suggestion :
 * la saisie si elle complète le gabarit (arguments), sinon le gabarit sans argument.
 * Retourne null si un argument manque → compléter la saisie.
 */
export function resolveSelection(input: string, def: SlashCommandDef): string | null {
  const q = normalize(input);
  const base = usageBase(def.usage);
  if (!usageHasArg(def.usage)) return base;
  return q.startsWith(`${base} `) && q.length > base.length + 1 ? input.trim() : null;
}

export interface ParsedCommand {
  name: string;
  args: string[];
}

export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/') || trimmed.length < 2) return null;
  const [name, ...args] = trimmed.slice(1).split(/\s+/);
  return { name: name.toLowerCase(), args };
}

/** Actions de l'application mobilisables par les commandes (fournies par App). */
export interface SlashCommandContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  competitions: Competition[];
  activeCompetitionId: string | null;
  openCompetition: (id: string) => void;
  goToPhase: (phase: string) => void;
  newCompetition: () => void;
  openSettings: () => void;
  openTraining: () => void;
  openWifi: () => void;
  openWiki: () => void;
  openAbout: () => void;
  openReport: () => void;
  openHelp: () => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
}

export interface SlashCommandResult {
  ok: boolean;
  message?: string;
}

const onOff = (arg: string | undefined): boolean | null =>
  arg === 'on' ? true : arg === 'off' ? false : null;

async function runUpdate(args: string[], ctx: SlashCommandContext): Promise<SlashCommandResult> {
  const { t } = ctx;
  const updater = window.electronAPI?.updater;
  if (!updater) return { ok: false, message: t('slashCommands.unavailable') };
  const [sub, value] = args.map(a => a.toLowerCase());
  if (!sub) {
    const info = await updater.check();
    if (info?.hasUpdate) {
      window.dispatchEvent(new CustomEvent(SHOW_UPDATE_EVENT, { detail: info }));
      return {
        ok: true,
        message: t('slashCommands.update_available', { version: info.latestVersion }),
      };
    }
    return { ok: true, message: t('slashCommands.update_none') };
  }
  if (sub === 'quiet') {
    const enabled = value !== 'off';
    await updater.setSilentMode(enabled);
    return {
      ok: true,
      message: t(
        enabled ? 'slashCommands.update_quiet_done' : 'slashCommands.update_quiet_off_done'
      ),
    };
  }
  if (sub === 'install') {
    const res = await updater.downloadAndInstall();
    return res.success
      ? { ok: true, message: t('slashCommands.update_install_done') }
      : { ok: false, message: res.error ?? t('slashCommands.failed') };
  }
  if (sub === 'channel' && (value === 'stable' || value === 'dev')) {
    const res = await updater.setChannel(value);
    return res.success
      ? { ok: true, message: t('slashCommands.update_channel_done', { channel: value }) }
      : { ok: false, message: res.error ?? t('slashCommands.failed') };
  }
  const auto = onOff(value);
  if (sub === 'auto' && auto !== null) {
    const res = await updater.setAutoCheck(auto);
    return res.success
      ? { ok: true, message: t(auto ? 'slashCommands.enabled' : 'slashCommands.disabled') }
      : { ok: false, message: res.error ?? t('slashCommands.failed') };
  }
  return { ok: false, message: t('slashCommands.bad_args', { usage: '/update' }) };
}

async function runRemote(args: string[], ctx: SlashCommandContext): Promise<SlashCommandResult> {
  const { t, activeCompetitionId: id } = ctx;
  const remote = window.electronAPI?.remote;
  if (!remote) return { ok: false, message: t('slashCommands.unavailable') };
  if (!id) return { ok: false, message: t('slashCommands.no_competition') };
  const sub = args[0]?.toLowerCase();
  if (sub === 'start' || sub === 'stop') {
    if (sub === 'start') ctx.goToPhase('remote');
    const action: RemoteCommandAction = sub;
    // Laisser CompetitionView monter le panneau avant de déclencher l'action
    setTimeout(
      () => window.dispatchEvent(new CustomEvent(REMOTE_COMMAND_EVENT, { detail: action })),
      0
    );
    return { ok: true, message: t(`slashCommands.remote_${sub}_done`) };
  }
  if (sub === 'status' || sub === 'url') {
    const res = await remote.getServerInfo(id);
    const url = res.success ? res.serverInfo?.url : undefined;
    if (!url) return { ok: true, message: t('slashCommands.remote_off') };
    if (sub === 'url') {
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      return { ok: true, message: t('slashCommands.remote_url_done', { url }) };
    }
    return { ok: true, message: t('slashCommands.remote_on', { url }) };
  }
  return { ok: false, message: t('slashCommands.bad_args', { usage: '/remote' }) };
}

/** Exécute une commande « / ». Ne lève jamais : les erreurs sont renvoyées en message. */
export async function executeSlashCommand(
  input: string,
  ctx: SlashCommandContext
): Promise<SlashCommandResult> {
  const { t } = ctx;
  const parsed = parseSlashCommand(input);
  if (!parsed) return { ok: false, message: t('slashCommands.unknown', { name: input.trim() }) };
  const { name, args } = parsed;
  const arg = args.join(' ');
  try {
    switch (name) {
      case 'help':
      case 'shortcuts':
        ctx.openHelp();
        return { ok: true };
      case 'update':
        return await runUpdate(args, ctx);
      case 'remote':
        return await runRemote(args, ctx);
      case 'phase': {
        if (!ctx.activeCompetitionId)
          return { ok: false, message: t('slashCommands.no_competition') };
        const phase = PHASES.find(p => p === arg.toLowerCase());
        if (!phase)
          return {
            ok: false,
            message: t('slashCommands.bad_args', { usage: `/phase <${PHASES.join('|')}>` }),
          };
        ctx.goToPhase(phase);
        return { ok: true };
      }
      case 'open': {
        const q = arg.toLowerCase();
        const comp = q ? ctx.competitions.find(c => c.title.toLowerCase().includes(q)) : undefined;
        if (!comp) return { ok: false, message: t('slashCommands.not_found', { name: arg }) };
        ctx.openCompetition(comp.id);
        return { ok: true };
      }
      case 'new':
        ctx.newCompetition();
        return { ok: true };
      case 'training':
        ctx.openTraining();
        return { ok: true };
      case 'wifi':
        ctx.openWifi();
        return { ok: true };
      case 'theme': {
        const theme = THEMES.find(th => th === arg.toLowerCase());
        if (!theme)
          return {
            ok: false,
            message: t('slashCommands.bad_args', { usage: '/theme <light|dark|default>' }),
          };
        ctx.setTheme(theme);
        return { ok: true };
      }
      case 'lang': {
        const lang = LANGUAGES.find(l => l.toLowerCase() === arg.toLowerCase());
        if (!lang)
          return {
            ok: false,
            message: t('slashCommands.bad_args', { usage: `/lang <${LANGUAGES.join('|')}>` }),
          };
        ctx.setLanguage(lang);
        return { ok: true };
      }
      case 'settings':
        ctx.openSettings();
        return { ok: true };
      case 'wiki':
        ctx.openWiki();
        return { ok: true };
      case 'report':
        ctx.openReport();
        return { ok: true };
      case 'about':
        ctx.openAbout();
        return { ok: true };
      default:
        return { ok: false, message: t('slashCommands.unknown', { name: `/${name}` }) };
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : t('slashCommands.failed'),
    };
  }
}
