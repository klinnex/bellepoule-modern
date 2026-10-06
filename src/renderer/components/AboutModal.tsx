import React, { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { VersionInfo } from '../../shared/types/preload';

interface Props {
  onClose: () => void;
}

// Marche impériale (Star Wars) jouée en « cot-cot » de poule.
// Chaque note = [fréquence Hz, départ s, durée s].
const IMPERIAL_MARCH: [number, number, number][] = [
  [392, 0.0, 0.45],
  [392, 0.55, 0.45],
  [392, 1.1, 0.45], // Sol Sol Sol
  [311, 1.65, 0.33],
  [466, 2.05, 0.13],
  [392, 2.2, 0.45], // Mib Sib Sol
  [311, 2.75, 0.33],
  [466, 3.15, 0.13],
  [392, 3.3, 0.6], // Mib Sib Sol
  [587, 4.1, 0.45],
  [587, 4.65, 0.45],
  [587, 5.2, 0.45], // Ré Ré Ré
  [622, 5.75, 0.33],
  [466, 6.15, 0.13],
  [370, 6.3, 0.45], // Mib Sib Solb
  [311, 6.85, 0.33],
  [466, 7.25, 0.13],
  [392, 7.4, 0.6], // Mib Sib Sol
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
    gain.gain.exponentialRampToValueAtTime(0.26, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  });
}

function playImperialMarch(): void {
  try {
    const ctx = new AudioContext();
    IMPERIAL_MARCH.forEach(([freq, start, dur]) => playCluck(ctx, freq, start, dur));
  } catch {
    // AudioContext non disponible
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12000,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--bg-secondary, #1e1e2e)',
    border: '1px solid var(--border-color, #333)',
    borderRadius: '12px',
    padding: '2rem',
    minWidth: '380px',
    maxWidth: '500px',
    color: 'var(--text-primary, #e0e0e0)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    position: 'relative',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: 'var(--accent-color, #7c9ef5)',
  },
  versionLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  versionBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '6px',
    background: 'var(--bg-tertiary, #2a2a3e)',
    border: '1px solid var(--border-color, #444)',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    color: 'var(--text-muted, #aaa)',
  },
  buildBadge: {
    display: 'inline-block',
    cursor: 'pointer',
    padding: '2px 10px',
    borderRadius: '6px',
    background: 'var(--bg-tertiary, #2a2a3e)',
    border: '1px solid var(--border-color, #444)',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    userSelect: 'none',
    animation: 'bp-build-pulse 2.5s ease-in-out infinite',
  },
  meta: { fontSize: '0.82rem', color: 'var(--text-muted, #888)' },
  desc: { fontSize: '0.9rem', marginTop: '1rem', lineHeight: 1.6 },
  licence: { fontSize: '0.8rem', color: 'var(--text-muted, #888)', marginTop: '0.8rem' },
  hint: {
    fontSize: '0.72rem',
    color: 'var(--text-muted, #555)',
    marginTop: '0.3rem',
    fontStyle: 'italic',
  },
  closeBtn: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.2rem',
    color: 'var(--text-muted, #888)',
    lineHeight: 1,
  },
  // Arena
  arena: {
    marginTop: '1.2rem',
    background: 'linear-gradient(180deg, #08081a 60%, #180800 100%)',
    borderRadius: '8px',
    border: '1px solid #2a2a3a',
    position: 'relative',
    width: '100%',
    height: '110px',
    overflow: 'hidden',
  },
  easterText: {
    fontSize: '0.72rem',
    color: '#555',
    textAlign: 'center',
    marginTop: '0.4rem',
    letterSpacing: '0.05em',
  },
};

// Poules face-à-face dans une arène 310×160px :
//   Gauche (🐔 mirrored → face droite) : left=5px, avance à 80px au clash
//   Droite (🐔 naturel → face gauche)  : left=221px, avance à 146px au clash
//
// Sabres VERTICAUX (pointent vers le haut) :
//   Bleu  : div horizontal 75px, transformOrigin left center, rotate(-85deg) au repos
//           → pointe quasi verticale. Au clash : left avance + rotate(-62deg) vers centre
//   Rouge : div horizontal 75px, transformOrigin right center, rotate(85deg) au repos
//           Au clash : left recule + rotate(62deg) → les tips se croisent au-dessus
//
// Positions chicken centre vertical : top=68% (=109px / arène 160px)
// Tip bleu repos   : x≈53px,  y≈35px (au-dessus du centre) ✓
// Tip bleu clash   : x=155px, y≈47px  ┐
// Tip rouge clash  : x=147px, y≈47px  ┘ → croisement ~151px ≈ 50% largeur ✓

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* Poule gauche miroir (face droite), avance vers centre */
    @keyframes bp-hen-left {
      0%,100% { left: 5px; }
      38%,58% { left: 80px; }
    }
    /* Poule droite naturelle (face gauche), avance vers centre */
    @keyframes bp-hen-right {
      0%,100% { left: 221px; }
      38%,58% { left: 146px; }
    }
    /* Sabre bleu — tenu par la poule gauche, POINTE VERS LE HAUT
       Au repos : quasi vertical (-85°), avance et se penche vers le centre (-62°) */
    @keyframes bp-saber-blue {
      0%,100% {
        left: 49px;
        transform: translateY(-50%) rotate(-85deg);
        box-shadow: 0 0 8px 3px #39f, 0 0 2px 1px #9cf;
      }
      38%,58% {
        left: 124px;
        transform: translateY(-50%) rotate(-62deg);
        box-shadow: 0 0 20px 7px #39f, 0 0 5px 2px #9cf;
      }
    }
    /* Sabre rouge — tenu par la poule droite, POINTE VERS LE HAUT
       Au repos : quasi vertical (+85°), avance et se penche vers le centre (+62°) */
    @keyframes bp-saber-red {
      0%,100% {
        left: 146px;
        transform: translateY(-50%) rotate(85deg);
        box-shadow: 0 0 8px 3px #f33, 0 0 2px 1px #f99;
      }
      38%,58% {
        left: 71px;
        transform: translateY(-50%) rotate(62deg);
        box-shadow: 0 0 20px 7px #f33, 0 0 5px 2px #f99;
      }
    }
    /* Étincelles au point de croisement (~50% largeur, ~30% hauteur) */
    @keyframes bp-spark {
      0%,34%,64%,100% { opacity: 0; transform: translate(-50%,-180%) scale(0) rotate(0deg); }
      44%             { opacity: 1; transform: translate(-50%,-180%) scale(1.6) rotate(15deg); }
      52%             { opacity: 0.8; transform: translate(-50%,-180%) scale(1.1) rotate(-10deg); }
      58%             { opacity: 0; transform: translate(-50%,-180%) scale(0.2) rotate(5deg); }
    }
    /* Pulsation subtile sur le numéro de build */
    @keyframes bp-build-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(255,180,50,0); color: var(--text-muted,#aaa); }
      50%     { box-shadow: 0 0 0 3px rgba(255,180,50,0.25); color: #ffa; }
    }
  `;
  document.head.appendChild(style);
}

const ANIM_DURATION = '2s';
const ANIM_ITER = '5';
const ANIM_EASE = 'ease-in-out';

const AboutModal: React.FC<Props> = ({ onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [easterActive, setEasterActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    injectKeyframes();
    window.electronAPI
      ?.getVersionInfo()
      .then(setVersionInfo)
      .catch(() => {});
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const triggerEasterEgg = () => {
    if (easterActive) return;
    setEasterActive(true);
    playImperialMarch();
    // Mélodie ~8s + marge animation
    timerRef.current = setTimeout(() => setEasterActive(false), 10200);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const buildDate = versionInfo
    ? new Date(versionInfo.date).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '…';

  const anim = (name: string) => `${name} ${ANIM_DURATION} ${ANIM_EASE} ${ANIM_ITER} forwards`;

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div ref={modalRef} style={styles.modal} role="dialog" aria-modal="true">
        <button style={styles.closeBtn} onClick={onClose} title="Fermer">
          ✕
        </button>

        <div style={styles.title}>BellePoule Modern</div>

        <div style={styles.versionLine}>
          <span style={styles.versionBadge}>v{versionInfo?.version ?? '…'}</span>
          <span
            style={styles.buildBadge}
            onDoubleClick={triggerEasterEgg}
            title="Double-clic pour une surprise…"
          >
            #{versionInfo?.build ?? '…'}
          </span>
          <span style={styles.meta}>— {buildDate}</span>
        </div>

        <div style={styles.hint}>💡 Double-clique sur le numéro de build…</div>

        <div style={styles.desc}>
          Logiciel de gestion de tournois d'escrime.
          <br />
          Poules, tableaux directs, arbitrage déporté en temps réel.
        </div>

        <div style={styles.licence}>
          Licence : GPL-3.0 &nbsp;·&nbsp; © 2024-2026 BellePoule Modern Contributors
        </div>

        {easterActive && (
          <>
            {/* Arena — 310px × 160px, sabres visibles en hauteur */}
            <div
              style={{
                ...styles.arena,
                maxWidth: '310px',
                height: '160px',
                margin: '1.2rem auto 0',
              }}
            >
              {/* Poule gauche — scaleX(-1) pour la faire face à droite, bas de l'arène */}
              <div
                style={{
                  position: 'absolute',
                  top: '68%',
                  transform: 'translateY(-50%) scaleX(-1)',
                  fontSize: '2.6rem',
                  lineHeight: 1,
                  animation: anim('bp-hen-left'),
                }}
              >
                🐔
              </div>

              {/* Sabre bleu — origin gauche, POINTE VERS LE HAUT (-85° repos) */}
              <div
                style={{
                  position: 'absolute',
                  top: '68%',
                  width: '75px',
                  height: '5px',
                  borderRadius: '3px 1px 1px 3px',
                  background: 'linear-gradient(90deg, #fff 0%, #6cf 10%, #39f 55%, #06c 100%)',
                  transformOrigin: 'left center',
                  animation: anim('bp-saber-blue'),
                }}
              />

              {/* Sabre rouge — origin droite, POINTE VERS LE HAUT (+85° repos) */}
              <div
                style={{
                  position: 'absolute',
                  top: '68%',
                  width: '75px',
                  height: '5px',
                  borderRadius: '1px 3px 3px 1px',
                  background: 'linear-gradient(270deg, #fff 0%, #f99 10%, #f33 55%, #900 100%)',
                  transformOrigin: 'right center',
                  animation: anim('bp-saber-red'),
                }}
              />

              {/* Poule droite — naturellement face gauche, bas de l'arène */}
              <div
                style={{
                  position: 'absolute',
                  top: '68%',
                  transform: 'translateY(-50%)',
                  fontSize: '2.6rem',
                  lineHeight: 1,
                  animation: anim('bp-hen-right'),
                }}
              >
                🐔
              </div>

              {/* Étincelles au croisement — décalées vers le haut (~30% de l'arène) */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '68%',
                  fontSize: '1.3rem',
                  pointerEvents: 'none',
                  zIndex: 10,
                  animation: anim('bp-spark'),
                }}
              >
                ✨⚡✨
              </div>
            </div>

            <div style={styles.easterText}>🐔 &nbsp; Cot-cot ! &nbsp; 🐔</div>
          </>
        )}
      </div>
    </div>
  );
};

export default AboutModal;
