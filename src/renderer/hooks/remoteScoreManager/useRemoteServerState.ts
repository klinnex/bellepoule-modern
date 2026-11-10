/**
 * BellePoule Modern - État du serveur de saisie distante : session, réseau, pistes, thèmes et synchronisation
 * Licensed under GPL-3.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useStateGroup } from '../useStateGroup';
import { useArenaThemes } from '../../components/remote/useArenaThemes';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from '../../components/Toast';
import { useRemoteNetworkSettings } from '../useRemoteNetworkSettings';
import { useTranslation } from '../useTranslation';
import { ipcErrorText } from '../../services/ipcError';
import { computePoolStrips } from '../../../shared/utils/poolStrips';
import { buildSessionMatches } from '../../components/remote/sessionMatches';
import { useStripAvailability } from '../useStripAvailability';
import { normalizeStripRange } from '../../../shared/utils/stripRange';
import { useRemoteViewMode } from '../../components/remote/remoteViewMode';
import { useKioskTheme, type KioskPreset } from '../useKioskTheme';
import {
  RemoteScoreManagerProps,
  RemoteSession,
  deMatchesKey,
} from '../../components/remote/remoteScoreManagerShared';

type Ctx = RemoteScoreManagerProps;

/** État du serveur de saisie distante : session, réseau, pistes, thèmes et synchronisation (extrait de RemoteScoreManager, #1599) */
export function useRemoteServerState(ctx: Ctx) {
  const {
    competition,
    pools,
    tableauMatches,
    consolationBrackets,
    onArenaCountChange,
    onStripStartChange,
    onStartRemote,
    onStopRemote,
    onServerStarted,
    isRemoteActive = false,
    initialStripCount,
    initialStripStart,
    isVisible = false,
  } = ctx;

  const [mode, setMode] = useRemoteViewMode(competition.id);
  const isExpert = mode === 'expert';
  const { showToast } = useToast();
  const { t } = useTranslation();
  const unavailableStrips = useStripAvailability(s => s.unavailable);
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>('');
  const {
    useHttps,
    setUseHttps,
    certFingerprint,
    setCertFingerprint,
    remotePort,
    setRemotePort,
    networkInterfaces,
    selectedInterface,
    setSelectedInterface,
  } = useRemoteNetworkSettings(competition.id);
  // Compteurs d'arènes, QR, mots de passe par arène et affichage des écrans (#1241)
  const {
    // pendingCount : valeur affichée (modifiée par +/−, non encore appliquée)
    pendingStart,
    setPendingStart,
    committedStart,
    setCommittedStart,
    pendingCount,
    setPendingCount,
    // committedCount : valeur appliquée au serveur ou confirmée par l'utilisateur
    committedCount,
    setCommittedCount,
    copiedIndex,
    setCopiedIndex,
    activeQR,
    setActiveQR,
    arenaPasswords,
    setArenaPasswords,
    checkinPassword,
    setCheckinPassword,
    qrDataUrl,
    setQrDataUrl,
    showPhotos,
    setShowPhotos,
    cardAnnounce,
    setCardAnnounce,
  } = useStateGroup({
    pendingStart: null as number | null,
    committedStart: null as number | null,
    pendingCount: null as number | null,
    committedCount: null as number | null,
    copiedIndex: null as number | null,
    activeQR: null as { url: string; label: string } | null,
    arenaPasswords: {} as Record<string, string>,
    checkinPassword: '',
    qrDataUrl: null as string | null,
    showPhotos: false,
    cardAnnounce: false,
  });
  // Thèmes, kiosque et éditeur de thème : état et actions (#1241)
  const {
    displayTheme,
    setDisplayTheme,
    arenaWallpaper,
    setArenaWallpaper,
    kioskViews,
    setKioskViews,
    arenaThemes,
    arenaScreenTab,
    setArenaScreenTab,
    themeEditorTarget,
    setThemeEditorTarget,
    themeEditorScreenType,
    setThemeEditorScreenType,
    showArenaQrModal,
    setShowArenaQrModal,
    savedThemes,
    globalThemeSection,
    setGlobalThemeSection,
    globalThemeId,
    setGlobalThemeId,
    handleArenaThemeChange,
    handleArenaScreenThemeChange,
    handleClearArenaThemeOverride,
    handleClearArenaScreenTheme,
    refreshSavedThemes,
  } = useArenaThemes({ competitionId: competition.id, hasSession: !!session });
  const {
    kioskTheme,
    kioskPreset,
    kioskThemeEditorOpen,
    setKioskThemeEditorOpen,
    applyKioskPreset: applyKioskPresetRaw,
    applyKioskCustomTheme,
  } = useKioskTheme(competition.id);
  const applyKioskPreset = async (preset: KioskPreset) => {
    const result = await applyKioskPresetRaw(preset, !!session);
    if (!result?.success) showToast(ipcErrorText(t, result, 'Erreur thème kiosk'), 'error');
  };

  useEffect(() => {
    if (!activeQR) {
      setQrDataUrl(null);
      return;
    }
    import('qrcode')
      .then(m => m.default.toDataURL(activeQR.url, { width: 220, margin: 1 }))
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [activeQR]);

  // Initialisation : priorité localStorage → initialStripCount (parent) → nombre de poules
  useEffect(() => {
    if (pendingCount !== null) return;
    const lsKey = `bellepoule-remote-strips-${competition.id}`;
    const lsSaved = localStorage.getItem(lsKey);
    const initial = lsSaved
      ? parseInt(lsSaved, 10)
      : (initialStripCount ?? (pools.length > 0 ? pools.length : 1));
    const startSaved = parseInt(
      localStorage.getItem(`bellepoule-remote-strip-start-${competition.id}`) ?? '',
      10
    );
    const initStart = Number.isFinite(startSaved) ? startSaved : (initialStripStart ?? 1);
    const range = normalizeStripRange(initStart, Math.max(initial, initStart));
    setPendingStart(range.start);
    setCommittedStart(range.start);
    setPendingCount(range.end);
    setCommittedCount(range.end);
  }, [initialStripCount, pools.length, competition.id]);

  const effectivePending = pendingCount ?? pools.length ?? 1;
  const effectiveCommitted = committedCount ?? pools.length ?? 1;
  const effectivePendingStart = pendingStart ?? 1;
  const effectiveCommittedStart = committedStart ?? 1;
  const hasPendingChanges =
    effectivePending !== effectiveCommitted || effectivePendingStart !== effectiveCommittedStart;

  // Poules générées après le démarrage de la saisie distante ou piste modifiée :
  // réassigner les poules aux pistes côté serveur (#1037)
  const sessionPoolsLayoutRef = useRef<string>('');
  useEffect(() => {
    const layout = pools.map(p => `${p.id}@${p.strip ?? ''}`).join('|');
    if (!isRemoteActive || !session) {
      sessionPoolsLayoutRef.current = layout;
      return;
    }
    if (layout === sessionPoolsLayoutRef.current) return;
    sessionPoolsLayoutRef.current = layout;
    const stripMap = computePoolStrips(
      pools,
      effectiveCommitted,
      effectiveCommittedStart,
      unavailableStrips
    );
    const poolsData = pools.map(pool => ({
      poolId: pool.id,
      poolNumber: pool.number,
      strip: stripMap.get(pool.id) ?? pool.strip ?? null,
      fencers: pool.fencers ?? [],
      matches: pool.matches ?? [],
    }));
    window.electronAPI.remote.assignPools?.(competition.id, poolsData).catch((err: unknown) => {
      logger.warn(LogCategory.NETWORK, 'Échec assignPools', err instanceof Error ? err : undefined);
    });
  }, [pools, isRemoteActive, session]);

  // Cache poolFencersCache du serveur resynchronisé si les poules changent en session
  const sessionPoolsFingerprintRef = useRef<string>('');
  useEffect(() => {
    const fingerprint = pools
      .map(p => `${p.id}:${(p.fencers ?? []).map((f: any) => f.id).join(',')}`)
      .join('|');
    if (!isRemoteActive || !session) {
      sessionPoolsFingerprintRef.current = fingerprint;
      return;
    }
    if (fingerprint === sessionPoolsFingerprintRef.current) return;
    sessionPoolsFingerprintRef.current = fingerprint;
    const updates = pools.map(pool => ({ poolId: pool.id, fencers: pool.fencers ?? [] }));
    window.electronAPI.remote.updatePoolFencers(competition.id, updates).catch((err: unknown) => {
      logger.warn(
        LogCategory.NETWORK,
        'Échec updatePoolFencers',
        err instanceof Error ? err : undefined
      );
    });
  }, [pools, isRemoteActive, session]);

  // Quand les résultats de matchs de poule changent dans le logiciel, synchroniser le serveur distant
  const sessionMatchesFingerprintRef = useRef<string>('');
  useEffect(() => {
    const fingerprint = pools
      .map(
        p =>
          `${p.id}:${(p.matches ?? []).map((m: any) => `${m.id}=${m.status}|${m.scoreA ?? ''}-${m.scoreB ?? ''}|${m.refereeId ?? ''}`).join(',')}`
      )
      .join('|');
    if (!isRemoteActive || !session) {
      sessionMatchesFingerprintRef.current = fingerprint;
      return;
    }
    if (fingerprint === sessionMatchesFingerprintRef.current) return;
    sessionMatchesFingerprintRef.current = fingerprint;
    const poolsData = pools.map(pool => ({
      poolId: pool.id,
      matches: (pool.matches ?? []).map((m: any) => ({ ...m, poolNumber: pool.number })),
    }));
    window.electronAPI.remote.syncPoolMatches(competition.id, poolsData).catch((err: unknown) => {
      logger.warn(
        LogCategory.NETWORK,
        'Échec syncPoolMatches',
        err instanceof Error ? err : undefined
      );
    });
  }, [pools, isRemoteActive, session]);

  // Quand les matchs tableau changent pendant une session active, mettre à jour le serveur
  // sans avoir à arrêter/relancer la saisie distante (transition poules → tableau).
  const prevDeMatchesKeyRef = useRef<string>('');
  const pendingDeMatches = useMemo(
    () =>
      [...(tableauMatches || []), ...(consolationBrackets || []).flatMap(b => b.matches || [])]
        .filter(m => m.winner === null && m.fencerA && m.fencerB)
        .map(m => ({ ...m, isTableau: true })),
    [tableauMatches, consolationBrackets]
  );
  useEffect(() => {
    if (!isRemoteActive || !session) return;
    // NB : on envoie aussi la liste VIDE quand le dernier match DE vient d'être terminé
    // (ex. finale saisie dans l'appli alors qu'elle était assignée à une piste). Sans ça,
    // le serveur garde le match terminé sur la piste / en file d'attente et peut le
    // renvoyer (0-0) plus tard, écrasant le vainqueur (#909). Le ref initial vaut '' :
    // aucun envoi tant qu'aucun match DE n'a jamais existé.
    // Arbitres inclus dans la clé : un changement d'arbitre est renvoyé à la tablette (#977)
    const key = deMatchesKey(pendingDeMatches);
    if (key === prevDeMatchesKeyRef.current) return;
    prevDeMatchesKeyRef.current = key;
    window.electronAPI.remote
      .refreshDeMatches(competition.id, pendingDeMatches)
      .catch((err: unknown) => {
        logger.warn(
          LogCategory.NETWORK,
          'Échec refreshDeMatches',
          err instanceof Error ? err : undefined
        );
      });
  }, [pendingDeMatches, isRemoteActive, session]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isRemoteActive) return;
    // Si une session est déjà active (retour sur l'onglet après navigation), on reconnecte
    // sans redémarrer le serveur pour ne pas perdre l'état des pistes configurées.
    window.electronAPI.remote.getSession(competition.id).then(async (result: any) => {
      if (result.success && result.session) {
        // Récupérer l'IP réseau réelle (éviter localhost)
        const info = await window.electronAPI.remote.getServerInfo(competition.id);
        if (info.success && info.serverInfo) {
          setServerUrl(info.serverInfo.url);
          setCertFingerprint(info.serverInfo.certFingerprint ?? null);
        }
        setSession(result.session);
        const existingCount = result.session.strips.length;
        setPendingCount(existingCount);
        setCommittedCount(existingCount);
      } else {
        startRemoteServer();
      }
    });
  }, [isRemoteActive]);

  const startRemoteServer = async () => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.remote.startServer(
        competition.id,
        remotePort,
        selectedInterface,
        useHttps
      );

      if (result.success && result.serverInfo) {
        if (result.serverInfo.port !== remotePort) {
          setRemotePort(result.serverInfo.port);
          localStorage.setItem(
            `bellepoule-remote-port-${competition.id}`,
            String(result.serverInfo.port)
          );
        }
        setServerUrl(result.serverInfo.url);
        setCertFingerprint(result.serverInfo.certFingerprint ?? null);
        onServerStarted?.(result.serverInfo.url);
        await startSession(result.serverInfo.url, effectivePending);
      } else {
        showToast(`Erreur: ${ipcErrorText(t, result, 'Échec du démarrage')}`, 'error');
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to start remote server', error as Error);
      showToast('Impossible de démarrer le serveur distant', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const startSession = async (baseUrl: string, count: number) => {
    try {
      const { poolMatches, deMatches, allMatches } = buildSessionMatches(
        pools,
        [...(tableauMatches || []), ...(consolationBrackets || []).flatMap(b => b.matches || [])],
        computePoolStrips(pools, count, effectiveCommittedStart, unavailableStrips)
      );
      logger.debug(LogCategory.UI, '[RemoteScoreManager] Passing matches to server', {
        pool: poolMatches.length,
        de: deMatches.length,
      });
      const result = await window.electronAPI.remote.startSession(
        competition.id,
        count,
        allMatches,
        showPhotos,
        kioskViews,
        cardAnnounce
      );
      if (result.success && result.session) {
        setSession(result.session);
        if (kioskPreset !== 'default') {
          window.electronAPI.remote
            .updateKioskTheme(competition.id, { '--k-preset': kioskPreset })
            .catch(() => {});
        }
        // Le serveur peut étendre le nombre de pistes (poule assignée au-delà du nombre configuré)
        const effectiveCount = result.session.strips?.length || count;
        setPendingCount(effectiveCount);
        setCommittedCount(effectiveCount);
        onArenaCountChange?.(effectiveCount);
        showToast('Saisie distante démarrée', 'success');
        // Synchroniser le webhook URL configuré vers le serveur qui vient de démarrer
        const savedWebhook = localStorage.getItem('bellepoule-webhook-url');
        if (savedWebhook) {
          window.electronAPI.remote.setWebhookUrl?.(savedWebhook).catch(() => {});
        }
        // Envoyer les matchs DE avec leurs pistes au serveur (la clé ref est déjà stockée
        // avant que session/isRemoteActive soient prêts, donc l'effet ne se déclenche pas).
        if (deMatches.length > 0) {
          await window.electronAPI.remote.refreshDeMatches(competition.id, deMatches);
          prevDeMatchesKeyRef.current = deMatchesKey(deMatches);
        }
      } else {
        showToast(`Erreur session: ${ipcErrorText(t, result)}`, 'error');
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to start session', error as Error);
    }
  };

  return {
    competition,
    onArenaCountChange,
    onStripStartChange,
    onStartRemote,
    onStopRemote,
    isRemoteActive,
    isVisible,
    mode,
    setMode,
    isExpert,
    showToast,
    t,
    unavailableStrips,
    session,
    setSession,
    isLoading,
    setIsLoading,
    serverUrl,
    setServerUrl,
    useHttps,
    setUseHttps,
    certFingerprint,
    remotePort,
    setRemotePort,
    networkInterfaces,
    selectedInterface,
    setSelectedInterface,
    setPendingStart,
    setCommittedStart,
    setPendingCount,
    setCommittedCount,
    copiedIndex,
    setCopiedIndex,
    activeQR,
    setActiveQR,
    arenaPasswords,
    setArenaPasswords,
    checkinPassword,
    setCheckinPassword,
    qrDataUrl,
    showPhotos,
    setShowPhotos,
    cardAnnounce,
    setCardAnnounce,
    displayTheme,
    setDisplayTheme,
    arenaWallpaper,
    setArenaWallpaper,
    kioskViews,
    setKioskViews,
    arenaThemes,
    arenaScreenTab,
    setArenaScreenTab,
    themeEditorTarget,
    setThemeEditorTarget,
    themeEditorScreenType,
    setThemeEditorScreenType,
    showArenaQrModal,
    setShowArenaQrModal,
    savedThemes,
    globalThemeSection,
    setGlobalThemeSection,
    globalThemeId,
    setGlobalThemeId,
    handleArenaThemeChange,
    handleArenaScreenThemeChange,
    handleClearArenaThemeOverride,
    handleClearArenaScreenTheme,
    refreshSavedThemes,
    kioskTheme,
    kioskPreset,
    kioskThemeEditorOpen,
    setKioskThemeEditorOpen,
    applyKioskCustomTheme,
    applyKioskPreset,
    effectivePending,
    effectiveCommitted,
    effectivePendingStart,
    effectiveCommittedStart,
    hasPendingChanges,
  };
}
