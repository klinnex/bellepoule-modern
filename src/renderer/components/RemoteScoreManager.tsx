/**
 * BellePoule Modern - Remote Score Management Component
 * Interface for managing remote score entry
 * Licensed under GPL-3.0
 */
import { TipButton } from './Tooltip';
import React, { useEffect, useCallback, useRef } from 'react';
import { Icon } from './common/Icon';
import { CopyUrlLabel } from './remote/CopyUrlLabel';
import { Camera, LockOpen, Moon, Pencil, Smartphone, Square, Sun, Zap } from 'lucide-react';
import { useStateGroup } from '../hooks/useStateGroup';
import { createPortal } from 'react-dom';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { FencerStatus } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import ThemeEditor from './ThemeEditor';
import ArenaQrCodesModal from './ArenaQrCodesModal';
import { OBSOverlayConfig } from './OBSOverlayConfig';
import { OrgNotePanel } from './remote/OrgNotePanel';
import { ConnectedScreensPanel } from './remote/ConnectedScreensPanel';
import { ipcErrorText } from '../services/ipcError';
import { useRemoteCommand } from '../hooks/useRemoteCommand';
import { DisplayOptionsPanel } from './remote/DisplayOptionsPanel';
import { UrlCopyRow } from './remote/UrlCopyRow';
import RemoteViewModeTabs from './remote/RemoteViewModeTabs';
import { RSM_STYLES } from './remote/rsmStyles';
import { StripRangeControls } from './remote/StripRangeControls';
import { StripPlanCard } from './remote/StripPlanCard';
import { useStripPlanSync } from '../hooks/useStripAvailability';
import { MAX_STRIP, stripNumbers } from '../../shared/utils/stripRange';
import { type KioskPreset } from '../hooks/useKioskTheme';
import { Button } from './common/Button';
import { RemoteScoreManagerProps } from './remote/remoteScoreManagerShared';
import { useRemoteServerState } from '../hooks/remoteScoreManager/useRemoteServerState';

const RemoteScoreManager: React.FC<RemoteScoreManagerProps> = (props: RemoteScoreManagerProps) => {
  const remoteServerState = useRemoteServerState({ ...props });
  const {
    mode,
    setMode,
    t,
    isExpert,
    serverUrl,
    certFingerprint,
    competition,
    remotePort,
    isLoading,
    effectiveCommittedStart,
    effectiveCommitted,
    showPhotos,
    setShowPhotos,
    cardAnnounce,
    setCardAnnounce,
    arenaThemes,
    arenaScreenTab,
    savedThemes,
    setArenaScreenTab,
    handleArenaThemeChange,
    setThemeEditorScreenType,
    setThemeEditorTarget,
    handleClearArenaThemeOverride,
    handleClearArenaScreenTheme,
    handleArenaScreenThemeChange,
    copiedIndex,
    setActiveQR,
    arenaPasswords,
    setArenaPasswords,
    globalThemeSection,
    setGlobalThemeSection,
    setGlobalThemeId,
    globalThemeId,
    displayTheme,
    setDisplayTheme,
    arenaWallpaper,
    setArenaWallpaper,
    kioskViews,
    setKioskViews,
    kioskTheme,
    kioskPreset,
    applyKioskPreset,
    setKioskThemeEditorOpen,
    checkinPassword,
    setCheckinPassword,
    isRemoteActive,
    themeEditorTarget,
    themeEditorScreenType,
    showToast,
    refreshSavedThemes,
    kioskThemeEditorOpen,
    applyKioskCustomTheme,
    activeQR,
    qrDataUrl,
    setCommittedStart,
    onStripStartChange,
    effectivePending,
    effectivePendingStart,
    session,
    setSession,
    setCommittedCount,
    onArenaCountChange,
    setRemotePort,
    setIsLoading,
    setServerUrl,
    onStopRemote,
    onStartRemote,
    setCopiedIndex,
    unavailableStrips,
    setPendingStart,
    setPendingCount,
    hasPendingChanges,
    setShowArenaQrModal,
    showArenaQrModal,
    isVisible,
    selectedInterface,
    networkInterfaces,
    useHttps,
    setSelectedInterface,
    setUseHttps,
  } = { ...props, ...remoteServerState };

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
        await import('../../shared/utils/pdfExport/refereeCommentsPdf');
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

  // Appliquer un thème sauvegardé globalement (toutes les arènes, un type d'écran)
  const handleGlobalThemeApply = useCallback(async () => {
    const theme = savedThemes.find(t => t.id === globalThemeId);
    if (!theme) return;
    if (globalThemeSection === 'arena') {
      await handleArenaThemeChange('all', 'custom', theme);
      showToast(`Thème "${theme.name}" appliqué à toutes les pistes`, 'success');
    } else if (globalThemeSection === 'kiosk') {
      const result = await applyKioskCustomTheme(theme);
      if (result?.success) showToast(`Thème "${theme.name}" appliqué au kiosque`, 'success');
      else showToast(ipcErrorText(t, result, t('rsm.error')), 'error');
    } else {
      // public / referee / pool → appliquer à toutes les arènes pour ce type d'écran
      const count = session ? session.strips.length : effectiveCommitted;
      for (const i of stripNumbers(effectiveCommittedStart, count)) {
        await window.electronAPI.remote.updateArenaScreenTheme(
          competition.id,
          `arena${i}`,
          globalThemeSection,
          theme
        );
      }
      showToast(
        `Thème "${theme.name}" appliqué (${globalThemeSection}) à toutes les pistes`,
        'success'
      );
    }
    setGlobalThemeId('');
  }, [
    savedThemes,
    globalThemeId,
    globalThemeSection,
    handleArenaThemeChange,
    competition.id,
    session,
    effectiveCommitted,
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

  // Tous les hooks ont été appelés — retour null si l'onglet n'est pas visible
  if (!isVisible) return null;

  if (!isRemoteActive) {
    const portValid = remotePort >= 1 && remotePort <= 65535 && !isNaN(remotePort);
    const previewHost =
      selectedInterface === '0.0.0.0'
        ? (networkInterfaces.find(i => i.address !== '0.0.0.0')?.address ?? 'localhost')
        : selectedInterface;
    const networkPreview = `${useHttps ? 'https' : 'http'}://${previewHost}:${remotePort}`;

    return (
      <div className="remote-score-manager">
        <div className="rsm-inactive">
          {/* Hero */}
          <div className="rsm-hero">
            <span className="rsm-status-dot rsm-status-dot--off" />
            <div>
              <h3 className="rsm-hero-title">{t('remote.inactive_title')}</h3>
              <p className="rsm-hero-desc">{t('rsm.inactive_desc')}</p>
            </div>
          </div>

          {/* Sections grid */}
          <div className="rsm-sections">
            {/* Pistes */}
            <div className="rsm-section">
              <div className="rsm-section-label">{t('rsm.section_strips')}</div>
              <div className="rsm-strip-row">{stripCountControls}</div>
              <StripPlanCard start={effectiveCommittedStart} end={effectiveCommitted} />
            </div>

            {/* Réseau */}
            <div className="rsm-section rsm-section--full">
              <div className="rsm-section-label">{t('rsm.section_network')}</div>
              <div className="rsm-network-grid">
                <select
                  id="remote-interface"
                  value={selectedInterface}
                  onChange={e => {
                    setSelectedInterface(e.target.value);
                    localStorage.setItem('bellepoule-remote-interface', e.target.value);
                  }}
                  disabled={isLoading}
                >
                  {networkInterfaces.map(iface => (
                    <option key={iface.address} value={iface.address}>
                      {iface.name}
                    </option>
                  ))}
                </select>
                <input
                  id="remote-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={remotePort}
                  onChange={e => handlePortChange(parseInt(e.target.value, 10))}
                  className={portValid ? '' : 'rsm-input-error'}
                  disabled={isLoading}
                />
              </div>
              {!portValid && <div className="rsm-port-error">{t('rsm.port_invalid')}</div>}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={useHttps}
                  onChange={e => {
                    setUseHttps(e.target.checked);
                    localStorage.setItem('bellepoule-remote-https', String(e.target.checked));
                  }}
                  disabled={isLoading}
                />
                {t('rsm.enable_https')}
              </label>
              {useHttps ? (
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: '#94a3b8',
                    marginTop: '0.25rem',
                    lineHeight: 1.4,
                  }}
                >
                  {t('rsm.https_hint')}
                </div>
              ) : (
                <div role="alert" style={RSM_STYLES.httpWarning}>
                  {t('rsm.http_warning')}
                </div>
              )}
              <span className="rsm-network-preview">{networkPreview}</span>
            </div>
          </div>

          {/* CTA */}
          <button
            className="rsm-start-btn"
            onClick={onStartRemote}
            disabled={!portValid || isLoading}
          >
            {isLoading ? <span className="rsm-spinner" /> : <Icon icon={Zap} />}
            {t('rsm.start')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="remote-score-manager">
      <RemoteViewModeTabs mode={mode} onChange={setMode} />
      <div className="remote-header">
        <div className="remote-status active rsm-hero">
          <span className="rsm-status-dot rsm-status-dot--on" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="rsm-hero-title">{t('remote.active_title')}</h3>
            {isExpert && (
              <>
                <p className="rsm-hero-desc">
                  {t('rsm.server')} <strong>{serverUrl}</strong>
                </p>
                {certFingerprint ? (
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      margin: '0.25rem 0 0',
                      wordBreak: 'break-all',
                    }}
                  >
                    {t('rsm.cert_fingerprint')}{' '}
                    <code style={{ fontSize: '0.7rem' }}>{certFingerprint}</code>
                  </p>
                ) : (
                  serverUrl.startsWith('http://') && (
                    <p role="alert" style={RSM_STYLES.httpWarning}>
                      {t('rsm.http_warning_active')}
                    </p>
                  )
                )}
                <div style={RSM_STYLES.portActiveRow}>
                  <label
                    htmlFor={`remote-port-active-${competition.id}`}
                    style={RSM_STYLES.portActiveLabel}
                  >
                    {t('rsm.port')}
                  </label>
                  <input
                    id={`remote-port-active-${competition.id}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={remotePort}
                    onChange={e => handlePortChange(parseInt(e.target.value, 10))}
                    style={RSM_STYLES.portActiveInput}
                    disabled={isLoading}
                  />
                  <button
                    className="btn-secondary"
                    onClick={handleChangePort}
                    disabled={isLoading}
                    title={t('rsm.restart_port_title')}
                    style={RSM_STYLES.portActiveBtn}
                  >
                    {t('rsm.reload')}
                  </button>
                </div>
              </>
            )}
            {!isExpert && !certFingerprint && serverUrl.startsWith('http://') && (
              <p role="alert" style={RSM_STYLES.httpWarning}>
                {t('rsm.http_warning_active')}
              </p>
            )}
          </div>
        </div>
        <button
          className="rsm-start-btn rsm-stop-btn"
          onClick={handleStopRemote}
          disabled={isLoading}
        >
          {isLoading ? <span className="rsm-spinner" /> : <Icon icon={Square} />}
          {t('rsm.stop')}
        </button>
      </div>

      <div className="arena-urls-section">
        {/* Pistes et options : deux cartes sur une ligne, comme l'écran d'attente (#1006) */}
        <div className="rsm-sections">
          <div className="rsm-section">
            <div className="rsm-section-label">
              {t('rsm.strips_n', { count: arenaCount - stripStart + 1 })}
            </div>
            <div className="rsm-strip-row">{stripCountControls}</div>
            <StripPlanCard start={effectiveCommittedStart} end={effectiveCommitted} />
          </div>
          <div className="rsm-section">
            <div className="rsm-section-label">{t('rsm.section_display')}</div>
            <label className="rsm-toggle-row">
              <input
                type="checkbox"
                checked={showPhotos}
                onChange={async e => {
                  setShowPhotos(e.target.checked);
                  await window.electronAPI.remote.updateShowPhotos(
                    competition.id,
                    e.target.checked
                  );
                }}
              />
              {t('rsm.show_photos_long')}
            </label>
            <label className="rsm-toggle-row">
              <input
                type="checkbox"
                checked={cardAnnounce}
                onChange={async e => {
                  setCardAnnounce(e.target.checked);
                  await window.electronAPI.remote.updateCardAnnounce(
                    competition.id,
                    e.target.checked
                  );
                }}
              />
              {t('rsm.card_announce_long')}
            </label>
          </div>
        </div>
        <div className="arena-url-row" style={{ marginBottom: '0.75rem' }}>
          <span className="arena-url-label">{t('rsm.common_pwd')}</span>
          <input
            type="password"
            className="arena-password-input"
            placeholder={t('rsm.common_pwd_placeholder')}
            value={commonArenaPassword}
            onChange={e => setCommonArenaPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleApplyCommonPassword();
            }}
          />
          <button
            className="btn-copy"
            title={t('rsm.apply_all_strips')}
            onClick={handleApplyCommonPassword}
          >
            ✓
          </button>
        </div>

        <div className="arena-url-grid">
          {arenaUrls.map(arena => {
            const arenaId = `arena${arena.number}`;
            const arenaTheme = arenaThemes[arenaId];
            const screenTab = arenaScreenTab[arenaId] ?? 'arena';
            const screenThemeTypes = [
              { value: 'arena' as const, label: t('rsm.screen_display') },
              { value: 'public' as const, label: t('rsm.screen_public') },
              { value: 'referee' as const, label: t('rsm.screen_referee') },
              { value: 'pool' as const, label: t('rsm.screen_pool') },
            ] as const;
            const filteredForScreen = savedThemes.filter(
              t => (t.targetType ?? 'arena') === screenTab
            );
            return (
              <div key={arena.number} className="arena-url-card">
                <div className="arena-url-header">
                  <strong>{t('rsm.strip_n', { number: arena.number })}</strong>
                </div>
                {/* Onglets type d'écran */}
                <div style={{ display: 'flex', gap: '0.25rem', margin: '0.4rem 0 0.25rem' }}>
                  {screenThemeTypes.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setArenaScreenTab(prev => ({ ...prev, [arenaId]: value }))}
                      style={{
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.25rem',
                        border: `1px solid ${screenTab === value ? 'var(--color-primary)' : '#475569'}`,
                        background:
                          screenTab === value ? 'var(--color-primary-dark)' : 'transparent',
                        color: screenTab === value ? '#fff' : '#94a3b8',
                        cursor: 'pointer',
                        fontWeight: screenTab === value ? 700 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Sélecteur de thème selon l'onglet */}
                <div className="arena-theme-picker">
                  {screenTab === 'arena' ? (
                    <>
                      {[
                        { value: 'dark' as const, icon: Moon, title: t('rsm.theme_dark') },
                        { value: 'light' as const, icon: Sun, title: t('rsm.theme_light') },
                        { value: 'neon' as const, icon: Zap, title: t('rsm.theme_neon') },
                      ].map(({ value, icon, title }) => (
                        <TipButton
                          key={value}
                          tip={title}
                          className={`arena-theme-btn ${arenaTheme?.theme === value ? 'active' : ''}`}
                          onClick={() => handleArenaThemeChange(arenaId, value)}
                        >
                          <Icon icon={icon} />
                        </TipButton>
                      ))}
                      <TipButton
                        tip={t('rsm.theme_custom')}
                        className={`arena-theme-btn ${arenaTheme?.theme === 'custom' ? 'active' : ''}`}
                        onClick={() => {
                          setThemeEditorScreenType('arena');
                          setThemeEditorTarget(arenaId);
                        }}
                      >
                        <Icon icon={Pencil} />
                      </TipButton>
                      {arenaThemes[arenaId] && (
                        <TipButton
                          tip={t('rsm.unlock_theme')}
                          className="arena-theme-btn"
                          style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                          onClick={() => void handleClearArenaThemeOverride(arenaId)}
                        >
                          <Icon icon={LockOpen} />
                        </TipButton>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        title={t('rsm.customize_screen', { screen: screenTab })}
                        className={`arena-theme-btn ${arenaTheme?.screenThemes?.[screenTab] ? 'active' : ''}`}
                        onClick={() => {
                          setThemeEditorScreenType(screenTab);
                          setThemeEditorTarget(arenaId);
                        }}
                      >
                        <Icon icon={Pencil} /> {arenaTheme?.screenThemes?.[screenTab] ? '●' : ''}
                      </button>
                      {arenaTheme?.screenThemes?.[screenTab] && (
                        <TipButton
                          tip={t('rsm.unlock_theme')}
                          className="arena-theme-btn"
                          style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                          onClick={() => void handleClearArenaScreenTheme(arenaId, screenTab)}
                        >
                          <Icon icon={LockOpen} />
                        </TipButton>
                      )}
                    </>
                  )}
                  {filteredForScreen.length > 0 && (
                    <select
                      title={t('rsm.apply_saved_theme')}
                      value=""
                      onChange={async e => {
                        const t = savedThemes.find(x => x.id === e.target.value);
                        if (!t) return;
                        if (screenTab === 'arena') {
                          await handleArenaThemeChange(arenaId, 'custom', t);
                        } else {
                          await handleArenaScreenThemeChange(arenaId, screenTab, t);
                        }
                        e.currentTarget.value = '';
                      }}
                      style={{
                        padding: '0.2rem 0.4rem',
                        borderRadius: '0.3rem',
                        border: '1px solid #475569',
                        background: '#1e293b',
                        color: '#e2e8f0',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        maxWidth: 110,
                      }}
                    >
                      <option value="">{t('rsm.themes_option')}</option>
                      {filteredForScreen.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_referee')}</span>
                  <TipButton
                    className="btn-copy btn-wide"
                    onClick={() => copyToClipboard(arena.refereeUrl, arena.number * 10)}
                    tip={t('rsm.copy_url')}
                  >
                    <CopyUrlLabel copied={copiedIndex === arena.number * 10} t={t} />
                  </TipButton>
                  <button
                    className="btn-qr btn-wide"
                    onClick={() =>
                      setActiveQR({
                        url: arena.refereeUrl,
                        label: t('rsm.qr_label', {
                          number: arena.number,
                          screen: t('rsm.screen_referee'),
                        }),
                      })
                    }
                    title={t('rsm.qr_code')}
                  >
                    <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_display')}</span>
                  <TipButton
                    className="btn-copy btn-wide"
                    onClick={() => copyToClipboard(arena.displayUrl, arena.number * 10 + 1)}
                    tip={t('rsm.copy_url')}
                  >
                    <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 1} t={t} />
                  </TipButton>
                  <button
                    className="btn-qr btn-wide"
                    onClick={() =>
                      setActiveQR({
                        url: arena.displayUrl,
                        label: t('rsm.qr_label', {
                          number: arena.number,
                          screen: t('rsm.screen_display'),
                        }),
                      })
                    }
                    title={t('rsm.qr_code')}
                  >
                    <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_pool')}</span>
                  <TipButton
                    className="btn-copy btn-wide"
                    onClick={() => copyToClipboard(arena.poolUrl, arena.number * 10 + 2)}
                    tip={t('rsm.copy_url')}
                  >
                    <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 2} t={t} />
                  </TipButton>
                  <button
                    className="btn-qr btn-wide"
                    onClick={() =>
                      setActiveQR({
                        url: arena.poolUrl,
                        label: t('rsm.qr_label', {
                          number: arena.number,
                          screen: t('rsm.screen_pool'),
                        }),
                      })
                    }
                    title={t('rsm.qr_code')}
                  >
                    <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label" title={t('rsm.matches_title')}>
                    {t('rsm.matches')}
                  </span>
                  <TipButton
                    className="btn-copy btn-wide"
                    onClick={() => copyToClipboard(arena.matchOrderUrl, arena.number * 10 + 5)}
                    tip={t('rsm.copy_url')}
                  >
                    <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 5} t={t} />
                  </TipButton>
                  <button
                    className="btn-qr btn-wide"
                    onClick={() =>
                      setActiveQR({
                        url: arena.matchOrderUrl,
                        label: t('rsm.qr_label', {
                          number: arena.number,
                          screen: t('rsm.match_order'),
                        }),
                      })
                    }
                    title={t('rsm.qr_code')}
                  >
                    <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_public')}</span>
                  <TipButton
                    className="btn-copy btn-wide"
                    onClick={() => copyToClipboard(arena.publicUrl, arena.number * 10 + 3)}
                    tip={t('rsm.copy_url')}
                  >
                    <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 3} t={t} />
                  </TipButton>
                  <button
                    className="btn-qr btn-wide"
                    onClick={() =>
                      setActiveQR({
                        url: arena.publicUrl,
                        label: t('rsm.qr_label', {
                          number: arena.number,
                          screen: t('rsm.screen_public'),
                        }),
                      })
                    }
                    title={t('rsm.qr_code')}
                  >
                    <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label" title={t('rsm.overlay_title')}>
                    <Icon icon={Camera} /> Overlay
                  </span>
                  <TipButton
                    className="btn-copy btn-wide"
                    onClick={() => copyToClipboard(arena.overlayUrl, arena.number * 10 + 4)}
                    tip={t('rsm.overlay_copy_title')}
                  >
                    <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 4} t={t} />
                  </TipButton>
                  <button
                    className="btn-qr btn-wide"
                    onClick={() =>
                      setActiveQR({
                        url: arena.overlayUrl,
                        label: t('rsm.qr_label', {
                          number: arena.number,
                          screen: t('rsm.overlay_stream'),
                        }),
                      })
                    }
                    title={t('rsm.qr_code')}
                  >
                    <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.pwd')}</span>
                  <input
                    type="password"
                    className="arena-password-input"
                    placeholder={t('rsm.strip_pwd_placeholder')}
                    value={arenaPasswords[`arena${arena.number}`] ?? ''}
                    onChange={e =>
                      setArenaPasswords(p => ({
                        ...p,
                        [`arena${arena.number}`]: e.target.value,
                      }))
                    }
                    onKeyDown={e => {
                      if (e.key === 'Enter') void applyArenaPassword(arena.number);
                    }}
                  />
                  <button
                    className="btn-copy"
                    title={t('rsm.set_pwd')}
                    onClick={() => void applyArenaPassword(arena.number)}
                  >
                    ✓
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {isExpert && (
          <>
            {/* Note d'organisation */}
            <OrgNotePanel competitionId={competition.id} />
          </>
        )}

        {isExpert && (
          <>
            {/* ── Thème global ── */}
            {(() => {
              const filteredForSection = savedThemes.filter(
                t => (t.targetType ?? 'arena') === globalThemeSection
              );
              if (savedThemes.length === 0) return null;
              return (
                <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
                  <div className="arena-url-header">
                    <strong>{t('rsm.global_theme')}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: '0.25rem',
                    }}
                  >
                    <select
                      value={globalThemeSection}
                      onChange={e => {
                        setGlobalThemeSection(e.target.value as typeof globalThemeSection);
                        setGlobalThemeId('');
                      }}
                      style={{
                        padding: '0.35rem 0.5rem',
                        borderRadius: '0.3rem',
                        border: '1px solid #475569',
                        background: '#1e293b',
                        color: '#e2e8f0',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value="arena">{t('rsm.gt_arena')}</option>
                      <option value="kiosk">{t('rsm.gt_kiosk')}</option>
                      <option value="public">{t('rsm.gt_public')}</option>
                      <option value="referee">{t('rsm.gt_referee')}</option>
                      <option value="pool">{t('rsm.gt_pool')}</option>
                    </select>
                    <select
                      value={globalThemeId}
                      onChange={e => setGlobalThemeId(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        padding: '0.35rem 0.5rem',
                        borderRadius: '0.3rem',
                        border: '1px solid #475569',
                        background: '#1e293b',
                        color: '#e2e8f0',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value="">{t('rsm.choose_theme')}</option>
                      {filteredForSection.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      disabled={!globalThemeId}
                      onClick={() => void handleGlobalThemeApply()}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {t('rsm.apply_all')}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {isExpert && (
          <DisplayOptionsPanel
            competitionId={competition.id}
            displayTheme={displayTheme}
            setDisplayTheme={setDisplayTheme}
            arenaWallpaper={arenaWallpaper}
            setArenaWallpaper={setArenaWallpaper}
            kioskViews={kioskViews}
            setKioskViews={setKioskViews}
          />
        )}

        {isExpert && (
          <>
            <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
              <div className="arena-url-header">
                <strong>{t('rsm.overlay_card')}</strong>
              </div>
              <OBSOverlayConfig serverUrl={serverUrl} arenaCount={arenaCount} />
            </div>
          </>
        )}

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header u-row-between">
            <strong>{t('rsm.kiosk_card')}</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <select
                className="form-input"
                style={{ width: 'auto', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                value={kioskTheme ? '' : kioskPreset}
                onChange={e => applyKioskPreset(e.target.value as KioskPreset)}
                title={t('rsm.kiosk_look')}
                aria-label={t('rsm.kiosk_look')}
              >
                {kioskTheme && <option value="">{t('rsm.custom')}</option>}
                <option value="default">{t('rsm.opt_dark')}</option>
                <option value="neon">{t('rsm.opt_neon')}</option>
                <option value="light">{t('rsm.opt_light')}</option>
              </select>
              <button
                title={t('rsm.kiosk_custom_theme')}
                className={`arena-theme-btn ${kioskTheme ? 'active' : ''}`}
                onClick={() => setKioskThemeEditorOpen(true)}
              >
                {t('rsm.theme_btn')}
              </button>
            </div>
          </div>
          <UrlCopyRow
            url={kioskUrl}
            id={999}
            copiedIndex={copiedIndex}
            onCopy={copyToClipboard}
            onQr={() => setActiveQR({ url: kioskUrl, label: t('rsm.kiosk_qr') })}
          />
        </div>

        {isExpert && (
          <>
            <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
              <div className="arena-url-header">
                <strong>{t('rsm.checkin_card')}</strong>
              </div>
              <UrlCopyRow
                url={checkinUrl}
                id={996}
                copiedIndex={copiedIndex}
                onCopy={copyToClipboard}
                onQr={() => setActiveQR({ url: checkinUrl, label: t('rsm.checkin_qr') })}
              />
              <div className="arena-url-row">
                <span className="arena-url-label">{t('rsm.pwd')}</span>
                <input
                  type="password"
                  className="arena-password-input"
                  placeholder={t('rsm.checkin_pwd_placeholder')}
                  value={checkinPassword}
                  onChange={e => setCheckinPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') applyCheckinPassword();
                  }}
                />
                <button
                  className="btn-copy"
                  title={t('rsm.set_pwd')}
                  onClick={applyCheckinPassword}
                >
                  ✓
                </button>
              </div>
            </div>
          </>
        )}

        {trainerEnabled && (
          <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
            <div className="arena-url-header">
              <strong>{t('rsm.trainer_card')}</strong>
            </div>
            <UrlCopyRow
              url={trainerUrl}
              id={995}
              copiedIndex={copiedIndex}
              onCopy={copyToClipboard}
              onQr={() => setActiveQR({ url: trainerUrl, label: t('rsm.trainers') })}
            />
            <div className="arena-url-row">
              <span className="arena-url-label">{t('rsm.pwd')}</span>
              <input
                type="password"
                className="arena-password-input"
                placeholder={t('rsm.trainer_pwd_placeholder')}
                value={trainerPassword}
                onChange={e => setTrainerPassword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') applyTrainerPassword();
                }}
              />
              <button className="btn-copy" title={t('rsm.set_pwd')} onClick={applyTrainerPassword}>
                ✓
              </button>
            </div>
            <div className="arena-url-row">
              <Button size="sm" onClick={exportTrainerComments}>
                {t('rsm.trainer_pdf')}
              </Button>
            </div>
          </div>
        )}

        {isExpert && (
          <>
            <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
              <div className="arena-url-header">
                <strong>{t('rsm.lobby_card')}</strong>
              </div>
              <UrlCopyRow
                url={lobbyUrl}
                id={997}
                copiedIndex={copiedIndex}
                onCopy={copyToClipboard}
                onQr={() => setActiveQR({ url: lobbyUrl, label: t('rsm.lobby_qr') })}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Section : Écrans connectés (+ modale kiosk) ── */}
      <ConnectedScreensPanel competitionId={competition.id} isRemoteActive={isRemoteActive} />

      {themeEditorTarget && (
        <ThemeEditor
          targetArenaId={themeEditorTarget}
          targetType={themeEditorScreenType}
          initialTheme={
            themeEditorScreenType === 'arena'
              ? arenaThemes[themeEditorTarget]?.customTheme
              : arenaThemes[themeEditorTarget]?.screenThemes?.[
                  themeEditorScreenType as 'public' | 'referee' | 'pool'
                ]
          }
          onApply={async (arenaId, theme) => {
            if (themeEditorScreenType === 'arena') {
              await handleArenaThemeChange(arenaId, 'custom', theme);
            } else {
              await handleArenaScreenThemeChange(
                arenaId,
                themeEditorScreenType as 'public' | 'referee' | 'pool',
                theme
              );
            }
            setThemeEditorTarget(null);
            showToast(t('rsm.custom_theme_applied'), 'success');
          }}
          onClose={() => {
            setThemeEditorTarget(null);
            refreshSavedThemes();
          }}
        />
      )}

      {kioskThemeEditorOpen && (
        <ThemeEditor
          targetArenaId="kiosk"
          targetType="kiosk"
          initialTheme={kioskTheme}
          onApply={async (_arenaId, theme) => {
            const result = await applyKioskCustomTheme(theme);
            setKioskThemeEditorOpen(false);
            if (result?.success) {
              showToast(t('rsm.kiosk_theme_applied'), 'success');
            } else {
              showToast(ipcErrorText(t, result, t('rsm.kiosk_theme_error')), 'error');
            }
          }}
          onClose={() => {
            setKioskThemeEditorOpen(false);
            refreshSavedThemes();
          }}
        />
      )}

      {activeQR &&
        createPortal(
          <div className="qr-popup-overlay" onClick={() => setActiveQR(null)}>
            <div className="qr-popup" onClick={e => e.stopPropagation()}>
              <strong>{activeQR.label}</strong>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={t('rsm.qr_code')} width={220} height={220} />
              ) : (
                <div style={RSM_STYLES.qrSpinner}>{t('rsm.generating')}</div>
              )}
              <code style={RSM_STYLES.qrCode}>{activeQR.url}</code>
              <Button onClick={() => setActiveQR(null)}>{t('rsm.close')}</Button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default React.memo(RemoteScoreManager);
