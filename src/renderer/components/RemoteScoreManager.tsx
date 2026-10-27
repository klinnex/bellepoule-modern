/**
 * BellePoule Modern - Remote Score Management Component
 * Interface for managing remote score entry
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { Competition, FencerStatus, Pool } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { TableauMatch, ConsolationBracket } from './tableau/tableauTypes';
import { useToast } from './Toast';
import ThemeEditor from './ThemeEditor';
import ArenaQrCodesModal from './ArenaQrCodesModal';
import { OBSOverlayConfig } from './OBSOverlayConfig';
import { OrgNotePanel } from './remote/OrgNotePanel';
import { ConnectedScreensPanel } from './remote/ConnectedScreensPanel';
import { useRemoteNetworkSettings } from '../hooks/useRemoteNetworkSettings';
import { CustomTheme, DisplayTheme } from '../../shared/types/remote';
import { useTranslation } from '../hooks/useTranslation';
import { ipcErrorText } from '../services/ipcError';
import { useKioskTheme, type KioskPreset } from '../hooks/useKioskTheme';

interface RemoteScoreManagerProps {
  competition: Competition;
  pools: Pool[];
  tableauMatches?: TableauMatch[];
  consolationBrackets?: ConsolationBracket[];
  onArenaCountChange?: (count: number) => void;
  onStartRemote: () => void;
  onStopRemote: () => void;
  /** Serveur démarré et joignable (IPC utilisables) */
  onServerStarted?: (url: string) => void;
  isRemoteActive?: boolean;
  initialStripCount?: number;
  isVisible?: boolean;
}

interface RemoteSession {
  competitionId: string;
  strips: Array<{
    number: number;
    status: 'available' | 'occupied' | 'maintenance';
    currentMatch?: any;
    assignedReferee?: string;
  }>;
  isRunning: boolean;
  startTime?: Date;
}

// ─── Static style constants ───────────────────────────────────────────────────

const RSM_STYLES = {
  httpWarning: {
    fontSize: '0.78rem',
    color: 'var(--warning-color, #f59e0b)',
    margin: '0.25rem 0 0',
    lineHeight: 1.4,
  } satisfies React.CSSProperties,
  stripCountControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  } satisfies React.CSSProperties,
  stripCountBtn: { padding: '0.2rem 0.5rem', fontSize: '1rem' } satisfies React.CSSProperties,
  stripCountSave: { padding: '0.2rem 0.6rem' } satisfies React.CSSProperties,
  stripCountPending: {
    color: 'var(--warning-color, orange)',
    fontSize: '0.85rem',
  } satisfies React.CSSProperties,
  stripCountStrong: {
    minWidth: '1.5rem',
    textAlign: 'center' as const,
  } satisfies React.CSSProperties,
  kioskViewsSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  kioskViewsTitle: {
    fontSize: '0.875rem',
    marginBottom: '0.25rem',
    color: 'inherit',
  } satisfies React.CSSProperties,
  interfaceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0',
  } satisfies React.CSSProperties,
  interfaceLabel: { whiteSpace: 'nowrap' as const } satisfies React.CSSProperties,
  portRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0',
  } satisfies React.CSSProperties,
  portInput: { width: '80px' } satisfies React.CSSProperties,
  portHint: { fontSize: '0.8rem', opacity: 0.6 } satisfies React.CSSProperties,
  portActiveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.25rem',
  } satisfies React.CSSProperties,
  portActiveLabel: {
    whiteSpace: 'nowrap' as const,
    fontSize: '0.875rem',
  } satisfies React.CSSProperties,
  portActiveInput: { width: '75px' } satisfies React.CSSProperties,
  portActiveBtn: { fontSize: '0.8rem', padding: '0.2rem 0.5rem' } satisfies React.CSSProperties,
  themeSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  themeTitle: {
    fontSize: '0.875rem',
    marginBottom: '0.4rem',
    color: 'inherit',
  } satisfies React.CSSProperties,
  themeRow: { display: 'flex', gap: '0.5rem' } satisfies React.CSSProperties,
  wallpaperSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  wallpaperTitle: {
    fontSize: '0.875rem',
    marginBottom: '0.4rem',
    color: 'inherit',
  } satisfies React.CSSProperties,
  wallpaperRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  } satisfies React.CSSProperties,
  wallpaperImg: {
    width: 80,
    height: 45,
    objectFit: 'cover' as const,
    borderRadius: '0.25rem',
    border: '1px solid #475569',
  } satisfies React.CSSProperties,
  wallpaperImportLabel: {
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.8rem',
  } satisfies React.CSSProperties,
  wallpaperHiddenInput: { display: 'none' } satisfies React.CSSProperties,
  wallpaperDeleteBtn: {
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#f87171',
    cursor: 'pointer',
    fontSize: '0.8rem',
  } satisfies React.CSSProperties,
  pisteresumeSummary: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'var(--color-bg)',
    borderRadius: '8px',
  } satisfies React.CSSProperties,
  pisteresumeFlex: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  } satisfies React.CSSProperties,
  qrSpinner: {
    width: 220,
    height: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } satisfies React.CSSProperties,
  qrCode: {
    fontSize: '0.75rem',
    wordBreak: 'break-all' as const,
    textAlign: 'center' as const,
  } satisfies React.CSSProperties,
  kioskCard: { marginTop: '1rem' } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

/** Clé de synchro des matchs DE : id + arbitre(s) assigné(s) */
function deMatchesKey(
  matches: Array<{ id: string; referee?: { id: string } | null; referees?: Array<{ id: string }> }>
): string {
  return matches
    .map(
      m =>
        `${m.id}:${(m.referees?.length ? m.referees : m.referee ? [m.referee] : []).map(r => r.id).join('+')}`
    )
    .join(',');
}

const RemoteScoreManager: React.FC<RemoteScoreManagerProps> = ({
  competition,
  pools,
  tableauMatches,
  consolationBrackets,
  onArenaCountChange,
  onStartRemote,
  onStopRemote,
  onServerStarted,
  isRemoteActive = false,
  initialStripCount,
  isVisible = false,
}) => {
  const { showToast } = useToast();
  const { t } = useTranslation();
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
  // pendingCount : valeur affichée (modifiée par +/−, non encore appliquée)
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  // committedCount : valeur appliquée au serveur ou confirmée par l'utilisateur
  const [committedCount, setCommittedCount] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeQR, setActiveQR] = useState<{ url: string; label: string } | null>(null);
  const [arenaPasswords, setArenaPasswords] = useState<Record<string, string>>({});
  const [checkinPassword, setCheckinPassword] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [cardAnnounce, setCardAnnounce] = useState(false);
  const [displayTheme, setDisplayTheme] = useState<'dark' | 'light' | 'neon' | 'unicorn'>('dark');
  const [arenaWallpaper, setArenaWallpaper] = useState<string | null>(null);
  const [kioskViews, setKioskViews] = useState({
    poules: true,
    classement: true,
    direct: true,
    suivants: true,
  });
  // Thèmes par arène : arenaId → { theme, customTheme?, screenThemes }
  const [arenaThemes, setArenaThemes] = useState<
    Record<
      string,
      {
        theme: DisplayTheme;
        customTheme?: CustomTheme;
        screenThemes: Partial<Record<'public' | 'referee' | 'pool', CustomTheme>>;
      }
    >
  >({});
  // Onglet de type d'écran sélectionné par arène
  const [arenaScreenTab, setArenaScreenTab] = useState<
    Record<string, 'arena' | 'public' | 'referee' | 'pool'>
  >({});
  // Éditeur de thème (arène + type d'écran)
  const [themeEditorTarget, setThemeEditorTarget] = useState<string | null>(null);
  const [themeEditorScreenType, setThemeEditorScreenType] = useState<
    'arena' | 'public' | 'referee' | 'pool'
  >('arena');
  const [showArenaQrModal, setShowArenaQrModal] = useState(false);
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
  // Thèmes sauvegardés (depuis IPC)
  const [savedThemes, setSavedThemes] = useState<CustomTheme[]>([]);
  // Sélecteur de thème global
  const [globalThemeSection, setGlobalThemeSection] = useState<
    'arena' | 'kiosk' | 'public' | 'referee' | 'pool'
  >('arena');
  const [globalThemeId, setGlobalThemeId] = useState('');

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
    setPendingCount(initial);
    setCommittedCount(initial);
  }, [initialStripCount, pools.length, competition.id]);

  const effectivePending = pendingCount ?? pools.length ?? 1;
  const effectiveCommitted = committedCount ?? pools.length ?? 1;
  const hasPendingChanges = effectivePending !== effectiveCommitted;

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
    const poolsData = pools.map(pool => ({
      poolId: pool.id,
      poolNumber: pool.number,
      strip: pool.strip ?? null,
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
      // Prepend fencer-order markers so the server can rebuild poolFencersCache correctly.
      // The FIE match order for 4-fencer pools starts with [1,4] not [1,2], so naively
      // extracting fencers from match pairs produces the wrong order.
      const sortedPools = [...pools].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      const poolMatches = sortedPools.flatMap(pool => [
        {
          __poolFencers: true,
          poolId: pool.id,
          poolNumber: pool.number,
          strip: pool.strip,
          fencers: pool.fencers || [],
        },
        ...(pool.matches || []),
      ]);
      const deMatches = [
        ...(tableauMatches || []),
        ...(consolationBrackets || []).flatMap(b => b.matches || []),
      ]
        .filter(m => m.winner === null && m.fencerA && m.fencerB)
        .map(m => ({ ...m, isTableau: true }));
      const allMatches = [...poolMatches, ...deMatches];
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

  const handleSaveStripCount = async () => {
    const newCount = effectivePending;
    if (newCount < 1 || newCount > 20) return;

    if (session) {
      // Serveur actif : appliquer via IPC
      try {
        const result = await window.electronAPI.remote.updateStripCount(competition.id, newCount);
        if (result.success && result.session) {
          setSession(result.session);
          setCommittedCount(newCount);
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

  // Mot de passe commun : appliqué à toutes les pistes, y compris celles ajoutées ensuite (#988)
  const [commonArenaPassword, setCommonArenaPassword] = useState('');
  const [appliedCommonPassword, setAppliedCommonPassword] = useState<string | null>(null);

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
    const numbers = Array.from({ length: arenaCount }, (_, i) => i + 1);
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
  const [trainerPassword, setTrainerPassword] = useState('');
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

  // Appliquer un thème (prédéfini ou custom) à une arène — affichage principal
  const handleArenaThemeChange = useCallback(
    async (arenaId: string, theme: DisplayTheme, customTheme?: CustomTheme) => {
      setArenaThemes(prev => ({
        ...prev,
        [arenaId]: { ...(prev[arenaId] ?? { screenThemes: {} }), theme, customTheme },
      }));
      if (session) {
        await window.electronAPI.remote.updateArenaTheme(
          competition.id,
          arenaId,
          theme,
          customTheme
        );
      }
    },
    [session]
  );

  // Appliquer un thème custom à un type d'écran spécifique d'une arène
  const handleArenaScreenThemeChange = useCallback(
    async (
      arenaId: string,
      screenType: 'public' | 'referee' | 'pool',
      customTheme?: CustomTheme
    ) => {
      setArenaThemes(prev => {
        const existing = prev[arenaId] ?? { theme: 'dark' as DisplayTheme, screenThemes: {} };
        return {
          ...prev,
          [arenaId]: {
            ...existing,
            screenThemes: { ...existing.screenThemes, [screenType]: customTheme },
          },
        };
      });
      if (session) {
        await window.electronAPI.remote.updateArenaScreenTheme(
          competition.id,
          arenaId,
          screenType,
          customTheme
        );
      }
    },
    [session]
  );

  // Supprimer le verrou de thème d'une arène (retour au thème global)
  const handleClearArenaThemeOverride = useCallback(
    async (arenaId: string) => {
      setArenaThemes(prev => {
        const next = { ...prev };
        delete next[arenaId];
        return next;
      });
      if (session) {
        await window.electronAPI.remote.clearArenaThemeOverride(competition.id, arenaId);
      }
    },
    [session, competition.id]
  );

  // Supprimer le verrou de thème d'écran d'une arène
  const handleClearArenaScreenTheme = useCallback(
    async (arenaId: string, screenType: 'public' | 'referee' | 'pool') => {
      await handleArenaScreenThemeChange(arenaId, screenType, undefined);
    },
    [handleArenaScreenThemeChange]
  );

  // Charger tous les thèmes depuis l'app (+ migration one-shot depuis localStorage)
  const refreshSavedThemes = useCallback(() => {
    window.electronAPI.themes
      .list()
      .then(setSavedThemes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const MIGRATION_KEY = 'bp-themes-migrated-v1';
    if (!localStorage.getItem(MIGRATION_KEY)) {
      try {
        const raw = localStorage.getItem('bellepoule-custom-themes');
        if (raw) {
          const old: CustomTheme[] = JSON.parse(raw);
          Promise.all(
            old.map(t =>
              window.electronAPI.themes.save({ ...t, targetType: t.targetType ?? 'arena' })
            )
          )
            .then(() => {
              localStorage.setItem(MIGRATION_KEY, '1');
              refreshSavedThemes();
            })
            .catch(() => {});
        } else {
          localStorage.setItem(MIGRATION_KEY, '1');
        }
      } catch {
        localStorage.setItem(MIGRATION_KEY, '1');
      }
    }
    refreshSavedThemes();
  }, [refreshSavedThemes]);

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
      for (let i = 1; i <= count; i++) {
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

  const arenaUrls = Array.from({ length: arenaCount }, (_, i) => ({
    number: i + 1,
    refereeUrl: `${serverUrl}/arene${i + 1}/arbitre`,
    displayUrl: `${serverUrl}/arene${i + 1}`,
    poolUrl: `${serverUrl}/arene${i + 1}/poule`,
    matchOrderUrl: `${serverUrl}/arene${i + 1}/matchs`,
    publicUrl: `${serverUrl}/arene${i + 1}/public`,
    overlayUrl: `${serverUrl}/arene${i + 1}/overlay`,
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
      <button
        className="btn btn-secondary"
        onClick={() => setPendingCount(Math.max(1, effectivePending - 1))}
        disabled={effectivePending <= 1 || isLoading}
        style={RSM_STYLES.stripCountBtn}
      >
        −
      </button>
      <strong style={RSM_STYLES.stripCountStrong}>{effectivePending}</strong>
      <button
        className="btn btn-secondary"
        onClick={() => setPendingCount(Math.min(20, effectivePending + 1))}
        disabled={effectivePending >= 20 || isLoading}
        style={RSM_STYLES.stripCountBtn}
      >
        +
      </button>
      {hasPendingChanges && (
        <span style={RSM_STYLES.stripCountPending} title={t('rsm.unsaved')}>
          ●
        </span>
      )}
      <button
        className="btn btn-primary"
        onClick={handleSaveStripCount}
        disabled={!hasPendingChanges || isLoading}
        style={RSM_STYLES.stripCountSave}
      >
        {t('rsm.save')}
      </button>
      {serverUrl && (
        <button
          className="btn btn-secondary"
          onClick={() => setShowArenaQrModal(true)}
          title={t('rsm.qr_export_title')}
          style={RSM_STYLES.stripCountSave}
        >
          {t('rsm.qr_codes')}
        </button>
      )}
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

    const kioskPills = (
      [
        { key: 'poules', label: t('rsm.view_pools') },
        { key: 'classement', label: t('rsm.view_ranking') },
        { key: 'direct', label: t('rsm.view_live') },
        { key: 'suivants', label: t('rsm.view_next') },
      ] as const
    ).map(({ key, label }) => (
      <button
        key={key}
        type="button"
        className={`rsm-pill${kioskViews[key] ? ' rsm-pill--on' : ''}`}
        onClick={() => setKioskViews(v => ({ ...v, [key]: !v[key] }))}
      >
        {kioskViews[key] ? '✓' : '○'} {label}
      </button>
    ));

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
            </div>

            {/* Options d'affichage */}
            <div className="rsm-section">
              <div className="rsm-section-label">{t('rsm.section_display')}</div>
              <label className="rsm-toggle-row">
                <input
                  type="checkbox"
                  checked={showPhotos}
                  onChange={e => setShowPhotos(e.target.checked)}
                />
                {t('rsm.fighter_photos')}
              </label>
              <label className="rsm-toggle-row">
                <input
                  type="checkbox"
                  checked={cardAnnounce}
                  onChange={e => setCardAnnounce(e.target.checked)}
                />
                {t('rsm.card_banner')}
              </label>
            </div>

            {/* Vues kiosque — pills */}
            <div className="rsm-section rsm-section--full">
              <div className="rsm-section-label">{t('rsm.section_kiosk_views')}</div>
              <div className="rsm-pills">{kioskPills}</div>
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
            {isLoading ? <span className="rsm-spinner" /> : '⚡'}
            {t('rsm.start')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="remote-score-manager">
      <div className="remote-header">
        <div className="remote-status active rsm-hero">
          <span className="rsm-status-dot rsm-status-dot--on" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="rsm-hero-title">{t('remote.active_title')}</h3>
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
          </div>
        </div>
        <button
          className="rsm-start-btn rsm-stop-btn"
          onClick={handleStopRemote}
          disabled={isLoading}
        >
          {isLoading ? <span className="rsm-spinner" /> : '🛑'}
          {t('rsm.stop')}
        </button>
      </div>

      <div className="arena-urls-section">
        {/* Pistes et options : deux cartes sur une ligne, comme l'écran d'attente (#1006) */}
        <div className="rsm-sections">
          <div className="rsm-section">
            <div className="rsm-section-label">{t('rsm.strips_n', { count: arenaCount })}</div>
            <div className="rsm-strip-row">{stripCountControls}</div>
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
        <div style={RSM_STYLES.themeSection}>
          <div style={RSM_STYLES.themeTitle}>{t('rsm.display_theme')}</div>
          <div style={RSM_STYLES.themeRow}>
            {(
              [
                { value: 'dark', label: t('rsm.theme_dark'), icon: '🌙' },
                { value: 'light', label: t('rsm.theme_light'), icon: '☀️' },
                { value: 'neon', label: t('rsm.theme_neon'), icon: '⚡' },
                { value: 'unicorn', label: 'Unicorn', icon: '🦄' },
              ] as const
            ).map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={async () => {
                  setDisplayTheme(value);
                  await window.electronAPI.remote.updateTheme(competition.id, value);
                }}
                style={{
                  flex: 1,
                  padding: '0.35rem 0.5rem',
                  borderRadius: '0.375rem',
                  border: `2px solid ${displayTheme === value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background:
                    displayTheme === value ? 'var(--color-primary-dark)' : 'var(--color-surface)',
                  color: displayTheme === value ? '#fff' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontWeight: displayTheme === value ? 700 : 400,
                  fontSize: '0.8rem',
                  transition: 'all 0.15s',
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
        <div style={RSM_STYLES.wallpaperSection}>
          <div style={RSM_STYLES.wallpaperTitle}>{t('rsm.wallpaper_title')}</div>
          <div style={RSM_STYLES.wallpaperRow}>
            {arenaWallpaper && (
              <img
                src={arenaWallpaper}
                alt={t('rsm.wallpaper_alt')}
                style={RSM_STYLES.wallpaperImg}
              />
            )}
            <label style={RSM_STYLES.wallpaperImportLabel}>
              {arenaWallpaper ? t('rsm.wallpaper_change') : t('rsm.wallpaper_import')}
              <input
                type="file"
                accept="image/*"
                style={RSM_STYLES.wallpaperHiddenInput}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async ev => {
                    const base64 = ev.target?.result as string;
                    setArenaWallpaper(base64);
                    await window.electronAPI.remote.setWallpaper(competition.id, base64);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
            {arenaWallpaper && (
              <button
                onClick={async () => {
                  setArenaWallpaper(null);
                  await window.electronAPI.remote.setWallpaper(competition.id, null);
                }}
                style={RSM_STYLES.wallpaperDeleteBtn}
              >
                {t('rsm.delete')}
              </button>
            )}
          </div>
        </div>
        <div style={RSM_STYLES.kioskViewsSection}>
          <div style={RSM_STYLES.kioskViewsTitle}>{t('rsm.kiosk_views')}</div>
          <div className="rsm-pills">
            {(
              [
                { key: 'poules', label: t('rsm.view_pools') },
                { key: 'classement', label: t('rsm.view_ranking') },
                { key: 'direct', label: t('rsm.view_live_matches') },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`rsm-pill${kioskViews[key] ? ' rsm-pill--on' : ''}`}
                aria-pressed={kioskViews[key]}
                onClick={async () => {
                  const next = { ...kioskViews, [key]: !kioskViews[key] };
                  setKioskViews(next);
                  await window.electronAPI.remote.updateKioskViews(competition.id, next);
                }}
              >
                {kioskViews[key] ? '✓ ' : ''}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Note d'organisation */}
        <OrgNotePanel competitionId={competition.id} />

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
                        { value: 'dark' as const, icon: '🌙', title: t('rsm.theme_dark') },
                        { value: 'light' as const, icon: '☀️', title: t('rsm.theme_light') },
                        { value: 'neon' as const, icon: '⚡', title: t('rsm.theme_neon') },
                      ].map(({ value, icon, title }) => (
                        <button
                          key={value}
                          title={title}
                          className={`arena-theme-btn ${arenaTheme?.theme === value ? 'active' : ''}`}
                          onClick={() => handleArenaThemeChange(arenaId, value)}
                        >
                          {icon}
                        </button>
                      ))}
                      <button
                        title={t('rsm.theme_custom')}
                        className={`arena-theme-btn ${arenaTheme?.theme === 'custom' ? 'active' : ''}`}
                        onClick={() => {
                          setThemeEditorScreenType('arena');
                          setThemeEditorTarget(arenaId);
                        }}
                      >
                        ✏️
                      </button>
                      {arenaThemes[arenaId] && (
                        <button
                          title={t('rsm.unlock_theme')}
                          className="arena-theme-btn"
                          style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                          onClick={() => void handleClearArenaThemeOverride(arenaId)}
                        >
                          🔓
                        </button>
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
                        ✏️ {arenaTheme?.screenThemes?.[screenTab] ? '●' : ''}
                      </button>
                      {arenaTheme?.screenThemes?.[screenTab] && (
                        <button
                          title={t('rsm.unlock_theme')}
                          className="arena-theme-btn"
                          style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                          onClick={() => void handleClearArenaScreenTheme(arenaId, screenTab)}
                        >
                          🔓
                        </button>
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
                  <code className="arena-url-value">{arena.refereeUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.refereeUrl, arena.number * 10)}
                    title={t('rsm.copy_url')}
                  >
                    {copiedIndex === arena.number * 10 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
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
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_display')}</span>
                  <code className="arena-url-value">{arena.displayUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.displayUrl, arena.number * 10 + 1)}
                    title={t('rsm.copy_url')}
                  >
                    {copiedIndex === arena.number * 10 + 1 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
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
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_pool')}</span>
                  <code className="arena-url-value">{arena.poolUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.poolUrl, arena.number * 10 + 2)}
                    title={t('rsm.copy_url')}
                  >
                    {copiedIndex === arena.number * 10 + 2 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
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
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label" title={t('rsm.matches_title')}>
                    {t('rsm.matches')}
                  </span>
                  <code className="arena-url-value">{arena.matchOrderUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.matchOrderUrl, arena.number * 10 + 5)}
                    title={t('rsm.copy_url')}
                  >
                    {copiedIndex === arena.number * 10 + 5 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
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
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">{t('rsm.screen_public')}</span>
                  <code className="arena-url-value">{arena.publicUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.publicUrl, arena.number * 10 + 3)}
                    title={t('rsm.copy_url')}
                  >
                    {copiedIndex === arena.number * 10 + 3 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
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
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label" title={t('rsm.overlay_title')}>
                    🎥 Overlay
                  </span>
                  <code className="arena-url-value">{arena.overlayUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.overlayUrl, arena.number * 10 + 4)}
                    title={t('rsm.overlay_copy_title')}
                  >
                    {copiedIndex === arena.number * 10 + 4 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
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
                    📱
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
                <button
                  className="btn btn-primary"
                  disabled={!globalThemeId}
                  onClick={() => void handleGlobalThemeApply()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {t('rsm.apply_all')}
                </button>
              </div>
            </div>
          );
        })()}

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header">
            <strong>{t('rsm.overlay_card')}</strong>
          </div>
          <OBSOverlayConfig serverUrl={serverUrl} arenaCount={arenaCount} />
        </div>

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
          <div className="arena-url-row">
            <span className="arena-url-label">URL</span>
            <code className="arena-url-value">{kioskUrl}</code>
            <button
              className="btn-copy"
              onClick={() => copyToClipboard(kioskUrl, 999)}
              title={t('rsm.copy_url')}
            >
              {copiedIndex === 999 ? '✓' : '📋'}
            </button>
            <button
              className="btn-qr"
              onClick={() => setActiveQR({ url: kioskUrl, label: t('rsm.kiosk_qr') })}
              title={t('rsm.qr_code')}
            >
              📱
            </button>
          </div>
        </div>

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header">
            <strong>{t('rsm.checkin_card')}</strong>
          </div>
          <div className="arena-url-row">
            <span className="arena-url-label">URL</span>
            <code className="arena-url-value">{checkinUrl}</code>
            <button
              className="btn-copy"
              onClick={() => copyToClipboard(checkinUrl, 996)}
              title={t('rsm.copy_url')}
            >
              {copiedIndex === 996 ? '✓' : '📋'}
            </button>
            <button
              className="btn-qr"
              onClick={() => setActiveQR({ url: checkinUrl, label: t('rsm.checkin_qr') })}
              title={t('rsm.qr_code')}
            >
              📱
            </button>
          </div>
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
            <button className="btn-copy" title={t('rsm.set_pwd')} onClick={applyCheckinPassword}>
              ✓
            </button>
          </div>
        </div>

        {trainerEnabled && (
          <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
            <div className="arena-url-header">
              <strong>{t('rsm.trainer_card')}</strong>
            </div>
            <div className="arena-url-row">
              <span className="arena-url-label">URL</span>
              <code className="arena-url-value">{trainerUrl}</code>
              <button
                className="btn-copy"
                onClick={() => copyToClipboard(trainerUrl, 995)}
                title={t('rsm.copy_url')}
              >
                {copiedIndex === 995 ? '✓' : '📋'}
              </button>
              <button
                className="btn-qr"
                onClick={() => setActiveQR({ url: trainerUrl, label: t('rsm.trainers') })}
                title={t('rsm.qr_code')}
              >
                📱
              </button>
            </div>
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
              <button className="btn btn-secondary btn-sm" onClick={exportTrainerComments}>
                {t('rsm.trainer_pdf')}
              </button>
            </div>
          </div>
        )}

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header">
            <strong>{t('rsm.lobby_card')}</strong>
          </div>
          <div className="arena-url-row">
            <span className="arena-url-label">URL</span>
            <code className="arena-url-value">{lobbyUrl}</code>
            <button
              className="btn-copy"
              onClick={() => copyToClipboard(lobbyUrl, 997)}
              title={t('rsm.copy_url')}
            >
              {copiedIndex === 997 ? '✓' : '📋'}
            </button>
            <button
              className="btn-qr"
              onClick={() => setActiveQR({ url: lobbyUrl, label: t('rsm.lobby_qr') })}
              title={t('rsm.qr_code')}
            >
              📱
            </button>
          </div>
        </div>
      </div>

      {/* ── Section : Écrans connectés (+ modale kiosk) ── */}
      <ConnectedScreensPanel competitionId={competition.id} isRemoteActive={isRemoteActive} />

      <div className="remote-instructions">
        <h5>{t('rsm.instructions_title')}</h5>
        <ol>
          <li>{t('rsm.instr_1')}</li>
          <li>{t('rsm.instr_2')}</li>
          <li>{t('rsm.instr_3')}</li>
          <li>{t('rsm.instr_4')}</li>
        </ol>
      </div>

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
              <button className="btn btn-secondary" onClick={() => setActiveQR(null)}>
                {t('rsm.close')}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default React.memo(RemoteScoreManager);
