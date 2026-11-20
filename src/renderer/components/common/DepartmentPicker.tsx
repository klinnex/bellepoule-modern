/**
 * BellePoule Modern - Sélecteur de département français (liste déroulante, #1504)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { DEPARTMENTS, normalizeDepartment } from '../../../shared/utils/departments';

interface DepartmentPickerProps {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}

const DepartmentPicker: React.FC<DepartmentPickerProps> = ({ value, onChange, id }) => {
  const { t } = useTranslation();
  // Valeur héritée d'un import non standard : conservée comme option pour ne pas être perdue
  const known = normalizeDepartment(value);
  return (
    <select
      id={id}
      className="form-input form-select"
      value={known || value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{t('addFencer.department_choose')}</option>
      {value && !known && <option value={value}>{value}</option>}
      {DEPARTMENTS.map(([code, name]) => (
        <option key={code} value={code}>
          {code} — {name}
        </option>
      ))}
    </select>
  );
};

export default DepartmentPicker;
