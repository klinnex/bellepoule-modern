/**
 * BellePoule Modern - CoachMark Component
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';

const STORAGE_PREFIX = 'bp_coach_';
/** Durée d'affichage de l'aide ponctuelle à la première apparition (ms) */
const INTRO_MS = 8000;

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === '1';
  } catch {
    return false;
  }
}

interface CoachMarkProps {
  id?: string;
  /** Libellé « Ne plus afficher » : active l'aide ponctuelle (affichée une fois, mémorisée) */
  dismissLabel?: string;
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

const CoachMark: React.FC<CoachMarkProps> = ({
  id,
  dismissLabel,
  message,
  position = 'bottom',
  children,
}) => {
  // Aide ponctuelle : affichée seule quelques secondes tant que « Ne plus afficher » n'a pas été choisi
  const [intro, setIntro] = useState(() => !!id && !!dismissLabel && !isDismissed(id));
  // Sous-titre affiché au survol / focus du bouton
  const [hover, setHover] = useState(false);
  const visible = hover || intro;
  const dismiss = () => {
    setIntro(false);
    try {
      if (id) localStorage.setItem(STORAGE_PREFIX + id, '1');
    } catch {
      /* stockage indisponible : l'aide reviendra */
    }
  };
  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(timer);
  }, [intro]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  // Décalage horizontal qui garde la bulle dans la fenêtre (#1543 : bouton au bord droit)
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!visible || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    if (position === 'top') setPos({ top: r.top - 8, left: r.left + r.width / 2 });
    else if (position === 'left') setPos({ top: r.top + r.height / 2, left: r.left - 8 });
    else if (position === 'right') setPos({ top: r.top + r.height / 2, left: r.right + 8 });
    else setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
  }, [visible, position]);

  useLayoutEffect(() => {
    if (!visible || !tipRef.current) return;
    // Largeur seule (indépendante du décalage) : pas de boucle de rendu
    const width = tipRef.current.offsetWidth;
    const margin = 8;
    const base =
      position === 'right'
        ? pos.left
        : position === 'left'
          ? pos.left - width
          : pos.left - width / 2;
    const right = base + width;
    const next = Math.round(
      right > window.innerWidth - margin
        ? window.innerWidth - margin - right
        : base < margin
          ? margin - base
          : 0
    );
    setShift(next);
  }, [visible, pos, position, message]);

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left + shift,
    zIndex: 99999,
    background: '#1e40af',
    color: 'white',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    fontSize: '0.8rem',
    whiteSpace: 'normal',
    width: 'max-content',
    maxWidth: 'min(22rem, calc(100vw - 16px))',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    pointerEvents: intro ? 'auto' : 'none',
    ...(position === 'bottom'
      ? { transform: 'translateX(-50%)' }
      : position === 'top'
        ? { transform: 'translate(-50%, -100%)' }
        : position === 'right'
          ? { transform: 'translateY(-50%)' }
          : { transform: 'translate(-100%, -50%)' }),
  };

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    ...(position === 'bottom'
      ? {
          bottom: '100%',
          left: `calc(50% - ${shift}px)`,
          transform: 'translateX(-50%)',
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: '5px solid #1e40af',
        }
      : position === 'top'
        ? {
            top: '100%',
            left: `calc(50% - ${shift}px)`,
            transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1e40af',
          }
        : {}),
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {children}
      {visible && (
        <div ref={tipRef} style={tooltipStyle}>
          <span style={arrowStyle} />
          {message}
          {intro && (
            <button type="button" className="coach-dismiss" onClick={dismiss}>
              {dismissLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CoachMark);
