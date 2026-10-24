/**
 * BellePoule Modern - Settings Modal Component
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { HINT, SECTION_DIVIDER, BOLD, SMALL_BTN, TOGGLE_LABEL } from './settingsModal.styles';
import type { Language } from '../contexts/TranslationContext';
import LanguageSelector from './LanguageSelector';
import { CONFETTI_DISABLED_KEY, isConfettiDisabled } from './Confetti';
// Chargé à la demande : embarque jsPDF, lourd pour le bundle initial
const PdfTemplateModal = React.lazy(() => import('./PdfTemplateModal'));
import { logger, LogCategory } from '@shared/services/logger';
import { isWebhookUrlSafe } from '@shared/services/notificationService';
import {
  UI_SCALES,
  loadUiScale,
  normalizeUiScale,
  saveUiScale,
  type UiScale,
} from '../services/uiScale';

const LOGO_STORAGE_KEY = 'bellepoule-logo';
const WEBHOOK_STORAGE_KEY = 'bellepoule-webhook-url';
const AUDIT_LOG_KEY = 'bellepoule-audit-log-enabled';
const TTS_CONFIG_KEY = 'bellepoule-tts-config';
export const PRINT_PREVIEW_KEY = 'bellepoule-print-preview';
export const QUICK_MOUSE_KEY = 'bellepoule-quick-mouse-scoring';
export const SIMPLIFIED_INPUT_KEY = 'bellepoule-simplified-input-mode';

interface TtsConfig {
  voiceName: string | null;
  rate: number;
  announce: Record<string, boolean>;
}

const DEFAULT_TTS_CONFIG: TtsConfig = {
  voiceName: null,
  rate: 1.1,
  announce: { '60': true, '30': true, '10': true, '5': true, countdown: true, '0': true },
};

// Paliers annoncés par le minuteur vocal — clé de config + libellé affiché
// Paliers annoncés : clé de config → clé de traduction (settings.*)
const TTS_THRESHOLDS: { key: string; label: string }[] = [
  { key: '60', label: 'settings.tts_m60' },
  { key: '30', label: 'settings.tts_m30' },
  { key: '10', label: 'settings.tts_m10' },
  { key: '5', label: 'settings.tts_m5' },
  { key: 'countdown', label: 'settings.tts_countdown' },
  { key: '0', label: 'settings.tts_m0' },
];

function loadTtsConfig(): TtsConfig {
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

const LOGO_MAX_W = 600;
const LOGO_MAX_H = 200;

function resizeLogo(file: File): Promise<string> {
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

interface SettingsModalProps {
  onClose: () => void;
  onSave: (settings: any) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t, language, theme, changeLanguage, changeTheme, pseudoLocale, setPseudoLocale } =
    useTranslation();
  const [showPdfEditor, setShowPdfEditor] = useState(false);
  const [settings, setSettings] = useState({
    language: language,
    theme: theme,
  });
  const [logo, setLogo] = useState<string | null>(() => localStorage.getItem(LOGO_STORAGE_KEY));
  const [isDragging, setIsDragging] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activé par défaut (journal désactivable explicitement, pas activable par défaut négatif)
  const [auditLogEnabled, setAuditLogEnabled] = useState<boolean>(
    () => localStorage.getItem(AUDIT_LOG_KEY) !== 'false'
  );

  const [printPreview, setPrintPreview] = useState<boolean>(
    () => localStorage.getItem(PRINT_PREVIEW_KEY) !== 'false'
  );
  const [quickMouseScoring, setQuickMouseScoring] = useState<boolean>(
    () => localStorage.getItem(QUICK_MOUSE_KEY) === 'true'
  );

  const [simplifiedInputMode, setSimplifiedInputMode] = useState<boolean>(
    () => localStorage.getItem(SIMPLIFIED_INPUT_KEY) === 'true'
  );

  const [uiScale, setUiScale] = useState<UiScale>(() => loadUiScale());
  const [confettiDisabled, setConfettiDisabled] = useState<boolean>(() => isConfettiDisabled());
  const [webhookUrl, setWebhookUrl] = useState<string>(
    () => localStorage.getItem(WEBHOOK_STORAGE_KEY) ?? ''
  );
  const [webhookTestStatus, setWebhookTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [webhookTestMessage, setWebhookTestMessage] = useState<string>('');

  // Paramètres minuteur vocal (TTS) des tablettes d'arbitrage
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>(() => loadTtsConfig());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setSettings(prev => ({ ...prev, language, theme }));
  }, [language, theme]);

  // Sync persisted logo from main process if localStorage is empty
  useEffect(() => {
    if (!logo) {
      const api = (window as any).electronAPI;
      api?.getLogo?.().then((persisted: string | null) => {
        if (persisted) {
          setLogo(persisted);
          localStorage.setItem(LOGO_STORAGE_KEY, persisted);
        }
      });
    }
    const api = (window as any).electronAPI;
    const unsub = api?.onLogoLoaded?.((persisted: string | null) => {
      if (persisted && !localStorage.getItem(LOGO_STORAGE_KEY)) {
        setLogo(persisted);
        localStorage.setItem(LOGO_STORAGE_KEY, persisted);
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Liste des voix disponibles (peut arriver de façon asynchrone)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Pousse la config TTS : persistance locale + serveurs distants actifs
  const persistTtsConfig = useCallback((next: TtsConfig) => {
    setTtsConfig(next);
    localStorage.setItem(TTS_CONFIG_KEY, JSON.stringify(next));
    (window as any).electronAPI?.remote?.setTtsConfig?.(next)?.catch?.(() => {
      /* serveur inactif */
    });
  }, []);

  const handleTtsVoiceChange = (voiceName: string) => {
    persistTtsConfig({ ...ttsConfig, voiceName: voiceName || null });
  };

  const handleTtsRateChange = (rate: number) => {
    persistTtsConfig({ ...ttsConfig, rate });
  };

  const handleTtsThresholdToggle = (key: string, enabled: boolean) => {
    persistTtsConfig({ ...ttsConfig, announce: { ...ttsConfig.announce, [key]: enabled } });
  };

  const handleTtsTestVoice = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance('30 secondes');
    const v = voices.find(x => x.name === ttsConfig.voiceName);
    if (v) {
      utt.voice = v;
      utt.lang = v.lang;
    }
    utt.rate = ttsConfig.rate;
    window.speechSynthesis.speak(utt);
  };

  const handleLanguageChange = (newLanguage: Language) => {
    setSettings(prev => ({ ...prev, language: newLanguage }));
  };

  const handleThemeChange = (newTheme: 'default' | 'light' | 'dark') => {
    setSettings(prev => ({ ...prev, theme: newTheme }));
  };

  const applyLogo = useCallback(async (file: File) => {
    setLogoError(null);
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Image trop grande (max 5 Mo)');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLogoError('Fichier non supporté — choisissez une image');
      return;
    }
    try {
      const base64 = await resizeLogo(file);
      setLogo(base64);
      localStorage.setItem(LOGO_STORAGE_KEY, base64);
      const api = (window as any).electronAPI;
      if (api?.remote?.updateLogo)
        api.remote.updateLogo(base64).catch((err: unknown) => {
          logger.warn(
            LogCategory.NETWORK,
            'Échec mise à jour logo remote',
            err instanceof Error ? err : undefined
          );
        });
    } catch {
      setLogoError("Impossible de lire l'image");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyLogo(file);
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) applyLogo(file);
    },
    [applyLogo]
  );

  const handleRemoveLogo = () => {
    setLogo(null);
    localStorage.removeItem(LOGO_STORAGE_KEY);
    const api = (window as any).electronAPI;
    if (api?.remote?.updateLogo)
      api.remote.updateLogo(null).catch((err: unknown) => {
        logger.warn(
          LogCategory.NETWORK,
          'Échec suppression logo remote',
          err instanceof Error ? err : undefined
        );
      });
  };

  const handleWebhookUrlChange = (url: string) => {
    setWebhookUrl(url);
    setWebhookTestStatus('idle');
    localStorage.setItem(WEBHOOK_STORAGE_KEY, url);
    // Synchronise l'URL vers tous les serveurs distants actifs
    (window as any).electronAPI?.remote?.setWebhookUrl?.(url || null).catch(() => {
      /* serveur inactif */
    });
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) return;
    if (!isWebhookUrlSafe(webhookUrl)) {
      setWebhookTestStatus('error');
      setWebhookTestMessage(t('settings.webhook_invalid'));
      return;
    }
    setWebhookTestStatus('testing');
    setWebhookTestMessage('');
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '✅ BellePoule Modern — test de notification webhook',
          username: 'BellePoule',
        }),
      });
      setWebhookTestStatus('success');
      setWebhookTestMessage(t('settings.webhook_success'));
    } catch {
      setWebhookTestStatus('error');
      setWebhookTestMessage(t('settings.webhook_failed'));
    }
  };

  const handleAuditLogChange = (enabled: boolean) => {
    setAuditLogEnabled(enabled);
    localStorage.setItem(AUDIT_LOG_KEY, String(enabled));
  };

  const handlePrintPreviewChange = (enabled: boolean) => {
    setPrintPreview(enabled);
    localStorage.setItem(PRINT_PREVIEW_KEY, String(enabled));
  };

  const handleQuickMouseScoringChange = (enabled: boolean) => {
    setQuickMouseScoring(enabled);
    localStorage.setItem(QUICK_MOUSE_KEY, String(enabled));
  };

  const handleConfettiDisabledChange = (disabled: boolean) => {
    setConfettiDisabled(disabled);
    localStorage.setItem(CONFETTI_DISABLED_KEY, String(disabled));
  };

  // Taille du texte : appliquée et enregistrée immédiatement (#1156)
  const handleUiScaleChange = (scale: UiScale) => {
    setUiScale(scale);
    saveUiScale(scale);
  };

  const handleSimplifiedInputModeChange = (enabled: boolean) => {
    setSimplifiedInputMode(enabled);
    localStorage.setItem(SIMPLIFIED_INPUT_KEY, String(enabled));
  };

  const handleSave = () => {
    if (settings.language !== language) {
      changeLanguage(settings.language);
    }
    if (settings.theme !== theme) {
      changeTheme(settings.theme);
    }
    onSave(settings);
    onClose();
  };

  return (
    <>
      {/* Clic extérieur sans effet : fermeture via ✕ / Échap (#1033) */}
      <div className="modal-overlay">
        <div
          ref={modalRef}
          className="modal"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '500px' }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-header">
            <h2 className="modal-title">{t('settings.title')}</h2>
            <button className="btn-close" onClick={onClose} aria-label={t('common.close')}>
              &times;
            </button>
          </div>

          <div className="modal-body">
            <div className="form-group">
              <LanguageSelector
                showLabel={true}
                value={settings.language}
                onLanguageChange={handleLanguageChange}
              />
            </div>

            <div className="form-group">
              <label className="u-row">
                <input
                  type="checkbox"
                  checked={pseudoLocale}
                  onChange={e => setPseudoLocale(e.target.checked)}
                />
                {t('settings.pseudo_locale')}
              </label>
              <p style={HINT}>{t('settings.pseudo_locale_hint')}</p>
            </div>

            <div className="form-group">
              <label>{t('settings.theme')}</label>
              <select
                className="form-input form-select"
                value={settings.theme}
                onChange={e => handleThemeChange(e.target.value as 'default' | 'light' | 'dark')}
              >
                <option value="default">{t('settings.theme_default')}</option>
                <option value="light">{t('settings.theme_light')}</option>
                <option value="dark">{t('settings.theme_dark')}</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="settings-ui-scale">{t('settings.text_size')}</label>
              <select
                id="settings-ui-scale"
                className="form-input form-select"
                value={uiScale}
                onChange={e => handleUiScaleChange(normalizeUiScale(e.target.value))}
              >
                {UI_SCALES.map(scale => (
                  <option key={scale} value={scale}>
                    {Math.round(scale * 100)} %
                  </option>
                ))}
              </select>
            </div>

            {/* Logo organisateur */}
            <div className="form-group">
              <label>{t('settings.logo_title')}</label>
              <p style={HINT}>{t('settings.logo_hint')}</p>
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--primary, var(--color-primary))' : 'var(--border, var(--color-border-dark))'}`,
                  borderRadius: '8px',
                  padding: '1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragging ? 'var(--primary-light, #eff6ff)' : 'transparent',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {logo ? (
                  <img
                    src={logo}
                    alt={t('settings.logo_title')}
                    style={{
                      maxHeight: '60px',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      display: 'block',
                      margin: '0 auto 0.5rem',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-muted, var(--color-text-light))',
                    }}
                  >
                    {t('settings.logo_drop')}
                  </span>
                )}
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted, var(--color-text-muted))',
                    display: 'block',
                    marginTop: logo ? '0' : '0.25rem',
                  }}
                >
                  {t('settings.logo_formats')}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {logoError && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--danger, #ef4444)',
                    marginTop: '0.25rem',
                  }}
                >
                  {logoError}
                </p>
              )}
              {logo && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                  onClick={handleRemoveLogo}
                >
                  {t('settings.logo_remove')}
                </button>
              )}
            </div>
            {/* PDF Templates */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.pdf_title')}</label>
              <p style={HINT}>{t('settings.pdf_hint')}</p>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                onClick={() => setShowPdfEditor(true)}
              >
                {t('pdfTemplate.openButton')}
              </button>
            </div>

            {/* Aperçu avant impression (#1214) */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.print_preview_title')}</label>
              <p style={HINT}>{t('settings.print_preview_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={printPreview}
                  onChange={e => handlePrintPreviewChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.print_preview_enable')}</span>
              </label>
            </div>

            {/* Saisie rapide souris */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.quick_mouse_title')}</label>
              <p style={HINT}>{t('settings.quick_mouse_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickMouseScoring}
                  onChange={e => handleQuickMouseScoringChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.quick_mouse_enable')}</span>
              </label>
            </div>

            {/* Mode de saisie simplifiée */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.simplified_title')}</label>
              <p style={HINT}>{t('settings.simplified_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={simplifiedInputMode}
                  onChange={e => handleSimplifiedInputModeChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.simplified_enable')}</span>
              </label>
            </div>

            {/* Journal des scores */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.audit_title')}</label>
              <p style={HINT}>{t('settings.audit_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={auditLogEnabled}
                  onChange={e => handleAuditLogChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.audit_enable')}</span>
              </label>
            </div>

            {/* Animations */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.animations_title')}</label>
              <p style={HINT}>{t('settings.animations_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={confettiDisabled}
                  onChange={e => handleConfettiDisabledChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.animations_disable')}</span>
              </label>
            </div>

            {/* Notifications webhook */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.webhook_title')}</label>
              <p style={HINT}>{t('settings.webhook_hint')}</p>
              <input
                type="url"
                className="form-input mb-2"
                placeholder="https://hooks.slack.com/services/..."
                value={webhookUrl}
                onChange={e => handleWebhookUrlChange(e.target.value)}
              />
              <div className="u-row">
                <button
                  className="btn btn-secondary"
                  style={SMALL_BTN}
                  onClick={handleTestWebhook}
                  disabled={!webhookUrl.trim() || webhookTestStatus === 'testing'}
                >
                  {webhookTestStatus === 'testing' ? '⏳ Test…' : '🔔 Tester'}
                </button>
                {webhookUrl && (
                  <button
                    className="btn btn-secondary"
                    style={SMALL_BTN}
                    onClick={() => handleWebhookUrlChange('')}
                  >
                    {t('settings.webhook_remove')}
                  </button>
                )}
              </div>
              {webhookTestMessage && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    marginTop: '0.35rem',
                    color:
                      webhookTestStatus === 'success'
                        ? 'var(--success, #16a34a)'
                        : 'var(--danger, #ef4444)',
                  }}
                >
                  {webhookTestMessage}
                </p>
              )}
            </div>

            {/* Tableau arbitrage — minuteur vocal (TTS) */}
            <div className="form-group" style={SECTION_DIVIDER}>
              <label style={BOLD}>{t('settings.tts_title')}</label>
              <p style={HINT}>{t('settings.tts_hint')}</p>

              <label style={{ fontSize: '0.85rem' }}>{t('settings.tts_voice')}</label>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <select
                  className="form-input form-select flex-1"
                  value={ttsConfig.voiceName ?? ''}
                  onChange={e => handleTtsVoiceChange(e.target.value)}
                >
                  <option value="">{t('settings.tts_voice_default')}</option>
                  {voices.map(v => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  style={SMALL_BTN}
                  onClick={handleTtsTestVoice}
                >
                  {t('settings.tts_test')}
                </button>
              </div>

              <label style={{ fontSize: '0.85rem' }}>
                {t('settings.tts_rate', { rate: ttsConfig.rate.toFixed(1) })}
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsConfig.rate}
                onChange={e => handleTtsRateChange(parseFloat(e.target.value))}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              />

              <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
                {t('settings.tts_milestones')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {TTS_THRESHOLDS.map(({ key, label }) => (
                  <label key={key} className="u-row cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ttsConfig.announce[key] !== false}
                      onChange={e => handleTtsThresholdToggle(key, e.target.checked)}
                    />
                    <span style={TOGGLE_LABEL}>{t(label)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              {t('actions.cancel')}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {t('settings.save')}
            </button>
          </div>
        </div>
      </div>
      {showPdfEditor && (
        <React.Suspense fallback={null}>
          <PdfTemplateModal onClose={() => setShowPdfEditor(false)} />
        </React.Suspense>
      )}
    </>
  );
};

export default React.memo(SettingsModal);
