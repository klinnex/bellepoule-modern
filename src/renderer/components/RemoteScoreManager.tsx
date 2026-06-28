/**
 * BellePoule Modern - Remote Score Management Component
 * Interface for managing remote score entry
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { Competition, Pool } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { TableauMatch, ConsolationBracket } from './tableau/tableauTypes';
import { useToast } from './Toast';
import ThemeEditor from './ThemeEditor';
import { OBSOverlayConfig } from './OBSOverlayConfig';
import { CustomTheme, DisplayTheme } from '../../shared/types/remote';
import { ConnectedClient, KioskScreenConfig } from '../../shared/types/preload';

interface RemoteScoreManagerProps {
  competition: Competition;
  pools: Pool[];
  tableauMatches?: TableauMatch[];
  consolationBrackets?: ConsolationBracket[];
  onArenaCountChange?: (count: number) => void;
  onStartRemote: () => void;
  onStopRemote: () => void;
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
  stripCountRow: { display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.75rem 0' } satisfies React.CSSProperties,
  stripCountControls: { display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  stripCountBtn: { padding: '0.2rem 0.5rem', fontSize: '1rem' } satisfies React.CSSProperties,
  stripCountSave: { padding: '0.2rem 0.6rem' } satisfies React.CSSProperties,
  stripCountPending: { color: 'var(--warning-color, orange)', fontSize: '0.85rem' } satisfies React.CSSProperties,
  stripCountStrong: { minWidth: '1.5rem', textAlign: 'center' as const } satisfies React.CSSProperties,
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0', cursor: 'pointer' } satisfies React.CSSProperties,
  kioskViewsSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  kioskViewsTitle: { fontSize: '0.875rem', marginBottom: '0.25rem', color: 'inherit' } satisfies React.CSSProperties,
  kioskViewLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' } satisfies React.CSSProperties,
  interfaceRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' } satisfies React.CSSProperties,
  interfaceLabel: { whiteSpace: 'nowrap' as const } satisfies React.CSSProperties,
  portRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' } satisfies React.CSSProperties,
  portInput: { width: '80px' } satisfies React.CSSProperties,
  portHint: { fontSize: '0.8rem', opacity: 0.6 } satisfies React.CSSProperties,
  portActiveRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' } satisfies React.CSSProperties,
  portActiveLabel: { whiteSpace: 'nowrap' as const, fontSize: '0.875rem' } satisfies React.CSSProperties,
  portActiveInput: { width: '75px' } satisfies React.CSSProperties,
  portActiveBtn: { fontSize: '0.8rem', padding: '0.2rem 0.5rem' } satisfies React.CSSProperties,
  themeSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  themeTitle: { fontSize: '0.875rem', marginBottom: '0.4rem', color: 'inherit' } satisfies React.CSSProperties,
  themeRow: { display: 'flex', gap: '0.5rem' } satisfies React.CSSProperties,
  wallpaperSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  wallpaperTitle: { fontSize: '0.875rem', marginBottom: '0.4rem', color: 'inherit' } satisfies React.CSSProperties,
  wallpaperRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' as const } satisfies React.CSSProperties,
  wallpaperImg: { width: 80, height: 45, objectFit: 'cover' as const, borderRadius: '0.25rem', border: '1px solid #475569' } satisfies React.CSSProperties,
  wallpaperImportLabel: { padding: '0.35rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #475569', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.8rem' } satisfies React.CSSProperties,
  wallpaperHiddenInput: { display: 'none' } satisfies React.CSSProperties,
  wallpaperDeleteBtn: { padding: '0.35rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #475569', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' } satisfies React.CSSProperties,
  orgNoteBox: { margin: '0.75rem 0', padding: '0.75rem', border: '1px solid #334155', borderRadius: '0.5rem', background: '#1e293b' } satisfies React.CSSProperties,
  orgNoteTitle: { fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#94a3b8' } satisfies React.CSSProperties,
  orgNoteTypeRow: { display: 'flex', gap: '1rem', marginBottom: '0.5rem' } satisfies React.CSSProperties,
  orgNoteRadioLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#e2e8f0' } satisfies React.CSSProperties,
  orgNoteTextarea: { width: '100%', padding: '0.4rem 0.6rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', boxSizing: 'border-box' as const, marginBottom: '0.4rem', resize: 'vertical' as const, fontFamily: 'inherit', fontSize: 'inherit' } satisfies React.CSSProperties,
  orgNoteTimeRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' } satisfies React.CSSProperties,
  orgNoteSelect: { padding: '0.4rem 0.6rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', cursor: 'pointer' } satisfies React.CSSProperties,
  orgNoteTimeInput: { padding: '0.4rem 0.6rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0' } satisfies React.CSSProperties,
  orgNoteBtnRow: { display: 'flex', gap: '0.5rem', marginTop: '0.25rem' } satisfies React.CSSProperties,
  orgNoteHideBtn: { padding: '0.4rem 0.75rem', borderRadius: '0.3rem', border: 'none', background: '#475569', color: '#fff', cursor: 'pointer' } satisfies React.CSSProperties,
  orgNoteActive: { fontSize: '0.75rem', color: '#22c55e', marginTop: '0.4rem' } satisfies React.CSSProperties,
  launchSection: { margin: '0.75rem 0' } satisfies React.CSSProperties,
  launchBtn: { padding: '0.6rem 1.2rem', fontSize: '1rem', fontWeight: 'bold' as const } satisfies React.CSSProperties,
  pisteresumeSummary: { marginTop: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '8px' } satisfies React.CSSProperties,
  pisteresumeFlex: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' } satisfies React.CSSProperties,
  qrSpinner: { width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' } satisfies React.CSSProperties,
  qrCode: { fontSize: '0.75rem', wordBreak: 'break-all' as const, textAlign: 'center' as const } satisfies React.CSSProperties,
  kioskCard: { marginTop: '1rem' } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const RemoteScoreManager: React.FC<RemoteScoreManagerProps> = ({
  competition,
  pools,
  tableauMatches,
  consolationBrackets,
  onArenaCountChange,
  onStartRemote,
  onStopRemote,
  isRemoteActive = false,
  initialStripCount,
  isVisible = false,
}) => {
  const { showToast } = useToast();
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [useHttps, setUseHttps] = useState<boolean>(() => {
    return localStorage.getItem('bellepoule-remote-https') === 'true';
  });
  const [certFingerprint, setCertFingerprint] = useState<string | null>(null);
  const [remotePort, setRemotePort] = useState<number>(() => {
    const saved = localStorage.getItem(`bellepoule-remote-port-${competition.id}`);
    return saved ? parseInt(saved, 10) : 8066;
  });
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>([
    { name: 'Toutes les interfaces', address: '0.0.0.0' },
  ]);
  const [selectedInterface, setSelectedInterface] = useState<string>(() => {
    return localStorage.getItem('bellepoule-remote-interface') ?? '0.0.0.0';
  });
  // pendingCount : valeur affichée (modifiée par +/−, non encore appliquée)
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  // committedCount : valeur appliquée au serveur ou confirmée par l'utilisateur
  const [committedCount, setCommittedCount] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeQR, setActiveQR] = useState<{ url: string; label: string } | null>(null);
  const [arenaPasswords, setArenaPasswords] = useState<Record<string, string>>({});
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
  const [orgNoteType, setOrgNoteType] = useState<'free' | 'target_time'>('free');
  const [orgNoteMessage, setOrgNoteMessage] = useState('');
  const [orgNoteTime, setOrgNoteTime] = useState('');
  const [orgNotePrefix, setOrgNotePrefix] = useState('Reprise');
  const [orgNoteActive, setOrgNoteActive] = useState(false);
  // Thèmes par arène : arenaId → { theme, customTheme?, screenThemes }
  const [arenaThemes, setArenaThemes] = useState<
    Record<string, { theme: DisplayTheme; customTheme?: CustomTheme; screenThemes: Partial<Record<'public' | 'referee' | 'pool', CustomTheme>> }>
  >({});
  // Onglet de type d'écran sélectionné par arène
  const [arenaScreenTab, setArenaScreenTab] = useState<Record<string, 'arena' | 'public' | 'referee' | 'pool'>>({});
  // Éditeur de thème (arène + type d'écran)
  const [themeEditorTarget, setThemeEditorTarget] = useState<string | null>(null);
  const [themeEditorScreenType, setThemeEditorScreenType] = useState<'arena' | 'public' | 'referee' | 'pool'>('arena');
  // Éditeur de thème kiosk
  const [kioskThemeEditorOpen, setKioskThemeEditorOpen] = useState(false);
  const [kioskTheme, setKioskTheme] = useState<CustomTheme | undefined>(undefined);
  // Thèmes sauvegardés (depuis IPC)
  const [savedThemes, setSavedThemes] = useState<CustomTheme[]>([]);
  // Sélecteur de thème global
  const [globalThemeSection, setGlobalThemeSection] = useState<'arena' | 'kiosk' | 'public' | 'referee' | 'pool'>('arena');
  const [globalThemeId, setGlobalThemeId] = useState('');
  // Lancement de la compétition
  const [isLaunched, setIsLaunched] = useState<boolean>(() => {
    const key = `bellepoule-remote-launched-${competition.id}`;
    return localStorage.getItem(key) === 'true';
  });

  // Écrans connectés
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});
  // kioskModal : socketId de l'écran pour lequel on configure le mode kiosk
  const [kioskModal, setKioskModal] = useState<string | null>(null);
  const [kioskModalConfig, setKioskModalConfig] = useState<KioskScreenConfig>({
    poules: true, classement: true, final: false, direct: true, suivants: true, tableau: true, rotationSec: 15,
  });

  useEffect(() => {
    window.electronAPI.remote.getNetworkInterfaces().then((res: any) => {
      if (res?.success && res.interfaces?.length) {
        setNetworkInterfaces(res.interfaces);
      }
    });
  }, []);

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

  // Synchroniser le cache poolFencersCache du serveur distant quand les poules changent
  // (interversion de combattants entre poules pendant une session active).
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
      logger.warn(LogCategory.NETWORK, 'Échec updatePoolFencers', err instanceof Error ? err : undefined);
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
    () => [
      ...(tableauMatches || []),
      ...(consolationBrackets || []).flatMap(b => b.matches || []),
    ]
      .filter(m => m.winner === null && m.fencerA && m.fencerB)
      .map(m => ({ ...m, isTableau: true })),
    [tableauMatches, consolationBrackets]
  );
  useEffect(() => {
    if (!isRemoteActive || !session || pendingDeMatches.length === 0) return;
    const key = pendingDeMatches.map(m => m.id).join(',');
    if (key === prevDeMatchesKeyRef.current) return;
    prevDeMatchesKeyRef.current = key;
    window.electronAPI.remote.refreshDeMatches(competition.id, pendingDeMatches).catch((err: unknown) => {
      logger.warn(LogCategory.NETWORK, 'Échec refreshDeMatches', err instanceof Error ? err : undefined);
    });
  }, [pendingDeMatches, isRemoteActive, session]);

  // Abonnement aux mises à jour de la liste des clients connectés
  useEffect(() => {
    if (!isRemoteActive) return;
    window.electronAPI.remote.getConnectedClients(competition.id).then((res: any) => {
      if (res.success) setConnectedClients(res.clients ?? []);
    });
    return window.electronAPI.remote.onClientListUpdate((clients: ConnectedClient[]) => {
      setConnectedClients(clients);
    });
  }, [isRemoteActive, competition.id]);

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
      const result = await window.electronAPI.remote.startServer(competition.id, remotePort, selectedInterface, useHttps);

      if (result.success && result.serverInfo) {
        if (result.serverInfo.port !== remotePort) {
          setRemotePort(result.serverInfo.port);
          localStorage.setItem(`bellepoule-remote-port-${competition.id}`, String(result.serverInfo.port));
        }
        setServerUrl(result.serverInfo.url);
        setCertFingerprint(result.serverInfo.certFingerprint ?? null);
        await startSession(result.serverInfo.url, effectivePending);
      } else {
        showToast(`Erreur: ${result.error || 'Impossible de démarrer le serveur'}`, 'error');
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
        setCommittedCount(count);
        onArenaCountChange?.(count);
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
          prevDeMatchesKeyRef.current = deMatches.map((m: any) => m.id).join(',');
        }
      } else {
        showToast(`Erreur session: ${result.error}`, 'error');
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
          showToast(`Erreur: ${result.error}`, 'error');
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
        showToast(`Erreur: ${result.error}`, 'error');
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
        setIsLaunched(false);
        localStorage.removeItem(`bellepoule-remote-launched-${competition.id}`);
        showToast('Saisie distante arrêtée', 'success');
        onStopRemote();
      } else {
        showToast(`Erreur: ${result.error || "Impossible d'arrêter le serveur"}`, 'error');
      }
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to stop remote server', error as Error);
      showToast("Impossible d'arrêter le serveur distant", 'error');
    } finally {
      setIsLoading(false);
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
      setArenaThemes(prev => ({ ...prev, [arenaId]: { ...(prev[arenaId] ?? { screenThemes: {} }), theme, customTheme } }));
      if (session) {
        await window.electronAPI.remote.updateArenaTheme(competition.id, arenaId, theme, customTheme);
      }
    },
    [session]
  );

  // Appliquer un thème custom à un type d'écran spécifique d'une arène
  const handleArenaScreenThemeChange = useCallback(
    async (arenaId: string, screenType: 'public' | 'referee' | 'pool', customTheme?: CustomTheme) => {
      setArenaThemes(prev => {
        const existing = prev[arenaId] ?? { theme: 'dark' as DisplayTheme, screenThemes: {} };
        return { ...prev, [arenaId]: { ...existing, screenThemes: { ...existing.screenThemes, [screenType]: customTheme } } };
      });
      if (session) {
        await window.electronAPI.remote.updateArenaScreenTheme(competition.id, arenaId, screenType, customTheme);
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
    window.electronAPI.themes.list().then(setSavedThemes).catch(() => {});
  }, []);

  useEffect(() => {
    const MIGRATION_KEY = 'bp-themes-migrated-v1';
    if (!localStorage.getItem(MIGRATION_KEY)) {
      try {
        const raw = localStorage.getItem('bellepoule-custom-themes');
        if (raw) {
          const old: CustomTheme[] = JSON.parse(raw);
          Promise.all(
            old.map(t => window.electronAPI.themes.save({ ...t, targetType: t.targetType ?? 'arena' }))
          ).then(() => {
            localStorage.setItem(MIGRATION_KEY, '1');
            refreshSavedThemes();
          }).catch(() => {});
        } else {
          localStorage.setItem(MIGRATION_KEY, '1');
        }
      } catch { localStorage.setItem(MIGRATION_KEY, '1'); }
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
      const result = await window.electronAPI.remote.updateKioskTheme(competition.id, theme.variables);
      setKioskTheme(theme);
      if (result?.success) showToast(`Thème "${theme.name}" appliqué au kiosque`, 'success');
      else showToast(result?.error ?? 'Erreur', 'error');
    } else {
      // public / referee / pool → appliquer à toutes les arènes pour ce type d'écran
      const count = session ? session.strips.length : effectiveCommitted;
      for (let i = 1; i <= count; i++) {
        await window.electronAPI.remote.updateArenaScreenTheme(competition.id, `arena${i}`, globalThemeSection, theme);
      }
      showToast(`Thème "${theme.name}" appliqué (${globalThemeSection}) à toutes les pistes`, 'success');
    }
    setGlobalThemeId('');
  }, [savedThemes, globalThemeId, globalThemeSection, handleArenaThemeChange, competition.id, session, effectiveCommitted]);

  // La grille d'URLs reflète l'état réel du serveur (committedCount) ou la session active
  const arenaCount = session ? session.strips.length : effectiveCommitted;
  const kioskUrl = `${serverUrl}/kiosk`;
  const lobbyUrl = `${serverUrl}/lobby`;
  const arenaUrls = Array.from({ length: arenaCount }, (_, i) => ({
    number: i + 1,
    refereeUrl: `${serverUrl}/arene${i + 1}/arbitre`,
    displayUrl: `${serverUrl}/arene${i + 1}`,
    poolUrl: `${serverUrl}/arene${i + 1}/poule`,
    publicUrl: `${serverUrl}/arene${i + 1}/public`,
    overlayUrl: `${serverUrl}/arene${i + 1}/overlay`,
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
        <span style={RSM_STYLES.stripCountPending} title="Modifications non sauvegardées">
          ●
        </span>
      )}
      <button
        className="btn btn-primary"
        onClick={handleSaveStripCount}
        disabled={!hasPendingChanges || isLoading}
        style={RSM_STYLES.stripCountSave}
      >
        Sauvegarder
      </button>
    </div>
  );

  // Tous les hooks ont été appelés — retour null si l'onglet n'est pas visible
  if (!isVisible) return null;

  if (!isRemoteActive) {
    const portValid = remotePort >= 1 && remotePort <= 65535 && !isNaN(remotePort);
    const previewHost = selectedInterface === '0.0.0.0'
      ? (networkInterfaces.find(i => i.address !== '0.0.0.0')?.address ?? 'localhost')
      : selectedInterface;
    const networkPreview = `${useHttps ? 'https' : 'http'}://${previewHost}:${remotePort}`;

    const kioskPills = (
      [
        { key: 'poules', label: 'Poules' },
        { key: 'classement', label: 'Classement' },
        { key: 'direct', label: 'En direct' },
        { key: 'suivants', label: 'Suivants' },
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
              <h3 className="rsm-hero-title">Saisie distante inactive</h3>
              <p className="rsm-hero-desc">
                Les arbitres saisissent les scores depuis une tablette via navigateur web sur le réseau local.
              </p>
            </div>
          </div>

          {/* Sections grid */}
          <div className="rsm-sections">
            {/* Pistes */}
            <div className="rsm-section">
              <div className="rsm-section-label">Pistes</div>
              <div className="rsm-strip-row">{stripCountControls}</div>
            </div>

            {/* Options d'affichage */}
            <div className="rsm-section">
              <div className="rsm-section-label">Affichage</div>
              <label className="rsm-toggle-row">
                <input
                  type="checkbox"
                  checked={showPhotos}
                  onChange={e => setShowPhotos(e.target.checked)}
                />
                Photos combattants
              </label>
              <label className="rsm-toggle-row">
                <input
                  type="checkbox"
                  checked={cardAnnounce}
                  onChange={e => setCardAnnounce(e.target.checked)}
                />
                📣 Bandeau carton
              </label>
            </div>

            {/* Vues kiosque — pills */}
            <div className="rsm-section rsm-section--full">
              <div className="rsm-section-label">Vues kiosque</div>
              <div className="rsm-pills">{kioskPills}</div>
            </div>

            {/* Réseau */}
            <div className="rsm-section rsm-section--full">
              <div className="rsm-section-label">Réseau</div>
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
              {!portValid && (
                <div className="rsm-port-error">Port invalide (1–65535)</div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useHttps}
                  onChange={e => {
                    setUseHttps(e.target.checked);
                    localStorage.setItem('bellepoule-remote-https', String(e.target.checked));
                  }}
                  disabled={isLoading}
                />
                🔒 Activer HTTPS (connexion chiffrée)
              </label>
              {useHttps && (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.25rem', lineHeight: 1.4 }}>
                  Certificat auto-signé — les tablettes devront accepter l&apos;avertissement de sécurité du navigateur une seule fois.
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
            {isLoading
              ? <span className="rsm-spinner" />
              : '⚡'}
            Démarrer la saisie distante
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="remote-score-manager">
      <div className="remote-header">
        <div className="remote-status active">
          <h3>🟢 Saisie distante active</h3>
          <p>
            Serveur: <strong>{serverUrl}</strong>
          </p>
          {certFingerprint && (
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0.25rem 0 0', wordBreak: 'break-all' }}>
              🔒 Empreinte cert. SHA-256 : <code style={{ fontSize: '0.7rem' }}>{certFingerprint}</code>
            </p>
          )}
          <div style={RSM_STYLES.portActiveRow}>
            <label htmlFor={`remote-port-active-${competition.id}`} style={RSM_STYLES.portActiveLabel}>
              Port :
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
              title="Redémarrer le serveur sur ce port"
              style={RSM_STYLES.portActiveBtn}
            >
              🔄 Recharger
            </button>
          </div>
        </div>
        <button className="btn-secondary" onClick={handleStopRemote} disabled={isLoading}>
          🛑 Arrêter
        </button>
      </div>

      <div className="arena-urls-section">
        <div style={RSM_STYLES.stripCountRow}>
          <h4 style={{ margin: 0 }}>Pistes ({arenaCount})</h4>
          {stripCountControls}
        </div>
        <label style={RSM_STYLES.checkboxLabel}>
          <input
            type="checkbox"
            checked={showPhotos}
            onChange={async e => {
              setShowPhotos(e.target.checked);
              await window.electronAPI.remote.updateShowPhotos(competition.id, e.target.checked);
            }}
          />
          Afficher les photos des combattants avant le combat
        </label>
        <label style={RSM_STYLES.checkboxLabel}>
          <input
            type="checkbox"
            checked={cardAnnounce}
            onChange={async e => {
              setCardAnnounce(e.target.checked);
              await window.electronAPI.remote.updateCardAnnounce(competition.id, e.target.checked);
            }}
          />
          📣 Carton avancer (afficher bandeau + raison sur les écrans)
        </label>
        {!isLaunched && (
          <div style={RSM_STYLES.launchSection}>
            <button
              className="btn-primary"
              style={RSM_STYLES.launchBtn}
              onClick={async () => {
                const result = await window.electronAPI.remote.launchCompetition(competition.id);
                if (result.success) {
                  const key = `bellepoule-remote-launched-${competition.id}`;
                  setIsLaunched(true);
                  localStorage.setItem(key, 'true');
                  showToast('Compétition lancée sur les écrans', 'success');
                } else {
                  showToast(`Erreur: ${result.error}`, 'error');
                }
              }}
            >
              🚀 Lancer la compétition
            </button>
          </div>
        )}
        <div style={RSM_STYLES.themeSection}>
          <div style={RSM_STYLES.themeTitle}>Thème de l'affichage :</div>
          <div style={RSM_STYLES.themeRow}>
            {(
              [
                { value: 'dark', label: 'Sombre', icon: '🌙' },
                { value: 'light', label: 'Clair', icon: '☀️' },
                { value: 'neon', label: 'Néon', icon: '⚡' },
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
                  border: `2px solid ${displayTheme === value ? '#3b82f6' : '#475569'}`,
                  background: displayTheme === value ? '#1d4ed8' : 'transparent',
                  color: '#e2e8f0',
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
          <div style={RSM_STYLES.wallpaperTitle}>Fond d'écran arènes (écran d'attente) :</div>
          <div style={RSM_STYLES.wallpaperRow}>
            {arenaWallpaper && (
              <img
                src={arenaWallpaper}
                alt="Fond d'écran"
                style={RSM_STYLES.wallpaperImg}
              />
            )}
            <label style={RSM_STYLES.wallpaperImportLabel}>
              {arenaWallpaper ? '🖼 Changer' : '🖼 Importer'}
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
                ✕ Supprimer
              </button>
            )}
          </div>
        </div>
        <div style={RSM_STYLES.kioskViewsSection}>
          <div style={RSM_STYLES.kioskViewsTitle}>Vues kiosk :</div>
          {(
            [
              { key: 'poules', label: 'Poules' },
              { key: 'classement', label: 'Classement' },
              { key: 'direct', label: 'Matchs en direct' },
            ] as const
          ).map(({ key, label }) => (
            <label key={key} style={RSM_STYLES.kioskViewLabel}>
              <input
                type="checkbox"
                checked={kioskViews[key]}
                onChange={async e => {
                  const next = { ...kioskViews, [key]: e.target.checked };
                  setKioskViews(next);
                  await window.electronAPI.remote.updateKioskViews(competition.id, next);
                }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Note d'organisation */}
        <div style={RSM_STYLES.orgNoteBox}>
          <div style={RSM_STYLES.orgNoteTitle}>Note d'organisation (kiosk)</div>
          <div style={RSM_STYLES.orgNoteTypeRow}>
            <label style={RSM_STYLES.orgNoteRadioLabel}>
              <input
                type="radio"
                name="orgNoteType"
                checked={orgNoteType === 'free'}
                onChange={() => setOrgNoteType('free')}
              />
              Message libre
            </label>
            <label style={RSM_STYLES.orgNoteRadioLabel}>
              <input
                type="radio"
                name="orgNoteType"
                checked={orgNoteType === 'target_time'}
                onChange={() => setOrgNoteType('target_time')}
              />
              Heure de reprise
            </label>
          </div>
          <textarea
            placeholder="Message (ex: Déjeuner des arbitres)"
            value={orgNoteMessage}
            onChange={e => setOrgNoteMessage(e.target.value)}
            rows={3}
            style={RSM_STYLES.orgNoteTextarea}
          />
          {orgNoteType === 'target_time' && (
            <div style={RSM_STYLES.orgNoteTimeRow}>
              <select
                value={orgNotePrefix}
                onChange={e => setOrgNotePrefix(e.target.value)}
                style={RSM_STYLES.orgNoteSelect}
              >
                {['Reprise', 'Début', 'Fin', 'Pause', 'Déjeuner', 'Cérémonie'].map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={orgNoteTime}
                onChange={e => setOrgNoteTime(e.target.value)}
                style={RSM_STYLES.orgNoteTimeInput}
              />
            </div>
          )}
          <div style={RSM_STYLES.orgNoteBtnRow}>
            <button
              disabled={!orgNoteMessage.trim() || (orgNoteType === 'target_time' && !orgNoteTime)}
              onClick={async () => {
                const note = {
                  type: orgNoteType,
                  message: orgNoteMessage.trim(),
                  ...(orgNoteType === 'target_time'
                    ? { targetTime: orgNoteTime, countdownPrefix: orgNotePrefix }
                    : {}),
                  createdAt: new Date().toISOString(),
                };
                await window.electronAPI.remote.setOrgNote(competition.id, note);
                setOrgNoteActive(true);
              }}
              style={{
                flex: 1,
                padding: '0.4rem',
                borderRadius: '0.3rem',
                border: 'none',
                background: orgNoteActive ? '#1d4ed8' : '#2563eb',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {orgNoteActive ? '↻ Mettre à jour' : '▶ Afficher'}
            </button>
            {orgNoteActive && (
              <button
                onClick={async () => {
                  await window.electronAPI.remote.clearOrgNote(competition.id);
                  setOrgNoteActive(false);
                }}
                style={RSM_STYLES.orgNoteHideBtn}
              >
                ✕ Masquer
              </button>
            )}
          </div>
          {orgNoteActive && (
            <div style={RSM_STYLES.orgNoteActive}>● Note visible sur le kiosk</div>
          )}
        </div>

        <div className="arena-url-grid">
          {arenaUrls.map(arena => {
            const arenaId = `arena${arena.number}`;
            const arenaTheme = arenaThemes[arenaId];
            const screenTab = arenaScreenTab[arenaId] ?? 'arena';
            const screenThemeTypes = [
              { value: 'arena' as const,   label: 'Affichage' },
              { value: 'public' as const,  label: 'Public' },
              { value: 'referee' as const, label: 'Arbitre' },
              { value: 'pool' as const,    label: 'Poule' },
            ] as const;
            const filteredForScreen = savedThemes.filter(t => (t.targetType ?? 'arena') === screenTab);
            return (
              <div key={arena.number} className="arena-url-card">
                <div className="arena-url-header">
                  <strong>Piste {arena.number}</strong>
                </div>
                {/* Onglets type d'écran */}
                <div style={{ display: 'flex', gap: '0.25rem', margin: '0.4rem 0 0.25rem' }}>
                  {screenThemeTypes.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setArenaScreenTab(prev => ({ ...prev, [arenaId]: value }))}
                      style={{
                        padding: '0.15rem 0.45rem', fontSize: '0.7rem', borderRadius: '0.25rem',
                        border: `1px solid ${screenTab === value ? '#3b82f6' : '#475569'}`,
                        background: screenTab === value ? '#1d4ed8' : 'transparent',
                        color: screenTab === value ? '#fff' : '#94a3b8',
                        cursor: 'pointer', fontWeight: screenTab === value ? 700 : 400,
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
                        { value: 'dark' as const, icon: '🌙', title: 'Sombre' },
                        { value: 'light' as const, icon: '☀️', title: 'Clair' },
                        { value: 'neon' as const, icon: '⚡', title: 'Néon' },
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
                        title="Thème personnalisé"
                        className={`arena-theme-btn ${arenaTheme?.theme === 'custom' ? 'active' : ''}`}
                        onClick={() => { setThemeEditorScreenType('arena'); setThemeEditorTarget(arenaId); }}
                      >
                        ✏️
                      </button>
                      {arenaThemes[arenaId] && (
                        <button
                          title="Déverrouiller — suivre le thème global"
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
                        title={`Personnaliser ${screenTab}`}
                        className={`arena-theme-btn ${arenaTheme?.screenThemes?.[screenTab] ? 'active' : ''}`}
                        onClick={() => { setThemeEditorScreenType(screenTab); setThemeEditorTarget(arenaId); }}
                      >
                        ✏️ {arenaTheme?.screenThemes?.[screenTab] ? '●' : ''}
                      </button>
                      {arenaTheme?.screenThemes?.[screenTab] && (
                        <button
                          title="Déverrouiller — suivre le thème global"
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
                      title="Appliquer un thème sauvegardé"
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
                        padding: '0.2rem 0.4rem', borderRadius: '0.3rem',
                        border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0',
                        fontSize: '0.75rem', cursor: 'pointer', maxWidth: 110,
                      }}
                    >
                      <option value="">📦 Thèmes…</option>
                      {filteredForScreen.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">Arbitre</span>
                  <code className="arena-url-value">{arena.refereeUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.refereeUrl, arena.number * 10)}
                    title="Copier l'URL"
                  >
                    {copiedIndex === arena.number * 10 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
                    onClick={() =>
                      setActiveQR({
                        url: arena.refereeUrl,
                        label: `Piste ${arena.number} – Arbitre`,
                      })
                    }
                    title="QR code"
                  >
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">Affichage</span>
                  <code className="arena-url-value">{arena.displayUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.displayUrl, arena.number * 10 + 1)}
                    title="Copier l'URL"
                  >
                    {copiedIndex === arena.number * 10 + 1 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
                    onClick={() =>
                      setActiveQR({
                        url: arena.displayUrl,
                        label: `Piste ${arena.number} – Affichage`,
                      })
                    }
                    title="QR code"
                  >
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">Poule</span>
                  <code className="arena-url-value">{arena.poolUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.poolUrl, arena.number * 10 + 2)}
                    title="Copier l'URL"
                  >
                    {copiedIndex === arena.number * 10 + 2 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
                    onClick={() =>
                      setActiveQR({
                        url: arena.poolUrl,
                        label: `Piste ${arena.number} – Poule`,
                      })
                    }
                    title="QR code"
                  >
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">Public</span>
                  <code className="arena-url-value">{arena.publicUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.publicUrl, arena.number * 10 + 3)}
                    title="Copier l'URL"
                  >
                    {copiedIndex === arena.number * 10 + 3 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
                    onClick={() =>
                      setActiveQR({
                        url: arena.publicUrl,
                        label: `Piste ${arena.number} – Public`,
                      })
                    }
                    title="QR code"
                  >
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label" title="À coller dans OBS > Sources > Navigateur">🎥 Overlay</span>
                  <code className="arena-url-value">{arena.overlayUrl}</code>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(arena.overlayUrl, arena.number * 10 + 4)}
                    title="Copier l'URL overlay (OBS Browser Source)"
                  >
                    {copiedIndex === arena.number * 10 + 4 ? '✓' : '📋'}
                  </button>
                  <button
                    className="btn-qr"
                    onClick={() =>
                      setActiveQR({
                        url: arena.overlayUrl,
                        label: `Piste ${arena.number} – Overlay stream`,
                      })
                    }
                    title="QR code"
                  >
                    📱
                  </button>
                </div>
                <div className="arena-url-row">
                  <span className="arena-url-label">🔒 MDP</span>
                  <input
                    type="password"
                    className="arena-password-input"
                    placeholder="Aucun (accès libre)"
                    value={arenaPasswords[`arena${arena.number}`] ?? ''}
                    onChange={e =>
                      setArenaPasswords(p => ({
                        ...p,
                        [`arena${arena.number}`]: e.target.value,
                      }))
                    }
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        const pwd = arenaPasswords[`arena${arena.number}`] ?? '';
                        const result = await window.electronAPI.remote.setArenaPassword(
                          competition.id,
                          `arena${arena.number}`,
                          pwd
                        );
                        if (result.success) {
                          showToast(
                            pwd
                              ? `Mot de passe défini pour la piste ${arena.number}`
                              : `Mot de passe supprimé pour la piste ${arena.number}`,
                            'success'
                          );
                        } else {
                          showToast(result.error ?? 'Erreur', 'error');
                        }
                      }
                    }}
                  />
                  <button
                    className="btn-copy"
                    title="Définir le mot de passe"
                    onClick={async () => {
                      const pwd = arenaPasswords[`arena${arena.number}`] ?? '';
                      const result = await window.electronAPI.remote.setArenaPassword(
                        competition.id,
                        `arena${arena.number}`,
                        pwd
                      );
                      if (result.success) {
                        showToast(
                          pwd
                            ? `Mot de passe défini pour la piste ${arena.number}`
                            : `Mot de passe supprimé pour la piste ${arena.number}`,
                          'success'
                        );
                      } else {
                        showToast(result.error ?? 'Erreur', 'error');
                      }
                    }}
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
          const filteredForSection = savedThemes.filter(t => (t.targetType ?? 'arena') === globalThemeSection);
          if (savedThemes.length === 0) return null;
          return (
            <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
              <div className="arena-url-header">
                <strong>🎨 Thème global</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <select
                  value={globalThemeSection}
                  onChange={e => { setGlobalThemeSection(e.target.value as typeof globalThemeSection); setGlobalThemeId(''); }}
                  style={{ padding: '0.35rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: '0.85rem' }}
                >
                  <option value="arena">⚔️ Affichage piste</option>
                  <option value="kiosk">🖥️ Kiosque</option>
                  <option value="public">👥 Public</option>
                  <option value="referee">🤝 Arbitre</option>
                  <option value="pool">📋 Poule</option>
                </select>
                <select
                  value={globalThemeId}
                  onChange={e => setGlobalThemeId(e.target.value)}
                  style={{ flex: 1, minWidth: 120, padding: '0.35rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: '0.85rem' }}
                >
                  <option value="">— Choisir un thème —</option>
                  {filteredForSection.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={!globalThemeId}
                  onClick={() => void handleGlobalThemeApply()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Appliquer à tous
                </button>
              </div>
            </div>
          );
        })()}

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header">
            <strong>🎥 Overlay streaming (OBS / vMix)</strong>
          </div>
          <OBSOverlayConfig serverUrl={serverUrl} arenaCount={arenaCount} />
        </div>

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>🖥️ Kiosk (affichage public)</strong>
            <button
              title="Thème personnalisé kiosk"
              className={`arena-theme-btn ${kioskTheme ? 'active' : ''}`}
              onClick={() => setKioskThemeEditorOpen(true)}
            >
              ✏️ Thème
            </button>
          </div>
          <div className="arena-url-row">
            <span className="arena-url-label">URL</span>
            <code className="arena-url-value">{kioskUrl}</code>
            <button
              className="btn-copy"
              onClick={() => copyToClipboard(kioskUrl, 999)}
              title="Copier l'URL"
            >
              {copiedIndex === 999 ? '✓' : '📋'}
            </button>
            <button
              className="btn-qr"
              onClick={() => setActiveQR({ url: kioskUrl, label: 'Kiosk – Affichage public' })}
              title="QR code"
            >
              📱
            </button>
          </div>
        </div>

        <div className="arena-url-card" style={RSM_STYLES.kioskCard}>
          <div className="arena-url-header">
            <strong>🚪 Lobby (salle d'attente arbitres)</strong>
          </div>
          <div className="arena-url-row">
            <span className="arena-url-label">URL</span>
            <code className="arena-url-value">{lobbyUrl}</code>
            <button
              className="btn-copy"
              onClick={() => copyToClipboard(lobbyUrl, 997)}
              title="Copier l'URL"
            >
              {copiedIndex === 997 ? '✓' : '📋'}
            </button>
            <button
              className="btn-qr"
              onClick={() => setActiveQR({ url: lobbyUrl, label: 'Lobby – Salle d\'attente' })}
              title="QR code"
            >
              📱
            </button>
          </div>
        </div>
      </div>

      {/* ── Section : Écrans connectés ── */}
      {connectedClients.length > 0 && (
        <div className="arena-url-card" style={{ marginTop: '1rem' }}>
          <div className="arena-url-header">
            <strong>📺 Écrans connectés ({connectedClients.length})</strong>
          </div>
          {connectedClients.map(client => {
            const clientLabel = client.label || client.screenId?.slice(0, 8) || client.socketId.slice(0, 8);
            const typeLabel: Record<string, string> = {
              kiosk: 'Kiosk', arena: 'Arène', public: 'Public', pool: 'Poule', dashboard: 'Dashboard', lobby: 'Lobby', referee: 'Arbitre',
            };
            return (
              <div key={client.socketId} style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 0', borderBottom: '1px solid #1e293b',
              }}>
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', background: '#1e3a5f', color: '#7dd3fc', whiteSpace: 'nowrap' }}>
                  {typeLabel[client.clientType] ?? client.clientType}
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', minWidth: '6rem' }}>
                  {clientLabel}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{client.ip}</span>
                <div style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    title="Faire clignoter cet écran pour l'identifier"
                    onClick={() => window.electronAPI.remote.identifyClient(competition.id, client.socketId)}
                  >
                    🔦 Identifier
                  </button>
                  <input
                    type="text"
                    placeholder="Renommer…"
                    value={renameValues[client.socketId] ?? ''}
                    onChange={e => setRenameValues(v => ({ ...v, [client.socketId]: e.target.value }))}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        const lbl = renameValues[client.socketId]?.trim();
                        if (lbl) await window.electronAPI.remote.renameClient(competition.id, client.socketId, lbl);
                      }
                    }}
                    style={{ width: '8rem', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0' }}
                  />
                  <button
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    title="Renommer"
                    onClick={async () => {
                      const lbl = renameValues[client.socketId]?.trim();
                      if (lbl) await window.electronAPI.remote.renameClient(competition.id, client.socketId, lbl);
                    }}
                  >
                    ✓
                  </button>
                  <button
                    className="btn-primary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    title="Configurer et envoyer en mode kiosk"
                    onClick={() => {
                      setKioskModal(client.socketId);
                      setKioskModalConfig({ poules: true, classement: true, final: false, direct: true, suivants: true, tableau: true, rotationSec: 15 });
                    }}
                  >
                    🖥️ Mode kiosk
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="remote-instructions">
        <h5>Instructions pour les arbitres</h5>
        <ol>
          <li>Ouvrir un navigateur web sur la tablette</li>
          <li>
            Aller à l'URL <strong>Arbitre</strong> correspondant à sa piste
          </li>
          <li>Saisir les scores du match en cours</li>
          <li>Cliquer sur "Match suivant" pour passer au match suivant</li>
        </ol>
      </div>

      {/* ── Modal kiosk config ── */}
      {kioskModal && createPortal(
        <div className="qr-popup-overlay" onClick={() => setKioskModal(null)}>
          <div className="qr-popup" onClick={e => e.stopPropagation()} style={{ minWidth: '20rem', maxWidth: '26rem' }}>
            <strong style={{ fontSize: '1rem' }}>🖥️ Configurer le mode kiosk</strong>
            <div style={{ margin: '0.75rem 0', textAlign: 'left' }}>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Vues à afficher :</div>
              {([
                { key: 'poules', label: 'Poules' },
                { key: 'classement', label: 'Classement' },
                { key: 'final', label: 'Classement final' },
                { key: 'direct', label: 'Matchs en direct' },
                { key: 'suivants', label: 'Matchs suivants' },
                { key: 'tableau', label: 'Tableau DE' },
              ] as const).map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.3rem 0', cursor: 'pointer', color: '#e2e8f0' }}>
                  <input
                    type="checkbox"
                    checked={kioskModalConfig[key]}
                    onChange={e => setKioskModalConfig(c => ({ ...c, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>Rotation (s) :</label>
                <input
                  type="number"
                  min={3}
                  max={300}
                  value={kioskModalConfig.rotationSec}
                  onChange={e => setKioskModalConfig(c => ({ ...c, rotationSec: Math.max(3, parseInt(e.target.value) || 15) }))}
                  style={{ width: '5rem', padding: '0.3rem 0.5rem', borderRadius: '0.3rem', border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  await window.electronAPI.remote.setClientKioskMode(competition.id, kioskModal, kioskModalConfig);
                  setKioskModal(null);
                  showToast('Écran basculé en mode kiosk', 'success');
                }}
              >
                Envoyer en kiosk
              </button>
              <button className="btn btn-secondary" onClick={() => setKioskModal(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {themeEditorTarget && (
        <ThemeEditor
          targetArenaId={themeEditorTarget}
          targetType={themeEditorScreenType}
          initialTheme={
            themeEditorScreenType === 'arena'
              ? arenaThemes[themeEditorTarget]?.customTheme
              : arenaThemes[themeEditorTarget]?.screenThemes?.[themeEditorScreenType as 'public' | 'referee' | 'pool']
          }
          onApply={async (arenaId, theme) => {
            if (themeEditorScreenType === 'arena') {
              await handleArenaThemeChange(arenaId, 'custom', theme);
            } else {
              await handleArenaScreenThemeChange(arenaId, themeEditorScreenType as 'public' | 'referee' | 'pool', theme);
            }
            setThemeEditorTarget(null);
            showToast('Thème personnalisé appliqué', 'success');
          }}
          onClose={() => { setThemeEditorTarget(null); refreshSavedThemes(); }}
        />
      )}

      {kioskThemeEditorOpen && (
        <ThemeEditor
          targetArenaId="kiosk"
          targetType="kiosk"
          initialTheme={kioskTheme}
          onApply={async (_arenaId, theme) => {
            setKioskTheme(theme);
            const result = await window.electronAPI.remote.updateKioskTheme(competition.id, theme.variables);
            setKioskThemeEditorOpen(false);
            if (result?.success) {
              showToast('Thème kiosk appliqué', 'success');
            } else {
              showToast(result?.error ?? 'Erreur application thème kiosk', 'error');
            }
          }}
          onClose={() => { setKioskThemeEditorOpen(false); refreshSavedThemes(); }}
        />
      )}

      {activeQR && createPortal(
        <div className="qr-popup-overlay" onClick={() => setActiveQR(null)}>
          <div className="qr-popup" onClick={e => e.stopPropagation()}>
            <strong>{activeQR.label}</strong>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code" width={220} height={220} />
            ) : (
              <div style={RSM_STYLES.qrSpinner}>Génération…</div>
            )}
            <code style={RSM_STYLES.qrCode}>
              {activeQR.url}
            </code>
            <button className="btn btn-secondary" onClick={() => setActiveQR(null)}>
              Fermer
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default React.memo(RemoteScoreManager);
