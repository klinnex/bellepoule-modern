"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Language Selector Component
 * Licensed under GPL-3.0
 */
const react_1 = __importDefault(require("react"));
const useTranslation_1 = require("../hooks/useTranslation");
const LanguageSelector = ({ className = '', showLabel = true, onLanguageChange, value }) => {
    const { language, changeLanguage, availableLanguages, isLoading } = (0, useTranslation_1.useTranslation)();
    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        if (onLanguageChange) {
            // Mode "sélection" - ne pas appliquer immédiatement
            onLanguageChange(newLanguage);
        }
        else {
            // Mode "immédiat" - appliquer directement
            changeLanguage(newLanguage);
        }
    };
    if (isLoading) {
        return ((0, jsx_runtime_1.jsx)("div", { className: `language-selector ${className}`, children: showLabel && (0, jsx_runtime_1.jsx)("span", { children: "Chargement..." }) }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: `language-selector ${className}`, children: [showLabel && ((0, jsx_runtime_1.jsx)("label", { htmlFor: "language-select", children: "Langue :" })), (0, jsx_runtime_1.jsx)("select", { id: "language-select", value: value !== undefined ? value : language, onChange: handleLanguageChange, className: "form-select", style: { minWidth: '120px' }, children: availableLanguages.map((lang) => ((0, jsx_runtime_1.jsxs)("option", { value: lang.code, children: [lang.flag, " ", lang.name] }, lang.code))) })] }));
};
exports.default = LanguageSelector;
//# sourceMappingURL=LanguageSelector.js.map