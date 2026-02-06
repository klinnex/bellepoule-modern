"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Settings Modal Component
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const useTranslation_1 = require("../hooks/useTranslation");
const LanguageSelector_1 = __importDefault(require("./LanguageSelector"));
const SettingsModal = ({ onClose, onSave }) => {
    const { t, language, theme, changeLanguage, changeTheme } = (0, useTranslation_1.useTranslation)();
    const [settings, setSettings] = (0, react_1.useState)({
        language: language,
        theme: theme,
        // Ajouter d'autres paramètres ici
    });
    // Update local settings when global language/theme changes (e.g., from localStorage)
    (0, react_1.useEffect)(() => {
        console.log(`🔄 SettingsModal: Global language changed to ${language}, theme to ${theme}, updating local state`);
        setSettings(prev => ({ ...prev, language, theme }));
    }, [language, theme]);
    const handleLanguageChange = (newLanguage) => {
        console.log(`🔄 SettingsModal: Language selected: ${newLanguage} (current: ${settings.language})`);
        setSettings(prev => ({ ...prev, language: newLanguage }));
    };
    const handleThemeChange = (newTheme) => {
        console.log(`🎨 SettingsModal: Theme selected: ${newTheme} (current: ${settings.theme})`);
        setSettings(prev => ({ ...prev, theme: newTheme }));
    };
    const handleSave = () => {
        // Appliquer le changement de langue seulement à la sauvegarde
        if (settings.language !== language) {
            console.log(`🌍 SettingsModal: Applying language change from ${language} to ${settings.language}`);
            changeLanguage(settings.language);
        }
        else {
            console.log(`🌍 SettingsModal: No language change needed`);
        }
        // Appliquer le changement de thème
        if (settings.theme !== theme) {
            console.log(`🎨 SettingsModal: Applying theme change from ${theme} to ${settings.theme}`);
            changeTheme(settings.theme);
        }
        else {
            console.log(`🎨 SettingsModal: No theme change needed`);
        }
        onSave(settings);
        onClose();
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: onClose, children: (0, jsx_runtime_1.jsxs)("div", { className: "modal", onClick: (e) => e.stopPropagation(), style: { maxWidth: '500px' }, children: [(0, jsx_runtime_1.jsx)("div", { className: "modal-header", children: (0, jsx_runtime_1.jsx)("h2", { className: "modal-title", children: t('settings.title') }) }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsx)("div", { className: "form-group", children: (0, jsx_runtime_1.jsx)(LanguageSelector_1.default, { showLabel: true, value: settings.language, onLanguageChange: handleLanguageChange }) }), (0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { children: t('settings.theme') }), (0, jsx_runtime_1.jsxs)("select", { className: "form-select", value: settings.theme, onChange: (e) => handleThemeChange(e.target.value), children: [(0, jsx_runtime_1.jsx)("option", { value: "default", children: "Default" }), (0, jsx_runtime_1.jsx)("option", { value: "light", children: "Light" }), (0, jsx_runtime_1.jsx)("option", { value: "dark", children: "Dark" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: onClose, children: t('actions.cancel') }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: handleSave, children: t('settings.save') })] })] }) }));
};
exports.default = SettingsModal;
//# sourceMappingURL=SettingsModal.js.map