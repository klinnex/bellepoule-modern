/**
 * BellePoule Modern - Actions du serveur de saisie distante : arrêt, mots de passe, formateur, thèmes, URLs d'écrans
 * Licensed under GPL-3.0
 */

import React, { useEffect, useCallback, useRef } from 'react';
import { useStateGroup } from '../useStateGroup';
import { createPortal } from 'react-dom';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { FencerStatus } from '../../../shared/types';
import type { CustomTheme, ThemeTargetType } from '../../../shared/types/remote';
import { logger, LogCategory } from '@shared/services/logger';
import ArenaQrCodesModal from '../../components/ArenaQrCodesModal';
import { ipcErrorText } from '../../services/ipcError';
import { useRemoteCommand } from '../useRemoteCommand';
import { RSM_STYLES } from '../../components/remote/rsmStyles';
import { StripRangeControls } from '../../components/remote/StripRangeControls';
import { useStripPlanSync } from '../useStripAvailability';
import { MAX_STRIP, stripNumbers } from '../../../shared/utils/stripRange';
import { Button } from '../../components/common/Button';
import { RemoteScoreManagerProps } from '../../components/remote/remoteScoreManagerShared';
import { resolveAllSourcesTheme, resolveBuiltinTheme } from '../../components/remote/builtinThemes';
import { useRemoteServerState } from './useRemoteServerState';

type Ctx = RemoteScoreManagerProps & ReturnType<typeof useRemoteServerState>;

/** Actions du serveur de saisie distante : arrêt, mots de passe, formateur, thèmes, URLs d'écrans (extrait de RemoteScoreManager, #1599) */
export function useRemoteServerActions(ctx: Ctx) {
  const {
    setCommittedStart,
    onStripStartChange,
    competition,
    effectivePending,
    effectivePendingStart,
    session,
    setSession,
    setCommittedCount,
    onArenaCountChange,
    showToast,
    t,
    setRemotePort,
    setIsLoading,
    remotePort,
    setServerUrl,
    onStopRemote,
    isRemoteActive,
    onStartRemote,
    setArenaPasswords,
    arenaPasswords,
    effectiveCommittedStart,
    checkinPassword,
    setCopiedIndex,
    savedThemes,
    globalThemeId,
    globalThemeSection,
    handleArenaThemeChange,
    applyKioskCustomTheme,
    effectiveCommitted,
    setGlobalThemeId,
    serverUrl,
    unavailableStrips,
    isLoading,
    setPendingStart,
    setPendingCount,
    hasPendingChanges,
    setShowArenaQrModal,
    showArenaQrModal,
  } = ctx;

  const commitStart = (start: number) => {
    setCommittedStart(start);
    onStripStartChange?.(start);
    localStorage.setItem(`bellepoule-remote-strip-start-${competition.id}`, String(start));
  };

  const handleSaveStripCount = async () => {
    const newCount = effectivePending;
    const newStart = effectivePendingStart;
    if (newStart < 1 || newCount < newStart || newCount > MAX_STRIP) return;

    if (session) {
      // Serveur actif : appliquer via IPC
      try {
        const result = await window.electronAPI.remote.updateStripCount(competition.id, newCount);
        if (result.success && result.session) {
          setSession(result.session);
          setCommittedCount(newCount);
          commitStart(newStart);
          onArenaCountChange?.(newCount);
          localStorage.setItem(`bellepoule-remote-strips-${competition.id}`, String(newCount));
          showToast('Nombre de pistes mis à jour', 'success');
        } else {
          showToast(`Erreur: ${ipcErrorText(t, result)}`, 'error');
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to update strip count', error as Error);
        showToast('Erreur lors de la mise à jour des pistes', 'error');
      }
    } else {
      // Serveur non démarré : persister la préférence
      setCommittedCount(newCount);
      commitStart(newStart);
      onArenaCountChange?.(newCount);
      localStorage.setItem(`bellepoule-remote-strips-${competition.id}`, String(newCount));
      showToast('Préférence sauvegardée', 'success');
    }
  };

  const handlePortChange = (value: number) => {
    const port = Math.max(1, Math.min(65535, value || 8066));
    setRemotePort(port);
    localStorage.setItem(`bellepoule-remote-port-${competition.id}`, String(port));
  };

  const handleChangePort = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.remote.changePort(competition.id, remotePort);
      if (result.success && result.serverInfo) {
        setServerUrl(result.serverInfo.url);
        showToast(`Port changé : ${result.serverInfo.port}`, 'success');
      } else {
        showToast(`Erreur: ${ipcErrorText(t, result)}`, 'error');
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to change port', error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRemote = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.remote.stopServer(competition.id);
      if (result.success) {
        setSession(null);
        showToast('Saisie distante arrêtée', 'success');
        onStopRemote();
      } else {
        showToast(`Erreur: ${ipcErrorText(t, result, "Impossible d'arrêter le serveur")}`, 'error');
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to stop remote server', error as Error);
      showToast("Impossible d'arrêter le serveur distant", 'error');
    } finally {
      setIsLoading(false);
    }
  };
  useRemoteCommand(isRemoteActive, onStartRemote, handleStopRemote); // palette « /remote »

  // Mots de passe : commun aux pistes, y compris celles ajoutées ensuite (#988), et formateurs (#989)
  const {
    commonArenaPassword,
    setCommonArenaPassword,
    appliedCommonPassword,
    setAppliedCommonPassword,
    trainerPassword,
    setTrainerPassword,
  } = useStateGroup({
    commonArenaPassword: '',
    appliedCommonPassword: null as string | null,
    trainerPassword: '',
  });

  const applyCommonArenaPassword = async (pwd: string, numbers: number[]): Promise<boolean> => {
    for (const n of numbers) {
      const result = await window.electronAPI.remote.setArenaPassword(
        competition.id,
        `arena${n}`,
        pwd
      );
      if (!result.success) {
        showToast(ipcErrorText(t, result, t('rsm.error')), 'error');
        return false;
      }
    }
    setArenaPasswords(p => {
      const next = { ...p };
      for (const n of numbers) next[`arena${n}`] = pwd;
      return next;
    });
    return true;
  };

  const applyArenaPassword = async (n: number) => {
    const pwd = arenaPasswords[`arena${n}`] ?? '';
    const result = await window.electronAPI.remote.setArenaPassword(
      competition.id,
      `arena${n}`,
      pwd
    );
    if (result.success) {
      showToast(t(pwd ? 'rsm.pwd_set' : 'rsm.pwd_removed', { number: n }), 'success');
    } else {
      showToast(ipcErrorText(t, result, t('rsm.error')), 'error');
    }
  };

  const handleApplyCommonPassword = async () => {
    const numbers = stripNumbers(effectiveCommittedStart, arenaCount);
    if (await applyCommonArenaPassword(commonArenaPassword, numbers)) {
      setAppliedCommonPassword(commonArenaPassword || null);
      showToast(
        commonArenaPassword
          ? t('plural.common_password_set', { count: numbers.length })
          : 'Mots de passe des pistes supprimés',
        'success'
      );
    }
  };

  // Espace formateurs (#989) : ouvert si l'option de compétition est cochée
  const trainerEnabled = competition.settings?.trainerCommentsEnabled === true;
  useEffect(() => {
    if (!session) return;
    window.electronAPI.remote.setTrainerEnabled?.(competition.id, trainerEnabled).catch(() => {});
  }, [session, trainerEnabled, competition.id]);

  const applyTrainerPassword = async () => {
    const result = await window.electronAPI.remote.setTrainerPassword(
      competition.id,
      trainerPassword
    );
    if (result.success) {
      showToast(
        trainerPassword ? 'Mot de passe formateurs défini' : 'Mot de passe formateurs supprimé',
        'success'
      );
    } else {
      showToast(ipcErrorText(t, result, t('rsm.error')), 'error');
    }
  };

  const exportTrainerComments = async () => {
    try {
      const [referees, comments] = await Promise.all([
        window.electronAPI.db.getRefereesByCompetition(competition.id),
        window.electronAPI.db.getRefereeComments(competition.id),
      ]);
      if (comments.length === 0) {
        showToast('Aucun commentaire enregistré', 'info');
        return;
      }
      const { exportRefereeCommentsToPDF } =
        await import('../../../shared/utils/pdfExport/refereeCommentsPdf');
      await exportRefereeCommentsToPDF(referees, comments, competition.title);
    } catch (error) {
      logger.error(LogCategory.UI, 'Export commentaires arbitres', error as Error);
      showToast("Échec de l'export PDF", 'error');
    }
  };

  const applyCheckinPassword = async () => {
    const result = await window.electronAPI.remote.setCheckinPassword(
      competition.id,
      checkinPassword
    );
    if (result.success) {
      showToast(
        checkinPassword
          ? "Mot de passe d'appel défini"
          : "Mot de passe d'appel supprimé (appel fermé)",
        'success'
      );
    } else {
      showToast(ipcErrorText(t, result, t('rsm.error')), 'error');
    }
  };

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }, []);

  // Appliquer un thème à toutes les pistes pour un type d'écran (ou au kiosque)
  const applyThemeToAllScreens = useCallback(
    async (section: ThemeTargetType, theme: CustomTheme, quiet = false) => {
      if (section === 'arena') {
        // Une surcharge par piste : l'id 'all' n'est pas reconnu côté serveur
        const count = session ? session.strips.length : effectiveCommitted;
        for (const i of stripNumbers(effectiveCommittedStart, count)) {
          await handleArenaThemeChange(`arena${i}`, 'custom', theme);
        }
        if (!quiet) showToast(`Thème "${theme.name}" appliqué à toutes les pistes`, 'success');
      } else if (section === 'kiosk') {
        const result = await applyKioskCustomTheme(theme);
        if (!result?.success) showToast(ipcErrorText(t, result, t('rsm.error')), 'error');
        else if (!quiet) showToast(`Thème "${theme.name}" appliqué au kiosque`, 'success');
      } else {
        // public / referee / pool → appliquer à toutes les arènes pour ce type d'écran
        const count = session ? session.strips.length : effectiveCommitted;
        for (const i of stripNumbers(effectiveCommittedStart, count)) {
          await window.electronAPI.remote.updateArenaScreenTheme(
            competition.id,
            `arena${i}`,
            section,
            theme
          );
        }
        if (!quiet) {
          showToast(`Thème "${theme.name}" appliqué (${section}) à toutes les pistes`, 'success');
        }
      }
    },
    [
      handleArenaThemeChange,
      applyKioskCustomTheme,
      showToast,
      t,
      competition.id,
      session,
      effectiveCommitted,
      effectiveCommittedStart,
    ]
  );

  // Appliquer un thème sauvegardé globalement (toutes les arènes, un type d'écran)
  const handleGlobalThemeApply = useCallback(async () => {
    // « Toutes sources » (#1795) : chaque écran concerné par le thème choisi
    if (globalThemeSection === 'all') {
      const apps = resolveAllSourcesTheme(globalThemeId, savedThemes, t);
      if (apps.length === 0) return;
      const count = session ? session.strips.length : effectiveCommitted;
      for (const app of apps) {
        if (app.preset) {
          for (const i of stripNumbers(effectiveCommittedStart, count)) {
            await handleArenaThemeChange(`arena${i}`, app.preset);
          }
        } else {
          await applyThemeToAllScreens(app.section, app.theme, true);
        }
      }
      showToast(t('rsm.custom_theme_applied'), 'success');
      setGlobalThemeId('');
      return;
    }
    const builtin = resolveBuiltinTheme(globalThemeSection, globalThemeId, t);
    if (builtin?.preset) {
      const count = session ? session.strips.length : effectiveCommitted;
      for (const i of stripNumbers(effectiveCommittedStart, count)) {
        await handleArenaThemeChange(`arena${i}`, builtin.preset);
      }
      showToast(t('rsm.custom_theme_applied'), 'success');
      setGlobalThemeId('');
      return;
    }
    const theme = builtin?.theme ?? savedThemes.find(x => x.id === globalThemeId);
    if (!theme) return;
    await applyThemeToAllScreens(globalThemeSection, theme);
    setGlobalThemeId('');
  }, [
    savedThemes,
    globalThemeId,
    globalThemeSection,
    applyThemeToAllScreens,
    setGlobalThemeId,
    handleArenaThemeChange,
    showToast,
    t,
    session,
    effectiveCommitted,
    effectiveCommittedStart,
  ]);

  // La grille d'URLs reflète l'état réel du serveur (committedCount) ou la session active
  const arenaCount = session ? session.strips.length : effectiveCommitted;
  const kioskUrl = `${serverUrl}/kiosk`;
  const lobbyUrl = `${serverUrl}/lobby`;
  const checkinUrl = `${serverUrl}/appel`;
  const trainerUrl = `${serverUrl}/formateur`;
  // Pistes ajoutées après définition du MDP commun : même mot de passe (#988)
  const commonPwdCountRef = useRef(arenaCount);
  useEffect(() => {
    const prev = commonPwdCountRef.current;
    commonPwdCountRef.current = arenaCount;
    if (!appliedCommonPassword || !session || arenaCount <= prev) return;
    const added = Array.from({ length: arenaCount - prev }, (_, i) => prev + i + 1);
    void applyCommonArenaPassword(appliedCommonPassword, added);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaCount]);
  const stripStart = effectiveCommittedStart;
  useStripPlanSync(competition.id, !!session, stripStart, unavailableStrips);
  const arenaUrls = stripNumbers(stripStart, arenaCount).map(n => ({
    number: n,
    refereeUrl: `${serverUrl}/arene${n}/arbitre`,
    displayUrl: `${serverUrl}/arene${n}`,
    poolUrl: `${serverUrl}/arene${n}/poule`,
    matchOrderUrl: `${serverUrl}/arene${n}/matchs`,
    publicUrl: `${serverUrl}/arene${n}/public`,
    overlayUrl: `${serverUrl}/arene${n}/overlay`,
  }));

  // QR personnels des tireurs engagés (#1078)
  const fencerQrTargets = (competition.fencers ?? [])
    .filter(
      f =>
        f.status !== FencerStatus.ABANDONED &&
        f.status !== FencerStatus.EXCLUDED &&
        f.status !== FencerStatus.FORFAIT
    )
    .map(f => ({
      name: `${f.lastName.toUpperCase()} ${f.firstName}`.trim(),
      club: f.club,
      url: `${serverUrl}/tireur/${encodeURIComponent(f.id)}`,
    }));

  // Contrôles +/− communs aux deux vues (pending uniquement, sans appel IPC direct)
  const stripCountControls = (
    <div style={RSM_STYLES.stripCountControls}>
      <StripRangeControls
        start={effectivePendingStart}
        end={effectivePending}
        disabled={isLoading}
        onChange={(st, en) => {
          setPendingStart(st);
          setPendingCount(en);
        }}
      />
      {hasPendingChanges && (
        <span style={RSM_STYLES.stripCountPending} title={t('rsm.unsaved')}>
          ●
        </span>
      )}
      <Button
        variant="primary"
        onClick={handleSaveStripCount}
        disabled={!hasPendingChanges || isLoading}
        style={RSM_STYLES.stripCountSave}
      >
        {t('rsm.save')}
      </Button>
      <Button
        onClick={() => setShowArenaQrModal(true)}
        title={t('rsm.qr_export_title')}
        style={RSM_STYLES.stripCountSave}
        disabled={!isRemoteActive || !serverUrl}
      >
        {t('rsm.qr_codes')}
      </Button>
      {showArenaQrModal &&
        createPortal(
          <ArenaQrCodesModal
            arenas={arenaUrls}
            fencers={fencerQrTargets}
            competitionTitle={competition.title}
            onClose={() => setShowArenaQrModal(false)}
          />,
          document.body
        )}
    </div>
  );

  return {
    handlePortChange,
    handleChangePort,
    handleStopRemote,
    commonArenaPassword,
    setCommonArenaPassword,
    trainerPassword,
    setTrainerPassword,
    applyArenaPassword,
    handleApplyCommonPassword,
    trainerEnabled,
    applyTrainerPassword,
    exportTrainerComments,
    applyCheckinPassword,
    copyToClipboard,
    handleGlobalThemeApply,
    applyThemeToAllScreens,
    arenaCount,
    kioskUrl,
    lobbyUrl,
    checkinUrl,
    trainerUrl,
    stripStart,
    arenaUrls,
    stripCountControls,
  };
}
