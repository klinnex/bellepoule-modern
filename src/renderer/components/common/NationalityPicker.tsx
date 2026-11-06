/**
 * BellePoule Modern - Sélecteur de nationalité (saisie du code + liste déroulante avec drapeaux)
 * Licensed under GPL-3.0
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { flagEmoji, listCountries } from '../../../shared/utils/countries';

interface NationalityPickerProps {
  value: string;
  onChange: (code: string) => void;
}

const NationalityPicker: React.FC<NationalityPickerProps> = ({ value, onChange }) => {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = language || 'fr';
  const countries = useMemo(() => (open ? listCountries(locale) : []), [open, locale]);
  const flag = flagEmoji(value);

  return (
    <div>
      <div className="u-row">
        {flag && <span aria-hidden="true">{flag}</span>}
        <input
          type="text"
          className="form-input"
          placeholder="FRA"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          maxLength={3}
        />
        <button
          type="button"
          className="btn btn-secondary"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('addFencer.nationality_list')}
          title={t('addFencer.nationality_list')}
          onClick={() => setOpen(o => !o)}
        >
          ▾
        </button>
      </div>
      {open && (
        <select
          className="form-input form-select"
          size={8}
          aria-label={t('addFencer.nationality_list')}
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setOpen(false);
          }}
        >
          {countries.map(c => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code} — {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default NationalityPicker;
