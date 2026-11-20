/**
 * BellePoule Modern - Recherche compacte : loupe + boîte de dialogue
 * Icône seule (infobulle « Rechercher »), le champ s'ouvre dans une modale.
 * Terme actif rappelé à côté de la loupe, effaçable d'un clic.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Search, X } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useTranslation } from '../../hooks/useTranslation';

interface SearchDialogButtonProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Libellé accessible du champ (défaut : placeholder) */
  ariaLabel?: string;
  /** Contenu additionnel sous le champ (compteur…) */
  children?: React.ReactNode;
}

export interface SearchDialogButtonHandle {
  open: () => void;
}

export const SearchDialogButton = React.forwardRef<
  SearchDialogButtonHandle,
  SearchDialogButtonProps
>(({ value, onChange, placeholder, ariaLabel, children }, ref) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const label = t('actions.search');

  return (
    <span className="search-dialog-trigger">
      <Button
        className={`search-dialog-btn${value ? ' is-active' : ''}`}
        icon={<Search size={18} aria-hidden="true" />}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
      />
      {value && (
        <span className="search-dialog-term">
          <button
            type="button"
            className="search-dialog-term-text"
            onClick={() => setOpen(true)}
            title={label}
          >
            « {value} »
          </button>
          <button
            type="button"
            className="search-dialog-term-clear"
            onClick={() => onChange('')}
            title={t('actions.clear')}
            aria-label={t('actions.clear')}
          >
            <X size={14} />
          </button>
        </span>
      )}
      {open && (
        <Modal
          title={label}
          size="sm"
          onClose={() => setOpen(false)}
          footer={
            <>
              {value && <Button onClick={() => onChange('')}>{t('actions.clear')}</Button>}
              <Button variant="primary" onClick={() => setOpen(false)}>
                {t('actions.close')}
              </Button>
            </>
          }
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              setOpen(false);
            }}
          >
            <input
              ref={inputRef}
              type="search"
              className="form-input search-dialog-input"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              aria-label={ariaLabel ?? placeholder}
            />
          </form>
          {children}
        </Modal>
      )}
    </span>
  );
});
SearchDialogButton.displayName = 'SearchDialogButton';

export default SearchDialogButton;
