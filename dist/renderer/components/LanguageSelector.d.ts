/**
 * BellePoule Modern - Language Selector Component
 * Licensed under GPL-3.0
 */
import React from 'react';
import { Language } from '../hooks/useTranslation';
interface LanguageSelectorProps {
    className?: string;
    showLabel?: boolean;
    onLanguageChange?: (language: Language) => void;
    value?: Language;
}
declare const LanguageSelector: React.FC<LanguageSelectorProps>;
export default LanguageSelector;
//# sourceMappingURL=LanguageSelector.d.ts.map