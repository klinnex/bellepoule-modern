/**
 * BellePoule Modern — Confetti Animation
 * Triggered on pool completion and tournament winner
 * Licensed under GPL-3.0
 */

import React, { useEffect, useRef, useCallback } from 'react';

// Préférence utilisateur : désactiver les animations de feux d'artifice (Paramètres)
export const CONFETTI_DISABLED_KEY = 'bellepoule-confetti-disabled';

export const isConfettiDisabled = (): boolean => {
  try {
    return localStorage.getItem(CONFETTI_DISABLED_KEY) === 'true';
  } catch {
    return false;
  }
};

interface ConfettiProps {
  active: boolean;
  duration?: number;
  particleCount?: number;
  origin?: { x: number; y: number };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  shape: 'rect' | 'circle';
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  decay: number;
}

const COLORS = [
  '#3B5BDB',
  '#6B84E8',
  '#F59E0B',
  '#10B981',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#FACC15',
];

const Confetti: React.FC<ConfettiProps> = ({
  active,
  duration = 3000,
  particleCount = 160,
  origin = { x: 0.5, y: 0.3 },
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const createParticles = useCallback(
    (canvas: HTMLCanvasElement): Particle[] => {
      const cx = canvas.width * origin.x;
      const cy = canvas.height * origin.y;
      return Array.from({ length: particleCount }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 10;
        return {
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          shape: Math.random() > 0.4 ? 'rect' : 'circle',
          size: 4 + Math.random() * 8,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          opacity: 1,
          decay: 0.012 + Math.random() * 0.008,
        };
      });
    },
    [origin, particleCount]
  );

  const enabled = active && !isConfettiDisabled();

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    particlesRef.current = createParticles(canvas);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(p => p.opacity > 0.02);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // gravity
        p.vx *= 0.99; // air resistance
        p.rotation += p.rotationSpeed;
        p.opacity -= p.decay;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animRef.current = requestAnimationFrame(tick);

    const timer = setTimeout(() => {
      cancelAnimationFrame(animRef.current);
      particlesRef.current = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, duration);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(timer);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, duration, createParticles]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
};

export default React.memo(Confetti);
