/**
 * BellePoule Modern - Tooltip Component
 * UX Improvement: Contextual help without clutter
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: Side;
  delay?: number;
}

const GAP = 6; // entre le déclencheur et la flèche
const ARROW_SIZE = 5;
const MARGIN = 8; // marge minimale au bord de la fenêtre

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Position de l'infobulle (coin haut-gauche) et de la flèche, recadrée dans la fenêtre :
 * bascule haut ↔ bas / gauche ↔ droite si le côté demandé déborde, puis décalage
 * le long du bord (#1755 : infobulles hors écran ou décalées).
 */
export function placeTooltip(
  trigger: Box,
  tip: { width: number; height: number },
  wanted: Side,
  viewport: { width: number; height: number }
): { side: Side; left: number; top: number; arrowLeft: number; arrowTop: number } {
  const off = GAP + ARROW_SIZE;
  let side = wanted;
  if (side === 'top' && trigger.top - off - tip.height < MARGIN) side = 'bottom';
  else if (
    side === 'bottom' &&
    trigger.top + trigger.height + off + tip.height > viewport.height - MARGIN &&
    trigger.top - off - tip.height >= MARGIN
  )
    side = 'top';
  else if (side === 'left' && trigger.left - off - tip.width < MARGIN) side = 'right';
  else if (
    side === 'right' &&
    trigger.left + trigger.width + off + tip.width > viewport.width - MARGIN &&
    trigger.left - off - tip.width >= MARGIN
  )
    side = 'left';

  const cx = trigger.left + trigger.width / 2;
  const cy = trigger.top + trigger.height / 2;
  const clamp = (v: number, size: number, max: number) =>
    Math.max(MARGIN, Math.min(v, max - MARGIN - size));
  let left: number;
  let top: number;
  let arrowLeft: number;
  let arrowTop: number;
  if (side === 'top' || side === 'bottom') {
    left = clamp(cx - tip.width / 2, tip.width, viewport.width);
    top = side === 'top' ? trigger.top - off - tip.height : trigger.top + trigger.height + off;
    arrowLeft = cx - ARROW_SIZE;
    arrowTop = side === 'top' ? trigger.top - off : trigger.top + trigger.height + GAP;
  } else {
    top = clamp(cy - tip.height / 2, tip.height, viewport.height);
    left = side === 'left' ? trigger.left - off - tip.width : trigger.left + trigger.width + off;
    arrowTop = cy - ARROW_SIZE;
    arrowLeft = side === 'left' ? trigger.left - off : trigger.left + trigger.width + GAP;
  }
  return { side, left, top, arrowLeft, arrowTop };
}

const BG = 'rgba(26, 25, 22, 0.82)';

const ARROW_BORDERS: Record<Side, Pick<React.CSSProperties, 'borderWidth' | 'borderColor'>> = {
  top: {
    borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px 0 ${ARROW_SIZE}px`,
    borderColor: `${BG} transparent transparent transparent`,
  },
  bottom: {
    borderWidth: `0 ${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px`,
    borderColor: `transparent transparent ${BG} transparent`,
  },
  left: {
    borderWidth: `${ARROW_SIZE}px 0 ${ARROW_SIZE}px ${ARROW_SIZE}px`,
    borderColor: `transparent transparent transparent ${BG}`,
  },
  right: {
    borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px 0`,
    borderColor: `transparent ${BG} transparent transparent`,
  },
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
}) => {
  const tooltipId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [placement, setPlacement] = useState<ReturnType<typeof placeTooltip> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
    setPlacement(null);
  };

  // Mesure réelle de l'infobulle (rendue invisible) avant de la placer
  useLayoutEffect(() => {
    if (!isVisible || !triggerRef.current || !tipRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    setPlacement(
      placeTooltip(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        { width: tip.width, height: tip.height },
        position,
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [isVisible, position, content]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const shown = isVisible && placement !== null;
  const tipStyle: React.CSSProperties = {
    position: 'fixed',
    left: placement?.left ?? 0,
    top: placement?.top ?? 0,
    maxWidth: `calc(100vw - ${2 * MARGIN}px)`,
    background: BG,
    backdropFilter: 'blur(12px) saturate(160%)',
    WebkitBackdropFilter: 'blur(12px) saturate(160%)',
    color: 'rgba(255,255,255,0.92)',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    zIndex: 9999,
    pointerEvents: 'none',
    opacity: shown ? 1 : 0,
    transition: 'opacity 0.15s ease',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
  };
  const arrowStyle: React.CSSProperties | null = placement && {
    position: 'fixed',
    left: placement.arrowLeft,
    top: placement.arrowTop,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    zIndex: 9999,
    pointerEvents: 'none',
    opacity: shown ? 1 : 0,
    transition: 'opacity 0.15s ease',
    ...ARROW_BORDERS[placement.side],
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onKeyDown={e => e.key === 'Escape' && hideTooltip()}
        aria-describedby={isVisible ? tooltipId : undefined}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>
      {/* Portail vers body : un ancêtre transformé / flouté (carte, en-tête, modal) décalerait position:fixed */}
      {isVisible &&
        createPortal(
          <>
            <div id={tooltipId} ref={tipRef} role="tooltip" style={tipStyle}>
              {content}
            </div>
            {arrowStyle && <div style={arrowStyle} />}
          </>,
          document.body
        )}
    </>
  );
};

/** Bouton icône : infobulle accessible (survol + focus clavier) et aria-label par défaut */
export const TipButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tip: string }
> = ({ tip, ...rest }) => (
  <Tooltip content={tip}>
    <button aria-label={tip} {...rest} />
  </Tooltip>
);

// Icon Button with Tooltip
interface IconButtonProps {
  icon: string;
  tooltip: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export const IconButtonWithTooltip: React.FC<IconButtonProps> = ({
  icon,
  tooltip,
  onClick,
  variant = 'secondary',
  disabled = false,
}) => {
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: '#3b82f6', hover: '#2563eb', text: 'white' };
      case 'danger':
        return { bg: '#ef4444', hover: '#dc2626', text: 'white' };
      default:
        return { bg: '#f3f4f6', hover: '#e5e7eb', text: '#374151' };
    }
  };

  const colors = getColors();

  return (
    <Tooltip content={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: colors.bg,
          color: colors.text,
          fontSize: '1.125rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={e => !disabled && (e.currentTarget.style.backgroundColor = colors.hover)}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = colors.bg)}
      >
        {icon}
      </button>
    </Tooltip>
  );
};

// Help Tooltip - For form inputs
interface HelpTooltipProps {
  text: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ text }) => {
  return (
    <Tooltip content={text} position="right">
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-border)',
          color: 'var(--color-text-light)',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          cursor: 'help',
          marginLeft: '6px',
        }}
      >
        ?
      </span>
    </Tooltip>
  );
};

export default React.memo(Tooltip);
