/**
 * BellePoule Modern - Settings Modal Component
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { HINT, BOLD, SMALL_BTN, TOGGLE_LABEL } from './settingsModal.styles';
import type { Language } from '../contexts/TranslationContext';
import LanguageSelector from './LanguageSelector';
import ProxySettingsSection from './ProxySettingsSection';
import { CONFETTI_DISABLED_KEY, isConfettiDisabled } from './Confetti';
import { Bell, Hourglass } from 'lucide-react';
// Chargé à la demande : embarque jsPDF, lourd pour le bundle initial
const PdfTemplateModal = React.lazy(() => import('./PdfTemplateModal'));
import { logger, LogCategory } from '@shared/services/logger';
import { isWebhookUrlSafe } from '@shared/services/notificationService';
import { restartGuidedTour } from './guidedTourFlags';
import {
  UI_SCALES,
  loadUiScale,
  normalizeUiScale,
  saveUiScale,
  type UiScale,
} from '../services/uiScale';
import {
  UI_DENSITIES,
  loadUiDensity,
  normalizeUiDensity,
  saveUiDensity,
  type UiDensity,
} from '../services/uiDensity';
import {
  LOGO_STORAGE_KEY,
  LOGO_LIBRARY_MAX,
  type LogoEntry,
  loadLogoLibrary,
  saveLogoLibraryLocal,
  ensureActiveInLibrary,
  addLogo,
  renameLogo,
  removeLogo,
  newLogoId,
  logoNameFromFile,
} from '../services/logoLibrary';
import {
  buildSettingsExport,
  parseSettingsImport,
  applySettingsValues,
  settingsExportFileName,
} from '../services/settingsTransfer';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import {
  SettingsSectionId,
  SettingsItemId,
  SETTINGS_SECTIONS,
  SECTION_STORAGE_KEY,
  loadActiveSection,
  normalizeSearch,
  loadTtsConfig,
  resizeLogo,
  WEBHOOK_STORAGE_KEY,
  AUDIT_LOG_KEY,
  QUICK_MOUSE_KEY,
  SIMPLIFIED_INPUT_KEY,
  TTS_THRESHOLDS,
  type SettingsModalProps,
} from './settingsModal.helpers';
import { useSettingsPreferences } from '../hooks/settingsModal/useSettingsPreferences';

const SettingsModal: React.FC<SettingsModalProps> = (props: SettingsModalProps) => {
  const settingsPreferences = useSettingsPreferences({ ...props });
  const {
    modalRef,
    t,
    onClose,
    showPdfEditor,
    setShowPdfEditor,
    setLogo,
    setLogos,
    setLogoError,
    logos,
    setIsDragging,
    logo,
    setWebhookUrl,
    setWebhookTestStatus,
    webhookUrl,
    setWebhookTestMessage,
    setAuditLogEnabled,
    setQuickMouseScoring,
    setConfettiDisabled,
    setSplashEnabledState,
    setUpdateAutoCheck,
    setUpdateDir,
    updateChannel,
    setUpdateChannel,
    setUiScale,
    setUiDensity,
    setSimplifiedInputMode,
    persistTtsConfig,
    changeLanguage,
    changeTheme,
    setSettings,
    settings,
    language,
    theme,
    onSave,
    handleLanguageChange,
    pseudoLocale,
    setPseudoLocale,
    handleThemeChange,
    uiScale,
    uiDensity,
    fileInputRef,
    isDragging,
    logoError,
    quickMouseScoring,
    simplifiedInputMode,
    auditLogEnabled,
    confettiDisabled,
    splashEnabled,
    updateAutoCheck,
    updateDir,
    webhookTestStatus,
    webhookTestMessage,
    ttsConfig,
    handleTtsVoiceChange,
    voices,
    handleTtsTestVoice,
    handleTtsRateChange,
    handleTtsThresholdToggle,
  } = { ...props, ...settingsPreferences };

  // Logo actif : localStorage (PDF/kiosque) + logo.dat + serveurs distants
  const setActiveLogo = useCallback((data: string | null) => {
    setLogo(data);
    if (data) localStorage.setItem(LOGO_STORAGE_KEY, data);
    else localStorage.removeItem(LOGO_STORAGE_KEY);
    const api = (window as any).electronAPI;
    if (api?.remote?.updateLogo)
      api.remote.updateLogo(data).catch((err: unknown) => {
        logger.warn(
          LogCategory.NETWORK,
          'Échec mise à jour logo remote',
          err instanceof Error ? err : undefined
        );
      });
  }, []);

  const persistLogos = useCallback((next: LogoEntry[]) => {
    setLogos(next);
    saveLogoLibraryLocal(next);
    (window as any).electronAPI?.saveLogos?.(next)?.catch?.(() => {
      /* persistance disque indisponible */
    });
  }, []);

  const applyLogo = useCallback(
    async (file: File) => {
      setLogoError(null);
      if (logos.length >= LOGO_LIBRARY_MAX) {
        setLogoError(t('settings.logo_limit', { max: LOGO_LIBRARY_MAX }));
        return;
      }
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
        persistLogos(
          addLogo(logos, { id: newLogoId(), name: logoNameFromFile(file.name), data: base64 })
        );
        setActiveLogo(base64);
      } catch {
        setLogoError("Impossible de lire l'image");
      }
    },
    [logos, persistLogos, setActiveLogo, t]
  );

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

  const handleDeleteLogo = (id: string) => {
    const res = removeLogo(logos, id, logo);
    persistLogos(res.list);
    if (res.nextActive !== logo) setActiveLogo(res.nextActive);
  };

  const handleRenameLogo = (id: string, name: string) => {
    persistLogos(renameLogo(logos, id, name));
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
      // Envoi côté main : la CSP du renderer bloque les hôtes externes (#1269)
      const res = await window.electronAPI?.remote?.testWebhook?.(webhookUrl.trim());
      if (!res?.success) throw new Error(res?.error ?? 'failed');
      setWebhookTestStatus('success');
      setWebhookTestMessage(t('settings.webhook_success'));
    } catch (e) {
      setWebhookTestStatus('error');
      const detail =
        e instanceof Error && e.message.startsWith('http_') ? ` (HTTP ${e.message.slice(5)})` : '';
      setWebhookTestMessage(t('settings.webhook_failed') + detail);
    }
  };

  const handleAuditLogChange = (enabled: boolean) => {
    setAuditLogEnabled(enabled);
    localStorage.setItem(AUDIT_LOG_KEY, String(enabled));
  };

  const handleQuickMouseScoringChange = (enabled: boolean) => {
    setQuickMouseScoring(enabled);
    localStorage.setItem(QUICK_MOUSE_KEY, String(enabled));
  };

  const handleConfettiDisabledChange = (disabled: boolean) => {
    setConfettiDisabled(disabled);
    localStorage.setItem(CONFETTI_DISABLED_KEY, String(disabled));
  };

  const handleSplashEnabledChange = (enabled: boolean) => {
    setSplashEnabledState(enabled);
    window.electronAPI?.splash?.setEnabled?.(enabled).catch(() => {
      setSplashEnabledState(!enabled);
    });
  };

  const handleUpdateAutoCheckChange = (enabled: boolean) => {
    setUpdateAutoCheck(enabled);
    window.electronAPI?.updater?.setAutoCheck?.(enabled).catch(() => {
      setUpdateAutoCheck(!enabled);
    });
  };

  const handleChooseUpdateDir = () => {
    const updater = window.electronAPI?.updater;
    updater
      ?.chooseDownloadDir?.()
      .then(r => {
        if (r.success && r.dir) setUpdateDir({ dir: r.dir, isDefault: false });
      })
      .catch(() => {
        // annulé / indisponible
      });
  };

  const handleResetUpdateDir = () => {
    const updater = window.electronAPI?.updater;
    updater
      ?.resetDownloadDir?.()
      .then(r => {
        if (r.success && r.dir) setUpdateDir({ dir: r.dir, isDefault: true });
      })
      .catch(() => {
        // indisponible
      });
  };

  const handleUpdateChannelChange = (channel: 'stable' | 'dev') => {
    const previous = updateChannel;
    setUpdateChannel(channel);
    window.electronAPI?.updater?.setChannel?.(channel).catch(() => {
      setUpdateChannel(previous);
    });
  };

  // Taille du texte : appliquée et enregistrée immédiatement (#1156)
  const handleUiScaleChange = (scale: UiScale) => {
    setUiScale(scale);
    saveUiScale(scale);
  };

  // Densité d'affichage : appliquée et enregistrée immédiatement (#1541)
  const handleUiDensityChange = (density: UiDensity) => {
    setUiDensity(density);
    saveUiDensity(density);
  };

  const handleSimplifiedInputModeChange = (enabled: boolean) => {
    setSimplifiedInputMode(enabled);
    localStorage.setItem(SIMPLIFIED_INPUT_KEY, String(enabled));
  };

  // Export / import JSON des paramètres (logos inclus)
  const importInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleExportSettings = () => {
    const now = new Date();
    const blob = new Blob([JSON.stringify(buildSettingsExport(localStorage, now), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = settingsExportFileName(now);
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatus({ ok: true, msg: t('settings.backup_exported') });
  };

  const handleImportSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const values = parseSettingsImport(await file.text());
      applySettingsValues(values);
      // Rafraîchit l'état local + propage (main, serveurs distants)
      if (values['bellepoule-logos'] !== undefined) {
        persistLogos(
          ensureActiveInLibrary(loadLogoLibrary(), localStorage.getItem(LOGO_STORAGE_KEY))
        );
      }
      if (values['bellepoule-logo'] !== undefined) setActiveLogo(values['bellepoule-logo']);
      if (values['bellepoule-tts-config'] !== undefined) persistTtsConfig(loadTtsConfig());
      if (values['bellepoule-webhook-url'] !== undefined)
        handleWebhookUrlChange(values['bellepoule-webhook-url']);
      setAuditLogEnabled(localStorage.getItem(AUDIT_LOG_KEY) !== 'false');
      setQuickMouseScoring(localStorage.getItem(QUICK_MOUSE_KEY) === 'true');
      setSimplifiedInputMode(localStorage.getItem(SIMPLIFIED_INPUT_KEY) === 'true');
      setConfettiDisabled(isConfettiDisabled());
      handleUiScaleChange(loadUiScale());
      handleUiDensityChange(loadUiDensity());
      if (values['bellepoule-pdf-templates'] !== undefined)
        await usePdfTemplateStore.persist?.rehydrate?.();
      const lang = values['bellepoule-language'] as Language | undefined;
      const th = values['bellepoule-theme'] as 'default' | 'light' | 'dark' | undefined;
      if (lang) changeLanguage(lang);
      if (th) changeTheme(th);
      setSettings(prev => ({
        ...prev,
        ...(lang ? { language: lang } : {}),
        ...(th ? { theme: th } : {}),
      }));
      setBackupStatus({
        ok: true,
        msg: t('settings.backup_imported', { count: Object.keys(values).length }),
      });
    } catch {
      setBackupStatus({ ok: false, msg: t('settings.backup_invalid') });
    }
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

  // Navigation par section + recherche transversale
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => loadActiveSection());
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeSearch(query.trim());
  const searching = normalizedQuery.length > 0;

  const visibleSections = useMemo(() => {
    if (!searching) {
      const section = SETTINGS_SECTIONS.find(s => s.id === activeSection) ?? SETTINGS_SECTIONS[0];
      return [{ section, items: section.items }];
    }
    return SETTINGS_SECTIONS.map(section => {
      const sectionLabel = t(section.labelKey);
      const items = section.items.filter(item =>
        normalizeSearch([sectionLabel, ...item.keys.map(k => t(k))].join(' ')).includes(
          normalizedQuery
        )
      );
      return { section, items };
    }).filter(entry => entry.items.length > 0);
  }, [searching, activeSection, normalizedQuery, t]);

  const matchCount = (id: SettingsSectionId): number =>
    visibleSections.find(entry => entry.section.id === id)?.items.length ?? 0;

  const selectSection = (id: SettingsSectionId) => {
    setQuery('');
    setActiveSection(id);
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, id);
    } catch {
      /* stockage indisponible */
    }
  };

  const renderItem = (id: SettingsItemId): React.ReactNode => {
    switch (id) {
      case 'language':
        return (
          <>
            <div className="form-group">
              <LanguageSelector
                showLabel={true}
                value={settings.language}
                onLanguageChange={handleLanguageChange}
              />
            </div>
          </>
        );
      case 'pseudo':
        return (
          <>
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
          </>
        );
      case 'theme':
        return (
          <>
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
          </>
        );
      case 'text_size':
        return (
          <>
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
          </>
        );
      case 'density':
        return (
          <>
            <div className="form-group">
              <label htmlFor="settings-ui-density">{t('settings.density')}</label>
              <select
                id="settings-ui-density"
                className="form-input form-select"
                value={uiDensity}
                onChange={e => handleUiDensityChange(normalizeUiDensity(e.target.value))}
              >
                {UI_DENSITIES.map(d => (
                  <option key={d} value={d}>
                    {t(`settings.density_${d}`)}
                  </option>
                ))}
              </select>
            </div>
          </>
        );
      case 'logo':
        return (
          <>
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
                <span className="is-fd4b7b">{t('settings.logo_drop')}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted, var(--color-text-muted))',
                    display: 'block',
                    marginTop: '0.25rem',
                  }}
                >
                  {t('settings.logo_formats')}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="is-f2892a"
                onChange={handleFileChange}
              />
              {logoError && <p className="is-bb6602">{logoError}</p>}
              {logos.length > 0 && (
                <ul aria-label={t('settings.logo_library')} className="logo-library">
                  {logos.map(l => {
                    const isActive = l.data === logo;
                    return (
                      <li key={l.id} className={`logo-library-item${isActive ? ' is-active' : ''}`}>
                        <img src={l.data} alt={l.name} className="logo-library-thumb" />
                        <input
                          type="text"
                          defaultValue={l.name}
                          aria-label={t('settings.logo_name')}
                          maxLength={80}
                          onBlur={e => handleRenameLogo(l.id, e.target.value)}
                          className="logo-library-name"
                        />
                        {isActive ? (
                          <span className="logo-library-active">{t('settings.logo_active')}</span>
                        ) : (
                          <Button
                            type="button"

                            style={SMALL_BTN}
                            onClick={() => setActiveLogo(l.data)}
                          >
                            {t('settings.logo_use')}
                          </Button>
                        )}
                        <Button
                          type="button"

                          style={SMALL_BTN}
                          aria-label={`${t('settings.logo_delete')} ${l.name}`}
                          onClick={() => handleDeleteLogo(l.id)}
                        >
                          {t('settings.logo_delete')}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {logo && (
                <Button className="is-7b69a8" onClick={() => setActiveLogo(null)}>
                  {t('settings.logo_none')}
                </Button>
              )}
            </div>
          </>
        );
      case 'pdf':
        return (
          <>
            <div className="form-group">
              <label style={BOLD}>{t('settings.pdf_title')}</label>
              <p style={HINT}>{t('settings.pdf_hint')}</p>
              <Button className="is-af623e" onClick={() => setShowPdfEditor(true)}>
                {t('pdfTemplate.openButton')}
              </Button>
            </div>
          </>
        );
      case 'tour':
        return (
          <>
            <div className="form-group">
              <label style={BOLD}>{t('settings.tour_title')}</label>
              <p style={HINT}>{t('settings.tour_hint')}</p>
              <Button type="button" onClick={restartGuidedTour}>
                {t('settings.tour_restart')}
              </Button>
            </div>
          </>
        );
      case 'quick_mouse':
        return (
          <>
            <div className="form-group">
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
          </>
        );
      case 'simplified':
        return (
          <>
            <div className="form-group">
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
          </>
        );
      case 'audit':
        return (
          <>
            <div className="form-group">
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
          </>
        );
      case 'animations':
        return (
          <>
            <div className="form-group">
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
            <div className="form-group">
              <label style={BOLD}>{t('settings.splash_title')}</label>
              <p style={HINT}>{t('settings.splash_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={splashEnabled}
                  onChange={e => handleSplashEnabledChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.splash_enable')}</span>
              </label>
            </div>
          </>
        );
      case 'updates':
        return (
          <>
            <div className="form-group">
              <label style={BOLD}>{t('settings.updates_title')}</label>
              <p style={HINT}>{t('settings.updates_hint')}</p>
              <label className="u-row cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateAutoCheck}
                  onChange={e => handleUpdateAutoCheckChange(e.target.checked)}
                />
                <span style={TOGGLE_LABEL}>{t('settings.updates_enable')}</span>
              </label>
            </div>
            {updateDir && (
              <div className="form-group">
                <label style={BOLD}>{t('settings.updates_dir')}</label>
                <p style={HINT}>{t('settings.updates_dir_hint')}</p>
                <p style={HINT} data-testid="update-dir-current">
                  {updateDir.dir}
                  {updateDir.isDefault ? ` (${t('settings.updates_dir_default')})` : ''}
                </p>
                <div className="u-row">
                  <Button
                    type="button"

                    onClick={handleChooseUpdateDir}
                  >
                    {t('settings.updates_dir_choose')}
                  </Button>
                  {!updateDir.isDefault && (
                    <Button
                      type="button"

                      onClick={handleResetUpdateDir}
                    >
                      {t('settings.updates_dir_reset')}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {updateChannel && (
              <div className="form-group">
                <label htmlFor="update-channel" style={BOLD}>
                  {t('settings.updates_channel')}
                </label>
                <p style={HINT}>{t('settings.updates_channel_hint')}</p>
                <select
                  id="update-channel"
                  className="form-input form-select"
                  value={updateChannel}
                  onChange={e => handleUpdateChannelChange(e.target.value as 'stable' | 'dev')}
                >
                  <option value="stable">{t('settings.updates_channel_stable')}</option>
                  <option value="dev">{t('settings.updates_channel_dev')}</option>
                </select>
              </div>
            )}
          </>
        );
      case 'proxy':
        return <ProxySettingsSection />;
      case 'backup':
        return (
          <>
            <div className="form-group">
              <label style={BOLD}>{t('settings.backup_title')}</label>
              <p style={HINT}>{t('settings.backup_hint')}</p>
              <div className="u-row">
                <Button type="button" onClick={handleExportSettings}>
                  {t('settings.backup_export')}
                </Button>
                <Button
                  type="button"

                  onClick={() => importInputRef.current?.click()}
                >
                  {t('settings.backup_import')}
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  data-testid="settings-import-input"
                  onChange={handleImportSettings}
                />
              </div>
              {backupStatus && (
                <p
                  role="status"
                  style={HINT}
                  className={backupStatus.ok ? undefined : 'form-error'}
                >
                  {backupStatus.msg}
                </p>
              )}
            </div>
          </>
        );
      case 'webhook':
        return (
          <>
            <div className="form-group">
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
                <Button
                  style={SMALL_BTN}
                  onClick={handleTestWebhook}
                  disabled={!webhookUrl.trim() || webhookTestStatus === 'testing'}
                >
                  {webhookTestStatus === 'testing' ? (
                    <>
                      <Icon icon={Hourglass} /> {t('settings.webhook_testing')}
                    </>
                  ) : (
                    <>
                      <Icon icon={Bell} /> {t('settings.webhook_test')}
                    </>
                  )}
                </Button>
                {webhookUrl && (
                  <Button style={SMALL_BTN} onClick={() => handleWebhookUrlChange('')}>
                    {t('settings.webhook_remove')}
                  </Button>
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
          </>
        );
      case 'tts':
        return (
          <>
            <div className="form-group">
              <label style={BOLD}>{t('settings.tts_title')}</label>
              <p style={HINT}>{t('settings.tts_hint')}</p>

              <label className="is-933a8e">{t('settings.tts_voice')}</label>
              <div className="is-98cce7">
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
                <Button style={SMALL_BTN} onClick={handleTtsTestVoice}>
                  {t('settings.tts_test')}
                </Button>
              </div>

              <label className="is-933a8e">
                {t('settings.tts_rate', { rate: ttsConfig.rate.toFixed(1) })}
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsConfig.rate}
                onChange={e => handleTtsRateChange(parseFloat(e.target.value))}
                className="is-f9549b"
              />

              <label className="is-fb413b">{t('settings.tts_milestones')}</label>
              <div className="is-2b393c">
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
          </>
        );
    }
  };

  return (
    <>
      {/* Clic extérieur sans effet : fermeture via ✕ / Échap (#1033) */}
      <div className="modal-overlay">
        <div
          ref={modalRef}
          className="modal settings-modal"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-header">
            <h2 className="modal-title">{t('settings.title')}</h2>
            <button className="btn-close" onClick={onClose} aria-label={t('common.close')}>
              &times;
            </button>
          </div>

          <div className="modal-body settings-body">
            <input
              type="search"
              className="form-input settings-search"
              placeholder={t('settings.search_placeholder')}
              aria-label={t('settings.search_placeholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <div className="settings-layout">
              <nav className="settings-nav" role="tablist" aria-orientation="vertical">
                {SETTINGS_SECTIONS.map(section => {
                  const count = matchCount(section.id);
                  const selected = !searching && section.id === activeSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`settings-nav-item${selected ? ' is-active' : ''}`}
                      disabled={searching && count === 0}
                      onClick={() => selectSection(section.id)}
                    >
                      <section.icon size={16} aria-hidden="true" />
                      <span className="settings-nav-label">{t(section.labelKey)}</span>
                      {searching && count > 0 && (
                        <span className="settings-nav-count">{count}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
              <div className="settings-panel" role="tabpanel">
                {visibleSections.length === 0 && (
                  <p className="settings-empty">{t('settings.search_empty')}</p>
                )}
                {visibleSections.map(({ section, items }) => (
                  <section key={section.id} className="settings-section">
                    <h3 className="settings-section-title">
                      <section.icon size={16} aria-hidden="true" /> {t(section.labelKey)}
                    </h3>
                    {items.map(item => (
                      <div key={item.id} className="settings-item">
                        {renderItem(item.id)}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <Button onClick={onClose}>{t('actions.cancel')}</Button>
            <Button variant="primary" onClick={handleSave}>
              {t('settings.save')}
            </Button>
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
