/**
 * BellePoule Modern - Internationalization Hook
 * Licensed under GPL-3.0
 */
export type Language = 'fr' | 'en' | 'br';
export type TranslationKey = string;
export type Theme = 'light' | 'dark' | 'default';
export declare const useTranslation: () => {
    language: any;
    theme: any;
    changeLanguage: (newLanguage: Language) => Promise<void>;
    changeTheme: (newTheme: Theme) => void;
    t: (key: TranslationKey, params?: {
        [key: string]: string | number;
    }) => string;
    isLoading: any;
    availableLanguages: readonly [{
        readonly code: "fr";
        readonly name: "Français";
        readonly flag: "🇫🇷";
    }, {
        readonly code: "en";
        readonly name: "English";
        readonly flag: "🇺🇸";
    }, {
        readonly code: "br";
        readonly name: "Breton";
        readonly flag: "🇫🇷";
    }];
    availableThemes: readonly [{
        readonly code: "default";
        readonly name: "Default";
    }, {
        readonly code: "light";
        readonly name: "Light";
    }, {
        readonly code: "dark";
        readonly name: "Dark";
    }];
};
//# sourceMappingURL=useTranslation.d.ts.map