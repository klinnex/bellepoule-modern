/**
 * BellePoule Modern - Kiosk Display Component
 * Affichage grand écran public avec menu auto-masquant
 * Vues : Poules / Classement provisoire / Tableau d'élimination
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Competition, Pool, Weapon, MatchStatus, Fencer } from '../../shared/types';
import { OrgNote } from '../../shared/types/remote';
import { TableauMatch } from './tableau/tableauTypes';
import {
  calculateOverallRanking,
  calculateOverallRankingQuest,
  formatRatio,
  formatIndex,
} from '../../shared/utils/poolCalculations';

type KioskView = 'pools' | 'ranking' | 'tableau';

// ─── Static style constants (extracted to avoid new object on every render) ───

const KIOSK_STYLES = {
  root: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: '#0f172a',
    color: 'white',
    zIndex: 9999,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  menu: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    padding: '1rem 2rem',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center' as const,
    gap: '0.75rem',
  },
  menuLabel: { fontSize: '1rem', color: '#94a3b8', marginRight: '0.5rem', fontWeight: 600 },
  menuFlex: { flex: 1 },
  menuEscHint: { fontSize: '0.8rem', color: '#64748b' },
  menuCloseBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  poolsWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '70px 40px 40px',
  },
  poolsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center' as const,
    marginBottom: '24px',
    borderBottom: '2px solid #334155',
    paddingBottom: '20px',
  },
  poolsTitle: { margin: 0, fontSize: '2.2rem', fontWeight: 'bold' as const },
  poolsSubtitle: { margin: '8px 0 0', fontSize: '1.1rem', color: '#94a3b8' },
  poolsNavHint: { marginLeft: '1rem', fontSize: '0.9rem' },
  poolsScoreBox: { textAlign: 'right' as const },
  poolsScoreNum: { fontSize: '2.5rem', fontWeight: 'bold' as const, color: '#3b82f6' },
  poolsScoreLabel: { fontSize: '0.9rem', color: '#64748b' },
  poolsProgressTrack: {
    width: '100%',
    height: '6px',
    backgroundColor: '#1e293b',
    borderRadius: '3px',
    marginBottom: '32px',
    overflow: 'hidden',
  },
  poolsProgressFill: { height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.5s ease' },
  poolsContent: { flex: 1, display: 'flex', gap: '24px', minHeight: 0 },
  poolsRankingCol: { flex: 1 },
  poolsRankingTitle: { marginBottom: '16px', fontSize: '1.3rem', color: '#94a3b8' },
  poolsRankingList: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  poolsMatchesCol: { width: '360px', flexShrink: 0 },
  poolsMatchesTitle: { marginBottom: '16px', fontSize: '1.3rem', color: '#94a3b8' },
  poolsMatchesList: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  poolsMatchCard: { padding: '16px', backgroundColor: '#dc2626', borderRadius: '10px' },
  poolsMatchCardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center' as const,
    fontSize: '1.2rem',
    fontWeight: 'bold' as const,
  },
  poolsMatchVs: { color: '#fca5a5', fontSize: '0.9rem' },
  poolsMatchStrip: {
    textAlign: 'center' as const,
    marginTop: '8px',
    fontSize: '1rem',
    color: '#fca5a5',
  },
  poolsMatchEmpty: {
    padding: '32px',
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: '1.1rem',
  },
  poolsRankRow: {
    display: 'flex',
    alignItems: 'center' as const,
    padding: '16px',
    borderRadius: '10px',
  },
  poolsRankAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center',
    fontSize: '1.3rem',
    fontWeight: 'bold' as const,
    marginRight: '16px',
    flexShrink: 0,
  },
  poolsRankInfo: { flex: 1 },
  poolsRankName: { fontSize: '1.3rem', fontWeight: 'bold' as const },
  poolsRankClub: { fontSize: '0.9rem', color: '#64748b' },
  poolsRankStats: { textAlign: 'right' as const, flexShrink: 0 },
  poolsRankScore: { fontSize: '1.5rem', fontWeight: 'bold' as const, color: '#3b82f6' },
  poolsRankMatches: { fontSize: '0.85rem', color: '#94a3b8' },
  poolsRankTouches: { fontSize: '0.85rem', color: '#64748b' },
  poolsDotsRow: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' },
  rankingWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '70px 40px 0',
    minHeight: 0,
  },
  rankingHeader: {
    marginBottom: '24px',
    borderBottom: '2px solid #334155',
    paddingBottom: '16px',
    flexShrink: 0,
  },
  rankingTitle: { margin: 0, fontSize: '2rem', fontWeight: 'bold' as const },
  rankingSubtitle: { margin: '6px 0 0', fontSize: '1.1rem', color: '#94a3b8' },
  rankingScrollArea: { flex: 1, overflowY: 'auto' as const, paddingBottom: '40px' },
  rankingTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '1.05rem' },
  rankingThead: { color: '#64748b', textAlign: 'left' as const, borderBottom: '1px solid #334155' },
  rankingThRg: { padding: '10px 12px', width: '60px' },
  rankingThName: { padding: '10px 12px' },
  rankingThVm: { padding: '10px 12px', textAlign: 'center' as const, width: '70px' },
  rankingThTd: { padding: '10px 12px', textAlign: 'center' as const, width: '60px' },
  rankingThTr: { padding: '10px 12px', textAlign: 'center' as const, width: '60px' },
  rankingThQuest: {
    padding: '10px 12px',
    textAlign: 'center' as const,
    width: '80px',
    color: '#a78bfa',
  },
  rankingThIndice: { padding: '10px 12px', textAlign: 'center' as const, width: '70px' },
  rankingTdRank: { padding: '12px', fontWeight: 'bold' as const, fontSize: '1.2rem' },
  rankingTdLast: { padding: '12px', fontWeight: 600, fontSize: '1.1rem' },
  rankingTdFirst: { padding: '12px', fontSize: '1.05rem' },
  rankingTdClub: { padding: '12px', color: '#94a3b8', fontSize: '0.95rem' },
  rankingTdRatio: { padding: '12px', textAlign: 'center' as const },
  rankingTdTouches: { padding: '12px', textAlign: 'center' as const },
  rankingTdQuest: {
    padding: '12px',
    textAlign: 'center' as const,
    color: '#a78bfa',
    fontWeight: 600,
  },
  rankingTdIndice: { padding: '12px', textAlign: 'center' as const, fontWeight: 600 },
  tableauWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '70px 40px 0',
    minHeight: 0,
  },
  tableauHeader: {
    marginBottom: '24px',
    borderBottom: '2px solid #334155',
    paddingBottom: '16px',
    flexShrink: 0,
  },
  tableauTitle: { margin: 0, fontSize: '2rem', fontWeight: 'bold' as const },
  tableauRoundLabel: { margin: '6px 0 0', fontSize: '1.3rem', color: '#3b82f6', fontWeight: 600 },
  tableauScrollArea: { flex: 1, overflowY: 'auto' as const, paddingBottom: '40px' },
  tableauGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '16px',
  },
  matchCardBye: {
    padding: '20px 24px',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    opacity: 0.5,
  },
  matchCardByeLabel: { textAlign: 'center' as const, color: '#64748b', fontSize: '1rem' },
  matchCardByeName: {
    textAlign: 'center' as const,
    fontWeight: 'bold' as const,
    fontSize: '1.2rem',
    marginTop: '4px',
  },
  matchCardVs: {
    textAlign: 'center' as const,
    fontSize: '0.75rem',
    color: '#475569',
    margin: '2px 0',
  },
  finishedWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
    gap: '24px',
  },
  finishedTitle: {
    textAlign: 'center' as const,
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#fbbf24',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  podiumRow: {
    display: 'flex',
    alignItems: 'flex-end' as const,
    justifyContent: 'center',
    gap: '16px',
    flexShrink: 0,
  },
  podiumCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '8px',
  },
  podiumMedal2: { fontSize: '2.2rem' },
  podiumName2: {
    fontWeight: 700,
    fontSize: '1.2rem',
    textAlign: 'center' as const,
    maxWidth: '200px',
  },
  podiumClub2: { fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' as const },
  podiumBlock2: {
    width: '180px',
    height: '80px',
    backgroundColor: '#475569',
    borderRadius: '6px 6px 0 0',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center',
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#94a3b8',
  },
  podiumMedal1: { fontSize: '3rem' },
  podiumName1: {
    fontWeight: 800,
    fontSize: '1.5rem',
    textAlign: 'center' as const,
    maxWidth: '220px',
    color: '#fbbf24',
  },
  podiumClub1: { fontSize: '0.9rem', color: '#fbbf24', opacity: 0.8, textAlign: 'center' as const },
  podiumBlock1: {
    width: '200px',
    height: '120px',
    backgroundColor: '#b45309',
    borderRadius: '6px 6px 0 0',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: 800,
    color: '#fbbf24',
  },
  podiumMedal3: { fontSize: '2.2rem' },
  podiumName3: {
    fontWeight: 700,
    fontSize: '1.2rem',
    textAlign: 'center' as const,
    maxWidth: '200px',
  },
  podiumClub3: { fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' as const },
  podiumBlock3: {
    width: '180px',
    height: '60px',
    backgroundColor: '#713f12',
    borderRadius: '6px 6px 0 0',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center',
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#d97706',
  },
  podiumEmpty: { textAlign: 'center' as const, color: '#94a3b8', fontSize: '1.3rem' },
  elimRankingWrapper: {
    flex: 1,
    overflowY: 'hidden' as const,
    borderTop: '1px solid #334155',
    paddingTop: '16px',
  },
  elimRankingLabel: {
    color: '#64748b',
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: '10px',
    paddingLeft: '4px',
  },
  elimTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '1rem' },
  elimThead: { color: '#64748b', textAlign: 'left' as const, borderBottom: '1px solid #334155' },
  elimThRg: { padding: '6px 10px', width: '50px' },
  elimThName: { padding: '6px 10px' },
  elimThElimAt: { padding: '6px 10px', color: '#475569', fontStyle: 'italic' as const },
  elimTdRank: { padding: '8px 10px', fontWeight: 'bold' as const, fontSize: '1.1rem' },
  elimTdRankSmall: { color: '#64748b' },
  elimTdLast: { padding: '8px 10px', fontWeight: 600 },
  elimTdFirst: { padding: '8px 10px' },
  elimTdClub: { padding: '8px 10px', color: '#94a3b8', fontSize: '0.9rem' },
  elimTdElimAt: {
    padding: '8px 10px',
    color: '#475569',
    fontSize: '0.85rem',
    fontStyle: 'italic' as const,
  },
  orgNoteOverlay: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 10500,
    background: 'rgba(2, 6, 23, 0.88)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-evenly' as const,
    textAlign: 'center' as const,
    padding: '3rem',
  },
  orgNotePauseLabel: {
    fontSize: 'clamp(2rem, 5vw, 4rem)' as const,
    color: '#64748b',
    fontWeight: 600,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
  },
  orgNoteResumeTime: {
    fontSize: 'clamp(4rem, 14vw, 12rem)' as const,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  orgNoteCountdown: {
    fontSize: 'clamp(3rem, 10vw, 8rem)' as const,
    fontWeight: 800,
    color: '#3b82f6',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  orgNoteMessage: {
    fontSize: 'clamp(2rem, 7vw, 6rem)' as const,
    color: '#94a3b8',
    fontStyle: 'italic' as const,
  },
} satisfies Record<string, React.CSSProperties>;

// Rounds sans contexte de rendu : t() est reçu en paramètre (cf. useColumnVisibility.ts / XiaomiRemotePanel.tsx)
type TFunction = (key: string, params?: { [key: string]: string | number }) => string;

const ROUND_LABEL_KEYS: Record<number, string> = {
  2: 'tableau.round_final',
  3: 'tableau.round_third_place',
  4: 'tableau.round_semifinals',
  8: 'tableau.round_quarterfinals',
  16: 'tableau.round_of_16',
  32: 'tableau.round_of_32',
  64: 'tableau.round_of_64',
};

const getRoundLabel = (round: number, t: TFunction): string => {
  const key = ROUND_LABEL_KEYS[round];
  return key ? t(key) : t('tableau.round_of_n', { round });
};

interface KioskDisplayProps {
  competition: Competition;
  pools: Pool[];
  weapon?: Weapon;
  tableauMatches: TableauMatch[];
  onClose: () => void;
}

const KioskDisplay: React.FC<KioskDisplayProps> = ({
  competition,
  pools,
  weapon,
  tableauMatches,
  onClose,
}) => {
  const isLaserSabre = weapon === 'L';
  const { t } = useTranslation();

  // Déterminer la vue initiale selon les données disponibles
  const initialView = useMemo((): KioskView => {
    if (tableauMatches.length > 0) return 'tableau';
    const allDone =
      pools.length > 0 && pools.every(p => p.matches.every(m => m.status === MatchStatus.FINISHED));
    if (allDone) return 'ranking';
    return 'pools';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [currentView, setCurrentView] = useState<KioskView>(initialView);

  // Auto-switch vers tableau quand les matchs d'élimination arrivent (changement de phase en direct)
  useEffect(() => {
    if (tableauMatches.length > 0 && currentView !== 'tableau') {
      setCurrentView('tableau');
    }
  }, [tableauMatches.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [menuVisible, setMenuVisible] = useState(true);
  const menuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rotation poules
  const [currentPoolIndex, setCurrentPoolIndex] = useState(0);

  // Scroll refs pour ranking et tableau
  const rankingScrollRef = useRef<HTMLDivElement>(null);
  const tableauScrollRef = useRef<HTMLDivElement>(null);

  // Classement global
  const overallRanking = useMemo(() => {
    return isLaserSabre ? calculateOverallRankingQuest(pools) : calculateOverallRanking(pools);
  }, [pools, isLaserSabre]);

  // Round actif du tableau
  const activeRound = useMemo(() => {
    const incomplete = tableauMatches.filter(m => m.fencerA && m.fencerB && !m.winner && !m.isBye);
    if (incomplete.length === 0) return null;
    return Math.max(...incomplete.map(m => m.round));
  }, [tableauMatches]);

  const activeRoundMatches = useMemo(() => {
    if (activeRound === null) return [];
    return tableauMatches.filter(m => m.round === activeRound);
  }, [tableauMatches, activeRound]);

  // Podium (quand tableau terminé)
  const podium = useMemo(() => {
    if (activeRound !== null) return null;
    const finalMatch = tableauMatches.find(m => m.round === 2);
    if (!finalMatch?.winner) return null;
    const first = finalMatch.winner;
    const second = finalMatch.fencerA?.id === first.id ? finalMatch.fencerB : finalMatch.fencerA;
    const thirdMatch = tableauMatches.find(m => m.round === 3);
    const third = thirdMatch?.winner ?? null;
    return { first, second, third };
  }, [tableauMatches, activeRound]);

  // Classement d'élimination complet (quand tableau terminé)
  const elimRanking = useMemo(() => {
    if (activeRound !== null) return [];
    const results: { place: number; fencer: Fencer; eliminatedAt: string }[] = [];

    const finalMatch = tableauMatches.find(m => m.round === 2);
    if (!finalMatch?.winner) return [];

    const first = finalMatch.winner;
    const second = finalMatch.fencerA?.id === first.id ? finalMatch.fencerB : finalMatch.fencerA;
    results.push({ place: 1, fencer: first, eliminatedAt: '' });
    if (second) results.push({ place: 2, fencer: second, eliminatedAt: t('tableau.round_final') });

    const thirdMatch = tableauMatches.find(m => m.round === 3);
    if (thirdMatch?.winner) {
      const third = thirdMatch.winner;
      const fourth = thirdMatch.fencerA?.id === third.id ? thirdMatch.fencerB : thirdMatch.fencerA;
      results.push({ place: 3, fencer: third, eliminatedAt: '' });
      if (fourth)
        results.push({ place: 4, fencer: fourth, eliminatedAt: t('tableau.round_third_place') });
    } else {
      // Sans petite finale : perdants des demi-finales ex-aequo 3e
      const semis = tableauMatches.filter(m => m.round === 4 && m.winner);
      let place = 3;
      for (const semi of semis) {
        const loser = semi.fencerA?.id === semi.winner!.id ? semi.fencerB : semi.fencerA;
        if (loser)
          results.push({ place, fencer: loser, eliminatedAt: t('tableau.round_semifinals') });
        place++;
      }
    }

    // Tours suivants : perdants de chaque round
    let currentPlace = results.length + 1;
    for (const round of [8, 16, 32, 64, 128]) {
      const roundMatches = tableauMatches.filter(m => m.round === round && m.winner);
      if (roundMatches.length === 0) break;
      for (const m of roundMatches) {
        const loser = m.fencerA?.id === m.winner!.id ? m.fencerB : m.fencerA;
        if (loser)
          results.push({
            place: currentPlace,
            fencer: loser,
            eliminatedAt: getRoundLabel(round, t),
          });
      }
      currentPlace += roundMatches.length;
    }

    return results;
  }, [tableauMatches, activeRound, t]);

  // Menu auto-masquant
  const showMenu = useCallback(() => {
    setMenuVisible(true);
    if (menuTimerRef.current) clearTimeout(menuTimerRef.current);
    menuTimerRef.current = setTimeout(() => setMenuVisible(false), 4000);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (currentView === 'pools') {
        if (e.key === 'ArrowRight') setCurrentPoolIndex(p => Math.min(p + 1, pools.length - 1));
        if (e.key === 'ArrowLeft') setCurrentPoolIndex(p => Math.max(p - 1, 0));
      }
      showMenu();
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousemove', showMenu);
    showMenu();
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousemove', showMenu);
      if (menuTimerRef.current) clearTimeout(menuTimerRef.current);
    };
  }, [onClose, showMenu, currentView, pools.length]);

  // Plein écran
  useEffect(() => {
    document.documentElement.requestFullscreen().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Rotation automatique poules (10s)
  useEffect(() => {
    if (currentView !== 'pools' || pools.length <= 1) return;
    const id = setInterval(() => {
      setCurrentPoolIndex(p => (p + 1) % pools.length);
    }, 10000);
    return () => clearInterval(id);
  }, [currentView, pools.length]);

  // Auto-scroll ranking
  useEffect(() => {
    if (currentView !== 'ranking') return;
    const el = rankingScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    let animId: number;
    let last: number | null = null;
    let delayId: ReturnType<typeof setTimeout>;

    const step = (t: number) => {
      if (last !== null) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll > 0) {
          el.scrollTop += ((t - last) / 1000) * 20;
          if (el.scrollTop >= maxScroll) el.scrollTop = 0;
        }
      }
      last = t;
      animId = requestAnimationFrame(step);
    };
    delayId = setTimeout(() => {
      animId = requestAnimationFrame(step);
    }, 2000);
    return () => {
      clearTimeout(delayId);
      cancelAnimationFrame(animId);
    };
  }, [currentView, overallRanking]);

  // Auto-scroll tableau
  useEffect(() => {
    if (currentView !== 'tableau') return;
    const el = tableauScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    let animId: number;
    let last: number | null = null;
    let delayId: ReturnType<typeof setTimeout>;

    const step = (t: number) => {
      if (last !== null) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll > 0) {
          el.scrollTop += ((t - last) / 1000) * 20;
          if (el.scrollTop >= maxScroll) el.scrollTop = 0;
        }
      }
      last = t;
      animId = requestAnimationFrame(step);
    };
    delayId = setTimeout(() => {
      animId = requestAnimationFrame(step);
    }, 2000);
    return () => {
      clearTimeout(delayId);
      cancelAnimationFrame(animId);
    };
  }, [currentView, activeRound]);

  // Note d'organisation
  const [orgNote, setOrgNote] = useState<OrgNote | null>(null);
  const [orgNoteCountdown, setOrgNoteCountdown] = useState<string>('');

  useEffect(() => {
    if (!window.electronAPI?.onKioskNoteUpdate) return;
    const unsub = window.electronAPI.onKioskNoteUpdate(note => setOrgNote(note));
    return unsub;
  }, []);

  useEffect(() => {
    if (!orgNote || orgNote.type !== 'target_time' || !orgNote.targetTime) {
      setOrgNoteCountdown('');
      return;
    }
    const compute = () => {
      const now = new Date();
      const [hh, mm] = orgNote.targetTime!.split(':').map(Number);
      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1); // lendemain si dépassé
      const diffSec = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
      if (diffSec === 0) {
        window.electronAPI.remote.clearOrgNote(competition.id);
        return;
      }
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      setOrgNoteCountdown(`${m} min ${s.toString().padStart(2, '0')} s`);
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [orgNote]);

  // Données de la poule courante
  const currentPool = pools[currentPoolIndex];
  const poolCompleted = currentPool
    ? currentPool.matches.filter(m => m.status === MatchStatus.FINISHED).length
    : 0;
  const poolTotal = currentPool ? currentPool.matches.length : 0;
  const poolProgress = poolTotal > 0 ? (poolCompleted / poolTotal) * 100 : 0;

  const hasPoolData = pools.length > 0;
  const hasRankingData = overallRanking.length > 0;
  const hasTableauData = tableauMatches.length > 0;

  const btnStyle = (active: boolean, disabled: boolean) => ({
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
    background: active ? '#3b82f6' : disabled ? '#1e293b' : '#334155',
    color: disabled ? '#475569' : 'white',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.2s',
  });

  return (
    <div onMouseMove={showMenu} style={KIOSK_STYLES.root}>
      {/* Menu auto-masquant */}
      <div
        style={{
          ...KIOSK_STYLES.menu,
          opacity: menuVisible ? 1 : 0,
          pointerEvents: menuVisible ? 'auto' : 'none',
          transition: 'opacity 0.4s ease',
        }}
      >
        <span style={KIOSK_STYLES.menuLabel}>{t('competitionHeader.kiosk_mode')}</span>
        <button
          style={btnStyle(currentView === 'pools', !hasPoolData)}
          disabled={!hasPoolData}
          onClick={() => {
            if (hasPoolData) setCurrentView('pools');
          }}
        >
          🏆 {t('kiosk.pools')}
        </button>
        <button
          style={btnStyle(currentView === 'ranking', !hasRankingData)}
          disabled={!hasRankingData}
          onClick={() => {
            if (hasRankingData) setCurrentView('ranking');
          }}
        >
          📊 {t('kiosk.ranking')}
        </button>
        <button
          style={btnStyle(currentView === 'tableau', !hasTableauData)}
          disabled={!hasTableauData}
          onClick={() => {
            if (hasTableauData) setCurrentView('tableau');
          }}
        >
          🥇 {t('kiosk.tableau')}
        </button>
        <div style={KIOSK_STYLES.menuFlex} />
        <span style={KIOSK_STYLES.menuEscHint}>{t('kiosk.esc_exit')}</span>
        <button onClick={onClose} style={KIOSK_STYLES.menuCloseBtn}>
          ✕ {t('kiosk.close')}
        </button>
      </div>

      {/* ===== VUE POULES ===== */}
      {currentView === 'pools' && currentPool && (
        <div style={KIOSK_STYLES.poolsWrapper}>
          {/* Header poule */}
          <div style={KIOSK_STYLES.poolsHeader}>
            <div>
              <h1 style={KIOSK_STYLES.poolsTitle}>{competition.title}</h1>
              <p style={KIOSK_STYLES.poolsSubtitle}>
                {t('pools.pool_number')} {currentPool.number} / {pools.length}
                <span style={KIOSK_STYLES.poolsNavHint}>
                  {pools.length > 1 && t('kiosk.navigate_hint')}
                </span>
              </p>
            </div>
            <div style={KIOSK_STYLES.poolsScoreBox}>
              <div style={KIOSK_STYLES.poolsScoreNum}>
                {poolCompleted}/{poolTotal}
              </div>
              <div style={KIOSK_STYLES.poolsScoreLabel}>{t('kiosk.finished_matches')}</div>
            </div>
          </div>

          {/* Barre de progression */}
          <div style={KIOSK_STYLES.poolsProgressTrack}>
            <div
              style={{
                ...KIOSK_STYLES.poolsProgressFill,
                width: `${poolProgress}%`,
              }}
            />
          </div>

          {/* Contenu */}
          <div style={KIOSK_STYLES.poolsContent}>
            {/* Classement poule */}
            <div style={KIOSK_STYLES.poolsRankingCol}>
              <h2 style={KIOSK_STYLES.poolsRankingTitle}>{t('kiosk.ranking_label')}</h2>
              <div style={KIOSK_STYLES.poolsRankingList}>
                {currentPool.ranking?.slice(0, 8).map((rank, i) => (
                  <div
                    key={rank.fencer.id}
                    style={{
                      ...KIOSK_STYLES.poolsRankRow,
                      backgroundColor: i < 3 ? '#1e3a5f' : '#1e293b',
                      border: i < 3 ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                  >
                    <div
                      style={{
                        ...KIOSK_STYLES.poolsRankAvatar,
                        backgroundColor: i < 3 ? '#3b82f6' : '#475569',
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={KIOSK_STYLES.poolsRankInfo}>
                      <div style={KIOSK_STYLES.poolsRankName}>
                        {rank.fencer.lastName} {rank.fencer.firstName}
                      </div>
                      <div style={KIOSK_STYLES.poolsRankClub}>
                        {rank.fencer.club || t('presentation.no_club')}
                      </div>
                    </div>
                    <div style={KIOSK_STYLES.poolsRankStats}>
                      <div style={KIOSK_STYLES.poolsRankScore}>
                        {rank.victories}
                        {t('kiosk.victory_short')} – {rank.defeats}
                        {t('kiosk.defeat_short')}
                      </div>
                      <div style={KIOSK_STYLES.poolsRankMatches}>
                        {t('changePool.matches_played_count', { count: rank.matchesPlayed })}
                      </div>
                      <div style={KIOSK_STYLES.poolsRankTouches}>
                        {t('ranking.touches_scored')} {rank.touchesScored} /{' '}
                        {t('ranking.touches_received')} {rank.touchesReceived}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Matchs en cours */}
            <div style={KIOSK_STYLES.poolsMatchesCol}>
              <h2 style={KIOSK_STYLES.poolsMatchesTitle}>{t('kiosk.matches_live')}</h2>
              <div style={KIOSK_STYLES.poolsMatchesList}>
                {currentPool.matches
                  .filter(m => m.status === MatchStatus.IN_PROGRESS)
                  .slice(0, 4)
                  .map((match, idx) => (
                    <div key={match.id} style={KIOSK_STYLES.poolsMatchCard}>
                      <div style={KIOSK_STYLES.poolsMatchCardRow}>
                        <span>{match.fencerA?.lastName || t('kiosk.tbd')}</span>
                        <span style={KIOSK_STYLES.poolsMatchVs}>VS</span>
                        <span>{match.fencerB?.lastName || t('kiosk.tbd')}</span>
                      </div>
                      <div style={KIOSK_STYLES.poolsMatchStrip}>
                        {t('remote_score.lane_number', { number: match.strip || idx + 1 })}
                      </div>
                    </div>
                  ))}
                {currentPool.matches.filter(m => m.status === MatchStatus.IN_PROGRESS).length ===
                  0 && <div style={KIOSK_STYLES.poolsMatchEmpty}>{t('kiosk.no_live')}</div>}
              </div>
            </div>
          </div>

          {/* Navigation dots */}
          {pools.length > 1 && (
            <div style={KIOSK_STYLES.poolsDotsRow}>
              {pools.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentPoolIndex(i)}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: i === currentPoolIndex ? '#3b82f6' : '#334155',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== VUE CLASSEMENT ===== */}
      {currentView === 'ranking' && (
        <div style={KIOSK_STYLES.rankingWrapper}>
          {/* Header */}
          <div style={KIOSK_STYLES.rankingHeader}>
            <h1 style={KIOSK_STYLES.rankingTitle}>{competition.title}</h1>
            <p style={KIOSK_STYLES.rankingSubtitle}>
              {t('kiosk.provisional_ranking')} ·{' '}
              {t('poolView.fencers_count_suffix', { count: overallRanking.length })}
            </p>
          </div>

          {/* Tableau défilant */}
          <div ref={rankingScrollRef} data-kiosk-scroll="" style={KIOSK_STYLES.rankingScrollArea}>
            <table style={KIOSK_STYLES.rankingTable}>
              <thead>
                <tr style={KIOSK_STYLES.rankingThead}>
                  <th style={KIOSK_STYLES.rankingThRg}>{t('ranking.rank')}</th>
                  <th style={KIOSK_STYLES.rankingThName}>{t('fencer.last_name')}</th>
                  <th style={KIOSK_STYLES.rankingThName}>{t('fencer.first_name')}</th>
                  <th style={KIOSK_STYLES.rankingThName}>{t('fencer.club')}</th>
                  <th style={KIOSK_STYLES.rankingThVm}>{t('ranking.ratio')}</th>
                  <th style={KIOSK_STYLES.rankingThTd}>{t('ranking.touches_scored')}</th>
                  <th style={KIOSK_STYLES.rankingThTr}>{t('ranking.touches_received')}</th>
                  {isLaserSabre && <th style={KIOSK_STYLES.rankingThQuest}>{t('quest.label')}</th>}
                  <th style={KIOSK_STYLES.rankingThIndice}>{t('ranking.index')}</th>
                </tr>
              </thead>
              <tbody>
                {overallRanking.map((r, i) => (
                  <tr
                    key={r.fencer.id}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <td
                      style={{
                        ...KIOSK_STYLES.rankingTdRank,
                        color: i < 3 ? '#3b82f6' : 'white',
                      }}
                    >
                      {r.rank}
                    </td>
                    <td style={KIOSK_STYLES.rankingTdLast}>{r.fencer.lastName}</td>
                    <td style={KIOSK_STYLES.rankingTdFirst}>{r.fencer.firstName}</td>
                    <td style={KIOSK_STYLES.rankingTdClub}>{r.fencer.club || '–'}</td>
                    <td style={KIOSK_STYLES.rankingTdRatio}>{formatRatio(r.ratio)}</td>
                    <td style={KIOSK_STYLES.rankingTdTouches}>{r.touchesScored}</td>
                    <td style={KIOSK_STYLES.rankingTdTouches}>{r.touchesReceived}</td>
                    {isLaserSabre && (
                      <td style={KIOSK_STYLES.rankingTdQuest}>{r.questPoints || 0}</td>
                    )}
                    <td
                      style={{
                        ...KIOSK_STYLES.rankingTdIndice,
                        color: r.index >= 0 ? '#10b981' : '#f87171',
                      }}
                    >
                      {formatIndex(r.index)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== VUE TABLEAU ===== */}
      {currentView === 'tableau' && (
        <div style={KIOSK_STYLES.tableauWrapper}>
          {/* Header */}
          <div style={KIOSK_STYLES.tableauHeader}>
            <h1 style={KIOSK_STYLES.tableauTitle}>{competition.title}</h1>
            <p style={KIOSK_STYLES.tableauRoundLabel}>
              {activeRound !== null ? getRoundLabel(activeRound, t) : t('kiosk.tableau_done')}
            </p>
          </div>

          {/* Contenu */}
          {activeRound !== null ? (
            <div ref={tableauScrollRef} data-kiosk-scroll="" style={KIOSK_STYLES.tableauScrollArea}>
              <div style={KIOSK_STYLES.tableauGrid}>
                {activeRoundMatches.map(match => {
                  if (match.isBye) {
                    return (
                      <div key={match.id} style={KIOSK_STYLES.matchCardBye}>
                        <div style={KIOSK_STYLES.matchCardByeLabel}>{t('kiosk.bye')}</div>
                        <div style={KIOSK_STYLES.matchCardByeName}>
                          {match.fencerA?.lastName || match.fencerB?.lastName || '–'}
                        </div>
                      </div>
                    );
                  }

                  const winnerIsA =
                    match.winner && match.fencerA && match.winner.id === match.fencerA.id;
                  const winnerIsB =
                    match.winner && match.fencerB && match.winner.id === match.fencerB.id;
                  const isFinished = match.winner !== null;

                  return (
                    <div
                      key={match.id}
                      style={{
                        padding: '20px 24px',
                        backgroundColor: '#1e293b',
                        borderRadius: '12px',
                        border: `2px solid ${isFinished ? '#334155' : '#3b82f6'}`,
                      }}
                    >
                      {/* Tireur A */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          marginBottom: '6px',
                          backgroundColor: winnerIsA
                            ? 'rgba(16,185,129,0.2)'
                            : winnerIsB
                              ? 'rgba(255,255,255,0.03)'
                              : 'transparent',
                          border: winnerIsA ? '1px solid #10b981' : '1px solid transparent',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '1.2rem',
                            fontWeight: 600,
                            color: winnerIsB ? '#475569' : 'white',
                          }}
                        >
                          {match.fencerA
                            ? `${match.fencerA.lastName} ${match.fencerA.firstName.charAt(0)}.`
                            : t('kiosk.tbd')}
                          {match.fencerA?.club && (
                            <span
                              style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px' }}
                            >
                              {match.fencerA.club}
                            </span>
                          )}
                        </span>
                        {isFinished && match.scoreA !== null && (
                          <span
                            style={{
                              fontSize: '1.6rem',
                              fontWeight: 'bold',
                              color: winnerIsA ? '#10b981' : '#475569',
                            }}
                          >
                            {match.scoreA}
                          </span>
                        )}
                      </div>

                      {/* Séparateur */}
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: '0.75rem',
                          color: '#475569',
                          margin: '2px 0',
                        }}
                      >
                        VS
                      </div>

                      {/* Tireur B */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          marginTop: '6px',
                          backgroundColor: winnerIsB
                            ? 'rgba(16,185,129,0.2)'
                            : winnerIsA
                              ? 'rgba(255,255,255,0.03)'
                              : 'transparent',
                          border: winnerIsB ? '1px solid #10b981' : '1px solid transparent',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '1.2rem',
                            fontWeight: 600,
                            color: winnerIsA ? '#475569' : 'white',
                          }}
                        >
                          {match.fencerB
                            ? `${match.fencerB.lastName} ${match.fencerB.firstName.charAt(0)}.`
                            : t('kiosk.tbd')}
                          {match.fencerB?.club && (
                            <span
                              style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px' }}
                            >
                              {match.fencerB.club}
                            </span>
                          )}
                        </span>
                        {isFinished && match.scoreB !== null && (
                          <span
                            style={{
                              fontSize: '1.6rem',
                              fontWeight: 'bold',
                              color: winnerIsB ? '#10b981' : '#475569',
                            }}
                          >
                            {match.scoreB}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Tableau terminé – podium + classement */
            <div style={KIOSK_STYLES.finishedWrapper}>
              {/* Titre */}
              <div style={KIOSK_STYLES.finishedTitle}>🏆 {t('kiosk.final_results')}</div>

              {/* Podium visuel */}
              {podium ? (
                <div style={KIOSK_STYLES.podiumRow}>
                  {/* 2e place */}
                  <div style={KIOSK_STYLES.podiumCol}>
                    <div style={KIOSK_STYLES.podiumMedal2}>🥈</div>
                    <div style={KIOSK_STYLES.podiumName2}>
                      {podium.second ? `${podium.second.lastName} ${podium.second.firstName}` : '–'}
                    </div>
                    {podium.second?.club && (
                      <div style={KIOSK_STYLES.podiumClub2}>{podium.second.club}</div>
                    )}
                    <div style={KIOSK_STYLES.podiumBlock2}>2</div>
                  </div>
                  {/* 1re place */}
                  <div style={KIOSK_STYLES.podiumCol}>
                    <div style={KIOSK_STYLES.podiumMedal1}>🥇</div>
                    <div style={KIOSK_STYLES.podiumName1}>
                      {podium.first.lastName} {podium.first.firstName}
                    </div>
                    {podium.first.club && (
                      <div style={KIOSK_STYLES.podiumClub1}>{podium.first.club}</div>
                    )}
                    <div style={KIOSK_STYLES.podiumBlock1}>1</div>
                  </div>
                  {/* 3e place */}
                  <div style={KIOSK_STYLES.podiumCol}>
                    <div style={KIOSK_STYLES.podiumMedal3}>🥉</div>
                    <div style={KIOSK_STYLES.podiumName3}>
                      {podium.third ? `${podium.third.lastName} ${podium.third.firstName}` : '–'}
                    </div>
                    {podium.third?.club && (
                      <div style={KIOSK_STYLES.podiumClub3}>{podium.third.club}</div>
                    )}
                    <div style={KIOSK_STYLES.podiumBlock3}>3</div>
                  </div>
                </div>
              ) : (
                <div style={KIOSK_STYLES.podiumEmpty}>{t('kiosk.tableau_done')}</div>
              )}

              {/* Classement général */}
              {elimRanking.length > 0 && (
                <div ref={tableauScrollRef} style={KIOSK_STYLES.elimRankingWrapper}>
                  <div style={KIOSK_STYLES.elimRankingLabel}>{t('kiosk.general_ranking')}</div>
                  <table style={KIOSK_STYLES.elimTable}>
                    <thead>
                      <tr style={KIOSK_STYLES.elimThead}>
                        <th style={KIOSK_STYLES.elimThRg}>{t('ranking.rank')}</th>
                        <th style={KIOSK_STYLES.elimThName}>{t('fencer.last_name')}</th>
                        <th style={KIOSK_STYLES.elimThName}>{t('fencer.first_name')}</th>
                        <th style={KIOSK_STYLES.elimThName}>{t('fencer.club')}</th>
                        <th style={KIOSK_STYLES.elimThElimAt}>{t('tableau.elimination_in')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {elimRanking.map(r => {
                        const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
                        return (
                          <tr
                            key={r.fencer.id}
                            style={{
                              borderBottom: '1px solid #1e293b',
                              backgroundColor:
                                r.place <= 3 ? 'rgba(251,191,36,0.06)' : 'transparent',
                            }}
                          >
                            <td style={KIOSK_STYLES.elimTdRank}>
                              {medals[r.place] ?? (
                                <span style={KIOSK_STYLES.elimTdRankSmall}>{r.place}</span>
                              )}
                            </td>
                            <td style={KIOSK_STYLES.elimTdLast}>{r.fencer.lastName}</td>
                            <td style={KIOSK_STYLES.elimTdFirst}>{r.fencer.firstName}</td>
                            <td style={KIOSK_STYLES.elimTdClub}>{r.fencer.club || '–'}</td>
                            <td style={KIOSK_STYLES.elimTdElimAt}>{r.eliminatedAt}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== OVERLAY NOTE D'ORGANISATION ===== */}
      {orgNote && (
        <div style={KIOSK_STYLES.orgNoteOverlay}>
          <div style={KIOSK_STYLES.orgNotePauseLabel}>⏸ {t('remote_score.prefix_break')}</div>
          {orgNote.type === 'target_time' && orgNote.targetTime && (
            <>
              <div style={KIOSK_STYLES.orgNoteResumeTime}>
                {t('kiosk.resume_at', { time: orgNote.targetTime.replace(':', 'h') })}
              </div>
              <div style={KIOSK_STYLES.orgNoteCountdown}>
                {t('kiosk.countdown_in', { duration: orgNoteCountdown })}
              </div>
            </>
          )}
          {orgNote.message && (
            <div style={KIOSK_STYLES.orgNoteMessage}>«&nbsp;{orgNote.message}&nbsp;»</div>
          )}
        </div>
      )}

      <style>{`
        @keyframes kioskPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        [data-kiosk-scroll]::-webkit-scrollbar { display: none; }
        [data-kiosk-scroll] { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
    </div>
  );
};

export default React.memo(KioskDisplay);
