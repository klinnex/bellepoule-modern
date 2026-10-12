/**
 * BellePoule Modern - Modal Resize Hook
 * Licensed under GPL-3.0
 */

import { useEffect, useRef, useState } from 'react';

interface UseModalResizeOptions {
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export const useModalResize = (options: UseModalResizeOptions = {}) => {
  const { defaultWidth = 600, defaultHeight = 400, minWidth = 400, minHeight = 300 } = options;

  const modalRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: defaultWidth,
    height: defaultHeight,
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    // Restaurer les dimensions sauvegardées (la clé est partagée entre plusieurs
    // vues dont les contenus n'ont pas les mêmes contraintes minimales : on
    // reclamp toujours sur les min de CETTE instance pour éviter qu'une taille
    // trop petite enregistrée ailleurs ne rende les cases illisibles ici).
    const savedWidth = localStorage.getItem('modal-score-width');
    const savedHeight = localStorage.getItem('modal-score-height');

    const width = Math.max(minWidth, savedWidth ? parseInt(savedWidth, 10) : defaultWidth);
    const height = Math.max(minHeight, savedHeight ? parseInt(savedHeight, 10) : defaultHeight);

    setDimensions({ width, height });

    // Appliquer les dimensions initiales (min-width/min-height inline pour que
    // la poignée de redimensionnement respecte aussi le plancher par instance,
    // le CSS partagé `.modal.resizable` n'ayant qu'un plancher générique bas).
    requestAnimationFrame(() => {
      modal.style.width = `${width}px`;
      modal.style.height = `${height}px`;
      modal.style.minWidth = `${minWidth}px`;
      modal.style.minHeight = `${minHeight}px`;
    });
  }, [defaultWidth, defaultHeight, minWidth, minHeight]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    // Observer les changements de taille
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });

        // Sauvegarder les dimensions
        localStorage.setItem('modal-score-width', width.toString());
        localStorage.setItem('modal-score-height', height.toString());
      }
    });

    resizeObserver.observe(modal);

    // Gérer le début et la fin du redimensionnement
    const handleMouseDown = (e: MouseEvent) => {
      if (!modal) return;

      const rect = modal.getBoundingClientRect();
      const isNearBottom = e.clientY > rect.bottom - 10 && e.clientY < rect.bottom + 10;
      const isNearRight = e.clientX > rect.right - 10 && e.clientX < rect.right + 10;

      if (isNearBottom || isNearRight) {
        setIsResizing(true);
        modal.classList.add('resizing');
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (modal) {
        modal.classList.remove('resizing');
      }
    };

    modal.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizeObserver.disconnect();
      modal.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return {
    modalRef,
    dimensions,
    isResizing,
    setIsResizing,
  };
};
