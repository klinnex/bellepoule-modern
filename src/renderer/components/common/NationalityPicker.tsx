/**
 * BellePoule Modern - Sélecteur de nationalité (saisie du code + liste déroulante avec drapeaux)
 * Licensed under GPL-3.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { findCountryIndex, listCountries } from '../../../shared/utils/countries';
import Flag from './Flag';
import { Button } from './Button';

interface NationalityPickerProps {
  value: string;
  onChange: (code: string) => void;
  /** Liste ouverte par-dessus le contenu au lieu de l'étirer (#1504) */
  floating?: boolean;
}

const TYPEAHEAD_RESET_MS = 700;

const NationalityPicker: React.FC<NationalityPickerProps> = ({
  value,
  onChange,
  floating = false,
}) => {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const locale = language || 'fr';
  const countries = useMemo(() => (open ? listCountries(locale) : []), [open, locale]);
  const listRef = useRef<HTMLUListElement>(null);
  const buffer = useRef({ text: '', at: 0 });

  // À l'ouverture : focus sur la liste, pays courant sélectionné
  useEffect(() => {
    if (!open) return;
    const idx = countries.findIndex(c => c.code === value);
    setActive(idx >= 0 ? idx : 0);
    listRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, countries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(countries.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (countries[active]) choose(countries[active].code);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      e.preventDefault();
      const now = Date.now();
      const b = buffer.current;
      b.text = now - b.at > TYPEAHEAD_RESET_MS ? e.key : b.text + e.key;
      b.at = now;
      // Même lettre répétée : pays suivant ; sinon premier pays correspondant
      const repeated = b.text.length > 1 && [...b.text].every(ch => ch === b.text[0]);
      const idx = repeated
        ? findCountryIndex(countries, b.text[0], active + 1)
        : findCountryIndex(countries, b.text, 0);
      if (idx >= 0) setActive(idx);
    }
  };

  return (
    <div className={floating ? 'nat-picker--floating' : undefined}>
      <div className="u-row">
        <Flag code={value} />
        <input
          type="text"
          className="form-input"
          placeholder="FRA"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          maxLength={3}
        />
        <Button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('addFencer.nationality_list')}
          title={t('addFencer.nationality_list')}
          onClick={() => setOpen(o => !o)}
        >
          ▾
        </Button>
      </div>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={0}
          className="form-input nat-list"
          aria-label={t('addFencer.nationality_list')}
          aria-activedescendant={
            countries[active] ? `nat-opt-${countries[active].code}` : undefined
          }
          onKeyDown={onKeyDown}
        >
          {countries.map((c, i) => (
            <li
              key={c.code}
              id={`nat-opt-${c.code}`}
              role="option"
              aria-selected={c.code === value}
              onClick={() => choose(c.code)}
              onMouseMove={() => active !== i && setActive(i)}
              className={`u-row nat-option${i === active ? ' nat-option--active' : ''}`}
            >
              <Flag code={c.code} />
              <span>
                {c.code} — {c.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NationalityPicker;
