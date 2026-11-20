/**
 * BellePoule Modern - Replay d'un match depuis le journal d'audit (#1074)
 * Rejoue les événements un par un : score et cartons à chaque instant.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { MatchEventEntry } from '../../shared/types';
import { buildMatchReplay, formatReplayOffset } from '../../shared/utils/matchReplay';
import { describeMatchEvent } from '../../shared/utils/multiFormatExport';
import { useTranslation } from '../contexts/TranslationContext';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Icon } from './common/Icon';

interface MatchReplayProps {
  entries: MatchEventEntry[];
  nameA?: string;
  nameB?: string;
}

const CARD_COLORS: Record<string, string> = {
  white: '#f3f4f6',
  yellow: '#facc15',
  red: '#ef4444',
  black: '#111827',
};

const PLAY_INTERVAL_MS = 1000;

const MatchReplay: React.FC<MatchReplayProps> = ({ entries, nameA, nameB }) => {
  const { t } = useTranslation();
  const frames = useMemo(() => buildMatchReplay(entries), [entries]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;

  useEffect(() => setIndex(0), [frames]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex(i => Math.min(i + 1, last)), PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, index, last]);

  if (frames.length === 0) {
    return <div className="match-replay-1">{t('replay.empty')}</div>;
  }

  const frame = frames[Math.min(index, last)];
  const side = (
    name: string | undefined,
    fallback: string,
    score: number,
    cards: typeof frame.cardsA
  ) => (
    <div className="match-replay-2">
      <div className="match-replay-3">{name || fallback}</div>
      <div className="match-replay-4">{score}</div>
      <div className="match-replay-5">
        {cards.map((c, i) => (
          <span
            key={i}
            title={c.reason ?? c.type}
            style={{
              width: '10px',
              height: '14px',
              borderRadius: '2px',
              border: '1px solid #9ca3af',
              background: CARD_COLORS[c.type] ?? '#9ca3af',
            }}
          />
        ))}
      </div>
    </div>
  );

  const btn: React.CSSProperties = {
    padding: '0.3rem 0.7rem',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: 'transparent',
    cursor: 'pointer',
  };

  return (
    <div className="match-replay-6">
      <div className="u-row">
        {side(nameA, t('replay.fencer_a'), frame.scoreA, frame.cardsA)}
        <div className="match-replay-7">{formatReplayOffset(frame.offsetMs)}</div>
        {side(nameB, t('replay.fencer_b'), frame.scoreB, frame.cardsB)}
      </div>
      <div className="match-replay-8">{describeMatchEvent(frame.entry)}</div>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={e => {
          setPlaying(false);
          setIndex(Number(e.target.value));
        }}
        aria-label={t('replay.position')}
        className="w-full"
      />
      <div className="match-replay-9">
        <button
          style={btn}
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label={t('replay.previous')}
        >
          <Icon icon={SkipBack} />
        </button>
        <button
          style={btn}
          onClick={() => {
            if (index >= last) setIndex(0);
            setPlaying(p => !p);
          }}
          aria-label={playing ? t('replay.pause') : t('replay.play')}
        >
          {playing ? <Icon icon={Pause} /> : <Icon icon={Play} />}
        </button>
        <button
          style={btn}
          onClick={() => setIndex(i => Math.min(last, i + 1))}
          disabled={index === last}
          aria-label={t('replay.next')}
        >
          <Icon icon={SkipForward} />
        </button>
        <span className="match-replay-10">
          {t('replay.event_n', { current: index + 1, total: frames.length })}
        </span>
      </div>
    </div>
  );
};

export default MatchReplay;
