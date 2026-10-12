/**
 * BellePoule Modern - useFocusTrap
 * Piège le focus clavier dans une modal et restaure le focus à la fermeture.
 * Ferme sur Échap via onClose.
 * Licensed under GPL-3.0
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose?: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus initial : élément marqué autofocus sinon premier focusable
    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true'
      );
    const preferred = container?.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    (preferred ?? focusables()[0])?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container?.addEventListener('keydown', handleKeyDown);
    return () => {
      container?.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
