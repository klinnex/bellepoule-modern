/**
 * BellePoule Modern - Constantes, types et helpers de SettingsModal (extrait, #1599)
 * Licensed under GPL-3.0
 */
import {
  Bell,
  FileText,
  Palette,
  PenLine,
  Settings as SettingsIcon,
  Volume2,
  type LucideIcon,
} from 'lucide-react';

// Organisation des paramètres : sections (onglets) → réglages.
// `keys` = clés de traduction parcourues par la recherche.
export type SettingsSectionId =
  'display' | 'scoring' | 'documents' | 'referee' | 'notifications' | 'system';

export type SettingsItemId =
  | 'language'
  | 'pseudo'
  | 'theme'
  | 'text_size'
  | 'density'
  | 'animations'
  | 'quick_mouse'
  | 'simplified'
  | 'audit'
  | 'logo'
  | 'pdf'
  | 'tts'
  | 'webhook'
  | 'updates'
  | 'proxy'
  | 'backup'
  | 'tour';

export interface SettingsSectionDef {
  id: SettingsSectionId;
  icon: LucideIcon;
  labelKey: string;
  items: { id: SettingsItemId; keys: string[] }[];
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: 'display',
    icon: Palette,
    labelKey: 'settings.section_display',
    items: [
      { id: 'language', keys: ['settings.language'] },
      { id: 'theme', keys: ['settings.theme'] },
      { id: 'text_size', keys: ['settings.text_size'] },
      { id: 'density', keys: ['settings.density'] },
      { id: 'animations', keys: ['settings.animations_title', 'settings.animations_hint'] },
      { id: 'pseudo', keys: ['settings.pseudo_locale', 'settings.pseudo_locale_hint'] },
    ],
  },
  {
    id: 'scoring',
    icon: PenLine,
    labelKey: 'settings.section_scoring',
    items: [
      { id: 'quick_mouse', keys: ['settings.quick_mouse_title', 'settings.quick_mouse_hint'] },
      { id: 'simplified', keys: ['settings.simplified_title', 'settings.simplified_hint'] },
      { id: 'audit', keys: ['settings.audit_title', 'settings.audit_hint'] },
    ],
  },
  {
    id: 'documents',
    icon: FileText,
    labelKey: 'settings.section_documents',
    items: [
      { id: 'logo', keys: ['settings.logo_title', 'settings.logo_hint'] },
      { id: 'pdf', keys: ['settings.pdf_title', 'settings.pdf_hint'] },
    ],
  },
  {
    id: 'referee',
    icon: Volume2,
    labelKey: 'settings.section_referee',
    items: [
      {
        id: 'tts',
        keys: [
          'settings.tts_title',
          'settings.tts_hint',
          'settings.tts_voice',
          'settings.tts_milestones',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    icon: Bell,
    labelKey: 'settings.section_notifications',
    items: [{ id: 'webhook', keys: ['settings.webhook_title', 'settings.webhook_hint'] }],
  },
  {
    id: 'system',
    icon: SettingsIcon,
    labelKey: 'settings.section_system',
    items: [
      {
        id: 'updates',
        keys: ['settings.updates_title', 'settings.updates_hint', 'settings.updates_channel'],
      },
      { id: 'proxy', keys: ['settings.proxy_title', 'settings.proxy_hint'] },
      { id: 'backup', keys: ['settings.backup_title', 'settings.backup_hint'] },
      { id: 'tour', keys: ['settings.tour_title', 'settings.tour_hint'] },
    ],
  },
];

export const SECTION_STORAGE_KEY = 'bellepoule-settings-section';

export function loadActiveSection(): SettingsSectionId {
  try {
    const saved = localStorage.getItem(SECTION_STORAGE_KEY);
    if (saved && SETTINGS_SECTIONS.some(s => s.id === saved)) return saved as SettingsSectionId;
  } catch {
    /* stockage indisponible */
  }
  return 'display';
}

/** Mémorise l'onglet à ouvrir (palette de commandes → paramètre, #1651) */
export function saveActiveSection(id: SettingsSectionId): void {
  try {
    localStorage.setItem(SECTION_STORAGE_KEY, id);
  } catch {
    /* stockage indisponible */
  }
}

// Minuscules sans accents : « theme » trouve « Thème »
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function loadTtsConfig(): TtsConfig {
  try {
    const raw = localStorage.getItem(TTS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TTS_CONFIG,
        ...parsed,
        announce: { ...DEFAULT_TTS_CONFIG.announce, ...(parsed.announce ?? {}) },
      };
    }
  } catch {
    /* config corrompue → défaut */
  }
  return { ...DEFAULT_TTS_CONFIG, announce: { ...DEFAULT_TTS_CONFIG.announce } };
}

export const LOGO_MAX_W = 600;

export const LOGO_MAX_H = 200;

export function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > LOGO_MAX_W || h > LOGO_MAX_H) {
          const ratio = Math.min(LOGO_MAX_W / w, LOGO_MAX_H / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const WEBHOOK_STORAGE_KEY = 'bellepoule-webhook-url';

export const AUDIT_LOG_KEY = 'bellepoule-audit-log-enabled';

export const TTS_CONFIG_KEY = 'bellepoule-tts-config';

export const QUICK_MOUSE_KEY = 'bellepoule-quick-mouse-scoring';

export const SIMPLIFIED_INPUT_KEY = 'bellepoule-simplified-input-mode';

export interface TtsConfig {
  voiceName: string | null;
  rate: number;
  announce: Record<string, boolean>;
}

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  voiceName: null,
  rate: 1.1,
  announce: { '60': true, '30': true, '10': true, '5': true, countdown: true, '0': true },
};

// Paliers annoncés par le minuteur vocal — clé de config + libellé affiché
// Paliers annoncés : clé de config → clé de traduction (settings.*)
export const TTS_THRESHOLDS: { key: string; label: string }[] = [
  { key: '60', label: 'settings.tts_m60' },
  { key: '30', label: 'settings.tts_m30' },
  { key: '10', label: 'settings.tts_m10' },
  { key: '5', label: 'settings.tts_m5' },
  { key: 'countdown', label: 'settings.tts_countdown' },
  { key: '0', label: 'settings.tts_m0' },
];

export interface SettingsModalProps {
  onClose: () => void;
  onSave: (settings: any) => void;
}
