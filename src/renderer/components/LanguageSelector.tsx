/**
 * BellePoule Modern - Language Selector Component
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { Language } from '../contexts/TranslationContext';

interface LanguageSelectorProps {
  className?: string;
  showLabel?: boolean;
  onLanguageChange?: (language: Language) => void;
  value?: Language;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  className = '',
  showLabel = true,
  onLanguageChange,
  value,
}) => {
  const { language, changeLanguage, availableLanguages, isLoading, t } = useTranslation();

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = event.target.value as Language;

    if (onLanguageChange) {
      // Mode "sélection" - ne pas appliquer immédiatement
      onLanguageChange(newLanguage);
    } else {
      // Mode "immédiat" - appliquer directement
      changeLanguage(newLanguage);
    }
  };

  if (isLoading) {
    return (
      <div className={`language-selector ${className}`}>
        {showLabel && <span>{t('messages.loading')}</span>}
      </div>
    );
  }

  return (
    <div className={`language-selector ${className}`}>
      {showLabel && <label htmlFor="language-select">{t('ui.language_label')}</label>}
      <select
        id="language-select"
        value={value !== undefined ? value : language}
        onChange={handleLanguageChange}
        className="form-input form-select"
        style={{ minWidth: '120px' }}
      >
        {availableLanguages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default React.memo(LanguageSelector);
