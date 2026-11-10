/**
 * BellePoule Modern - Gestionnaires de la fenêtre de paramètres : logos, webhook, préférences, sauvegarde et import
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useCallback } from 'react';
import type { Language } from '../../contexts/TranslationContext';
import { CONFETTI_DISABLED_KEY, isConfettiDisabled } from '../../components/Confetti';
import { logger, LogCategory } from '@shared/services/logger';
import { isWebhookUrlSafe } from '@shared/services/notificationService';
import { loadUiScale, saveUiScale, type UiScale } from '../../services/uiScale';
import { loadUiDensity, saveUiDensity, type UiDensity } from '../../services/uiDensity';
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
} from '../../services/logoLibrary';
import {
  buildSettingsExport,
  parseSettingsImport,
  applySettingsValues,
  settingsExportFileName,
} from '../../services/settingsTransfer';
import { usePdfTemplateStore } from '../../../features/pdfTemplates/hooks/usePdfTemplateStore';
import {
  loadTtsConfig,
  resizeLogo,
  WEBHOOK_STORAGE_KEY,
  AUDIT_LOG_KEY,
  QUICK_MOUSE_KEY,
  SIMPLIFIED_INPUT_KEY,
  type SettingsModalProps,
} from '../../components/settingsModal.helpers';
import { useSettingsPreferences } from './useSettingsPreferences';

type Ctx = SettingsModalProps & ReturnType<typeof useSettingsPreferences>;

/** Gestionnaires de la fenêtre de paramètres : logos, webhook, préférences, sauvegarde et import (extrait de SettingsModal, #1599) */
export function useSettingsHandlers(ctx: Ctx) {
  const {
    setLogo,
    setLogos,
    setLogoError,
    logos,
    t,
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
    onClose,
  } = ctx;

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

  return {
    setActiveLogo,
    handleFileChange,
    handleDrop,
    handleDeleteLogo,
    handleRenameLogo,
    handleWebhookUrlChange,
    handleTestWebhook,
    handleAuditLogChange,
    handleQuickMouseScoringChange,
    handleConfettiDisabledChange,
    handleSplashEnabledChange,
    handleUpdateAutoCheckChange,
    handleChooseUpdateDir,
    handleResetUpdateDir,
    handleUpdateChannelChange,
    handleUiScaleChange,
    handleUiDensityChange,
    handleSimplifiedInputModeChange,
    importInputRef,
    backupStatus,
    handleExportSettings,
    handleImportSettings,
    handleSave,
  };
}
