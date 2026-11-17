/**
 * BellePoule Modern - Menu « Outils » de l'en-tête (QR Wi-Fi, télécommande TV, visite
 * guidée, démo). Extrait d'App.tsx (#1897) : état d'ouverture, position et clic extérieur.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlayCircle, Sparkles, Tv2, Wifi, Wrench } from 'lucide-react';
import { Button } from '../common/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { restartGuidedTour } from '../guidedTourFlags';

interface ToolsMenuProps {
  onWifiQR: () => void;
  onTVRemote: () => void;
  onStartDemo: () => void;
}

export const ToolsMenu: React.FC<ToolsMenuProps> = ({ onWifiQR, onTVRemote, onStartDemo }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={wrapRef} className="relative">
      <Button
        ref={btnRef}
        className="btn-icon-label"
        onClick={() => setOpen(v => !v)}
        title={t('app.tools')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Wrench size={15} />
        <span className="header-btn-label">{t('app.tools')}</span>
      </Button>
      {/* Portail vers body : le header (backdrop-filter) piège position:fixed sous la bannière (#1755) */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="tools-menu-panel"
            style={{ right: pos.right, top: pos.top }}
          >
            <button className="comp-header-dropdown-item tools-menu-item" onClick={pick(onWifiQR)}>
              <Wifi size={15} /> {t('app.wifi_qr')}
            </button>
            <button
              className="comp-header-dropdown-item tools-menu-item"
              onClick={pick(onTVRemote)}
            >
              <Tv2 size={15} /> {t('app.tv_remote')}
            </button>
            <button
              className="comp-header-dropdown-item tools-menu-item"
              onClick={pick(restartGuidedTour)}
            >
              <Sparkles size={15} /> {t('app.guided_tour')}
            </button>
            <button
              className="comp-header-dropdown-item tools-menu-item"
              onClick={pick(onStartDemo)}
              title={t('demo.hint')}
            >
              <PlayCircle size={15} /> {t('demo.button')}
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ToolsMenu;
