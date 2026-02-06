/**
 * BellePoule Modern - Settings Modal Component
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useTranslation, Language } from '../hooks/useTranslation';
import LanguageSelector from './LanguageSelector';

interface SettingsModalProps {
  onClose: () => void;
  onSave: (settings: any) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
  const { t, language, theme, changeLanguage, changeTheme } = useTranslation();
  const [settings, setSettings] = useState({
    language: language,
    theme: theme,
    // Ajouter d'autres paramètres ici
  });

  // Update local settings when global language/theme changes (e.g., from localStorage)
  useEffect(() => {
    console.log(`🔄 SettingsModal: Global language changed to ${language}, theme to ${theme}, updating local state`);
    setSettings(prev => ({ ...prev, language, theme }));
  }, [language, theme]);

  const handleLanguageChange = (newLanguage: Language) => {
    console.log(`🔄 SettingsModal: Language selected: ${newLanguage} (current: ${settings.language})`);
    setSettings(prev => ({ ...prev, language: newLanguage }));
  };

  const handleThemeChange = (newTheme: 'default' | 'light' | 'dark') => {
    console.log(`🎨 SettingsModal: Theme selected: ${newTheme} (current: ${settings.theme})`);
    setSettings(prev => ({ ...prev, theme: newTheme }));
  };

  const handleSave = () => {
    // Appliquer le changement de langue seulement à la sauvegarde
    if (settings.language !== language) {
      console.log(`🌍 SettingsModal: Applying language change from ${language} to ${settings.language}`);
      changeLanguage(settings.language);
    } else {
      console.log(`🌍 SettingsModal: No language change needed`);
    }
    
    // Appliquer le changement de thème
    if (settings.theme !== theme) {
      console.log(`🎨 SettingsModal: Applying theme change from ${theme} to ${settings.theme}`);
      changeTheme(settings.theme);
    } else {
      console.log(`🎨 SettingsModal: No theme change needed`);
    }
    
    onSave(settings);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{t('settings.title')}</h2>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <LanguageSelector 
              showLabel={true} 
              value={settings.language}
              onLanguageChange={handleLanguageChange}
            />
          </div>
          
          {/* Ajouter d'autres paramètres ici */}
          <div className="form-group">
            <label>{t('settings.theme')}</label>
            <select 
              className="form-select" 
              value={settings.theme}
              onChange={(e) => handleThemeChange(e.target.value as 'default' | 'light' | 'dark')}
            >
              <option value="default">Default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;