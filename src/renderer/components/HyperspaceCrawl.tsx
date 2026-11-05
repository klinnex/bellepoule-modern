/**
 * BellePoule Modern - Easter egg « Hyperespace » (double-clic sur le numéro de build)
 * Saut en hyperespace (canvas), « il y a bien longtemps… », logo, texte déroulant en
 * perspective dont l'épisode = numéro de build en chiffres romains, poule-faucon
 * poursuivie par un carton noir. Marche impériale en « cot-cot ». Clic / Échap : retour.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';

interface Props {
  build?: number;
  onDone: () => void;
}

/** Titres parodiques disponibles (clés about.crawl_title_N), choisis par build % N. */
export const CRAWL_TITLE_COUNT = 7;

/** Début de la musique / du logo (s), aligné sur l'animation CSS bp-crawl-logo. */
const LOGO_AT = 6.4;
/** Fin automatique (ms) : texte déroulant + générique de fin. */
const AUTO_CLOSE_MS = 46000;

/** Chiffres romains (1–3999), sinon chiffres arabes. */
export function toRoman(n: number | undefined): string {
  if (n === undefined || !Number.isInteger(n) || n < 1 || n > 3999) return String(n ?? '?');
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rest = n;
  let out = '';
  for (const [value, sym] of table) {
    while (rest >= value) {
      out += sym;
      rest -= value;
    }
  }
  return out;
}

// Marche impériale jouée en « cot-cot » de poule. Chaque note = [fréquence Hz, départ s, durée s].
const IMPERIAL_MARCH: [number, number, number][] = [
  [392, 0.0, 0.45],
  [392, 0.55, 0.45],
  [392, 1.1, 0.45],
  [311, 1.65, 0.33],
  [466, 2.05, 0.13],
  [392, 2.2, 0.45],
  [311, 2.75, 0.33],
  [466, 3.15, 0.13],
  [392, 3.3, 0.6],
  [587, 4.1, 0.45],
  [587, 4.65, 0.45],
  [587, 5.2, 0.45],
  [622, 5.75, 0.33],
  [466, 6.15, 0.13],
  [370, 6.3, 0.45],
  [311, 6.85, 0.33],
  [466, 7.25, 0.13],
  [392, 7.4, 0.6],
];

// Un « cot » : double chirp descendant accordé sur la note de la mélodie.
function playCluck(ctx: AudioContext, freq: number, start: number, dur: number): void {
  const t0 = ctx.currentTime + start;
  [1, 0.82].forEach((mult, i) => {
    const at = t0 + i * 0.07;
    const f = freq * mult;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 1.35, at);
    osc.frequency.exponentialRampToValueAtTime(f, at + 0.05);
    osc.frequency.exponentialRampToValueAtTime(f * 0.65, at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  });
}

// Souffle du saut en hyperespace : bruit blanc filtré, balayage passe-bande.
function playWhoosh(ctx: AudioContext): void {
  const len = ctx.sampleRate * 2.6;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  const t0 = ctx.currentTime;
  filter.frequency.setValueAtTime(150, t0);
  filter.frequency.exponentialRampToValueAtTime(3200, t0 + 1.4);
  filter.frequency.exponentialRampToValueAtTime(120, t0 + 2.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.35, t0 + 1.3);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.6);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t0);
}

/** Vitesse du champ d'étoiles (unités/frame) selon le temps écoulé (s) : saut puis croisière. */
export function warpSpeed(t: number): number {
  if (t < 0.4) return 0.6;
  if (t < 1.5) return 0.6 + ((t - 0.4) / 1.1) ** 3 * 45;
  if (t < 2.6) return 45.6 - ((t - 1.5) / 1.1) * 45;
  return 0.6;
}

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
}

const DEPTH = 1000;

function runStarfield(canvas: HTMLCanvasElement, animate: boolean): () => void {
  let ctx: CanvasRenderingContext2D | null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return () => {};
  const g = ctx;
  const resize = () => {
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  const spawn = (s: Star) => {
    s.x = (Math.random() - 0.5) * 2000;
    s.y = (Math.random() - 0.5) * 2000;
    s.z = s.pz = Math.random() * DEPTH + 1;
  };
  const stars: Star[] = Array.from({ length: 700 }, () => {
    const s = { x: 0, y: 0, z: 0, pz: 0 };
    spawn(s);
    return s;
  });

  const start = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const t = animate ? (now - start) / 1000 : 99;
    const speed = warpSpeed(t);
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / 2;
    // Traînées : fond semi-opaque pendant le saut, net en croisière
    g.fillStyle = speed > 3 ? 'rgba(0,0,8,0.35)' : '#000008';
    g.fillRect(0, 0, w, h);
    // Flash bleu au pic du saut
    if (speed > 30) {
      g.fillStyle = `rgba(170,210,255,${((speed - 30) / 16) * 0.35})`;
      g.fillRect(0, 0, w, h);
    }
    for (const s of stars) {
      s.pz = s.z;
      s.z -= speed;
      if (s.z < 1) {
        spawn(s);
        continue;
      }
      const sx = cx + (s.x / s.z) * scale;
      const sy = cy + (s.y / s.z) * scale;
      const px = cx + (s.x / s.pz) * scale;
      const py = cy + (s.y / s.pz) * scale;
      if (sx < 0 || sx > w || sy < 0 || sy > h) {
        spawn(s);
        continue;
      }
      const bright = 1 - s.z / DEPTH;
      g.strokeStyle = speed > 3 ? `rgba(190,220,255,${bright})` : `rgba(255,255,255,${bright})`;
      g.lineWidth = Math.max(0.5, bright * 2.2);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(speed > 3 ? sx : sx + 0.6, speed > 3 ? sy : sy + 0.6);
      g.stroke();
    }
    if (animate) raf = requestAnimationFrame(frame);
  };
  if (animate) raf = requestAnimationFrame(frame);
  else frame(start);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

const HyperspaceCrawl: React.FC<Props> = ({ build, onDone }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stopStars = canvasRef.current ? runStarfield(canvasRef.current, !reduced) : () => {};

    let audio: AudioContext | null = null;
    try {
      audio = new AudioContext();
      if (!reduced) playWhoosh(audio);
      const ctx = audio;
      const offset = reduced ? 0 : LOGO_AT;
      IMPERIAL_MARCH.forEach(([f, s, d]) => playCluck(ctx, f, s + offset, d));
    } catch {
      // AudioContext non disponible
    }

    // Échap : ferme l'easter egg sans fermer la modale À propos (capture avant useFocusTrap)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onDoneRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    const timer = setTimeout(() => onDoneRef.current(), AUTO_CLOSE_MS);

    return () => {
      stopStars();
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      audio?.close().catch(() => {});
    };
  }, []);

  const titleIdx = (((build ?? 0) % CRAWL_TITLE_COUNT) + CRAWL_TITLE_COUNT) % CRAWL_TITLE_COUNT;

  return (
    <div
      className="bp-crawl"
      data-testid="hyperspace-crawl"
      onClick={e => {
        e.stopPropagation();
        onDone();
      }}
    >
      <canvas ref={canvasRef} className="bp-crawl-stars" aria-hidden="true" />

      <p className="bp-crawl-intro">{t('about.crawl_intro')}</p>

      <div className="bp-crawl-logo" aria-hidden="true">
        BELLE
        <br />
        POULE
      </div>

      <div className="bp-crawl-stage">
        <div className="bp-crawl-plane">
          <div className="bp-crawl-text">
            <p className="bp-crawl-episode">{t('about.crawl_episode', { n: toRoman(build) })}</p>
            <h2 className="bp-crawl-title">{t(`about.crawl_title_${titleIdx}`)}</h2>
            <p>{t('about.crawl_body_1')}</p>
            <p>{t('about.crawl_body_2', { build: build ?? '?' })}</p>
            <p>{t('about.crawl_body_3')}</p>
          </div>
        </div>
      </div>

      {/* Poule-faucon poursuivie par un carton noir */}
      <div className="bp-crawl-flyby" aria-hidden="true">
        <span className="bp-crawl-hen">🐔</span>
        <span className="bp-crawl-bolt" />
        <span className="bp-crawl-card" />
      </div>

      <div className="bp-crawl-end">{t('about.easter')}</div>
      <div className="bp-crawl-skip">{t('about.crawl_skip')}</div>
    </div>
  );
};

export default HyperspaceCrawl;
