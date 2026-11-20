// ESLint flat config (ESLint 9+). Remplace .eslintrc.json (déprécié).
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

// ─── Couches et sens des dépendances (#1979, docs/adr/0002, 0004) ───────────
// Motifs sur le chemin importé (relatif ou alias). Sans exception depuis le lot 3 de #1979 ;
// le cliquet (rendererImports, featuresImports) reste à 0.
const NO_RENDERER = {
  regex: String.raw`(^|/)renderer(/|$)|^@renderer/`,
  message:
    'Couche interface : src/main, src/shared et src/database n’importent pas src/renderer (docs/adr/0002). Déplacer la règle dans src/shared/domain.',
};
const NO_FEATURES = {
  regex: String.raw`(^|/)features(/|$)`,
  message:
    'src/features est une couche d’interface : src/main, src/shared et src/database ne l’importent pas (docs/adr/0004). Déplacer la règle dans src/shared/domain.',
};
const NO_APP_IN_DOMAIN = {
  regex: String.raw`^(react|react-dom|electron|zustand)(/|$)|^(node:)?(fs|path|os|crypto|child_process|net|http|https|dgram|worker_threads)(/|$)|(^|/)(database|main|renderer|features)(/|$)|^@(database|main|renderer)/`,
  message:
    'Domaine pur (docs/adr/0002) : ni React, ni Electron, ni Node, ni base, ni main, ni interface. Injecter la dépendance en paramètre.',
};
const LAYER_FILES = ['src/main/**/*.ts', 'src/shared/**/*.ts', 'src/database/**/*.ts'];
const LAYER_TESTS = ['**/*.test.ts', '**/__tests__/**'];
const restrict = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

module.exports = [
  {
    ignores: [
      'dist',
      'node_modules',
      'release',
      'src/examples',
      '**/*.js',
      '!src/remote/**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslint,
      prettier,
    },
    settings: {
      // Version explicite : 'detect' appelle context.getFilename(), retiré d'ESLint 10.
      react: { version: require('react/package.json').version },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'prettier/prettier': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Règles React Compiler ajoutées par eslint-plugin-react-hooks 7 : dette existante,
      // signalée en avertissement le temps de la résorber.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/globals': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      // Dialogues natifs (alert/confirm/prompt) : cassent le focus clavier sous Electron/Windows
      'no-alert': 'error',
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      // Budget de taille de fichier (#1599) : découper hooks / sous-composants au-delà de 800 lignes.
      // Avertissement ; le plafond dur (cliquet) reste dans scripts/check-quality-ratchet.js.
      'max-lines': ['warn', { max: 800 }],
    },
  },
  {
    // Les fichiers de tests peuvent dépasser le budget (tables de cas)
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { 'max-lines': 'off' },
  },
  {
    // Serveur distant (score en direct) : pas d'E/S fs synchrone, elle bloque la boucle
    // d'événements des tablettes et arènes (#1776). Lecture au démarrage seulement
    // (htmlLoader, i18nBundle, middleware), puis service depuis la mémoire.
    files: ['src/main/remote/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      'src/main/remote/htmlLoader.ts',
      'src/main/remote/i18nBundle.ts',
      'src/main/remote/middleware.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='fs'][callee.property.name=/Sync$/], CallExpression[callee.object.callee.name='require'][callee.property.name=/Sync$/]",
          message:
            'E/S fs synchrone interdite dans le serveur distant (#1776) : fs.promises ou chargement au démarrage.',
        },
      ],
    },
  },
  // Couches (#1979)
  {
    files: LAYER_FILES,
    ignores: LAYER_TESTS,
    rules: restrict(NO_RENDERER, NO_FEATURES),
  },
  {
    files: ['src/shared/domain/**/*.ts'],
    ignores: LAYER_TESTS,
    rules: {
      ...restrict(NO_APP_IN_DOMAIN),
      // Ni navigateur ni pont Electron : le domaine tourne aussi dans le main et le MCP
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator'].map(name => ({
          name,
          message:
            'Domaine pur : pas d’accès au navigateur ni à window.electronAPI (docs/adr/0002).',
        })),
      ],
      // Ni heure système ni hasard : injectés par l'appelant (docs/adr/0002)
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Domaine pur : recevoir l’heure en paramètre (docs/adr/0002).',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Domaine pur : recevoir le tirage aléatoire en paramètre (docs/adr/0002).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Domaine pur : recevoir l’heure en paramètre (docs/adr/0002).',
        },
      ],
    },
  },
  {
    // JS distant servi aux navigateurs (CSP, sans bundler) : scripts classiques, globales navigateur (#1600)
    files: ['src/remote/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly', io: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-alert': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'prefer-const': 'warn',
      'no-var': 'off',
      'no-useless-assignment': 'off',
    },
  },
  prettierConfig,
];
