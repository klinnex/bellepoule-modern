# Stack technique et dépendances

> Relevé au **9 octobre 2026** — version **1.0.3**, build **#1365**
> (`package.json` / `version.json`). Versions = versions résolues dans `package-lock.json`.

---

## 1. Environnement

| Outil | Version | Remarque |
|---|---|---|
| Node.js | **22.x** | Utilisé par la CI (`actions/setup-node`, `node-version: '22'`). Requis par better-sqlite3 13. |
| npm | ≥ 10 | Lockfile v3. |
| Electron | **44.5.1** | Chromium + Node embarqués. |
| TypeScript | **6.0.3** | `strict: true`, cible ES2020, modules CommonJS, `jsx: react-jsx`. |
| OS supportés (build) | Windows x64, macOS x64/arm64, Linux x64 | electron-builder. |

`postinstall` : `electron-rebuild -f -w better-sqlite3` (recompile le module natif pour
l'ABI d'Electron).

---

## 2. Dépendances d'exécution (`dependencies`)

Seuls les modules **non bundlables** (natifs) ou chargés à l'exécution sont ici. Tout le
reste est intégré par Webpack.

| Paquet | Version | Rôle |
|---|---|---|
| better-sqlite3 | 13.0.3 | SQLite synchrone natif (`src/database/index.ts`). Externe Webpack, décompressé hors asar. |
| lucide-react | 1.52.0 | Icônes React. |
| selfsigned | 5.5.0 | Certificat TLS auto-signé du serveur HTTPS (`src/main/certManager.ts`). |

## 3. Dépendances de build / bundlées (`devDependencies`)

### Interface (renderer)

| Paquet | Version | Rôle |
|---|---|---|
| react / react-dom | 19.3.0 | UI. |
| zustand | 5.0.15 | Stores par fonctionnalité (`src/features/*/hooks/use*Store.ts`). |
| immer | 10.2.0 | Mises à jour immuables (middleware zustand). |
| jspdf | 4.2.1 | Génération PDF (`src/shared/utils/pdfExport/`). |
| jspdf-autotable | 5.0.8 | Tableaux PDF. |
| jszip | 3.10.2 | Archives tireurs/photos. |
| qrcode | 1.5.4 | QR codes (chargé à la demande). |
| tesseract.js | 5.1.1 | OCR des feuilles de poule (chargé à la demande, hors asar). |
| uuid | 11.1.1 | Identifiants. |

### Processus principal / serveur distant

| Paquet | Version | Rôle |
|---|---|---|
| express | 5.2.1 | Serveur HTTP(S) des tablettes (`remoteScoreServer.ts`). |
| socket.io | 4.8.4 | Temps réel. Client servi en mémoire sur `/bp-sio.js`. |

### Build et packaging

| Paquet | Version |
|---|---|
| webpack | 5.111.1 |
| webpack-cli | 6.0.1 |
| webpack-dev-server | 5.2.6 (port 8066) |
| ts-loader | 9.6.2 |
| html-webpack-plugin | 5.6.8 |
| copy-webpack-plugin | 14.0.0 |
| css-loader / style-loader | 7.1.5 / 4.0.0 |
| terser-webpack-plugin | 5.6.1 |
| webpack-bundle-analyzer | 4.10.2 |
| electron-builder | 26.17.0 |
| @electron/rebuild | 4.2.0 |
| concurrently | 9.2.4 |
| wait-on | 8.0.5 |

### Qualité et tests

| Paquet | Version |
|---|---|
| vitest | 4.1.11 |
| @vitest/coverage-v8 | 4.1.11 |
| jsdom | 25.0.1 |
| fake-indexeddb | 6.2.5 |
| @testing-library/react | 16.3.3 |
| @testing-library/jest-dom | 6.9.1 |
| @testing-library/user-event | 14.6.7 |
| @playwright/test | 1.63.0 |
| eslint | 9.39.5 (flat config `eslint.config.js`) |
| @eslint/js | 9.39.5 |
| @typescript-eslint/parser, eslint-plugin | 8.71.1 |
| eslint-plugin-react | 7.37.5 |
| eslint-plugin-react-hooks | 5.2.0 |
| eslint-plugin-prettier | 5.5.6 |
| eslint-config-prettier | 10.1.8 |
| prettier | 3.9.9 |
| globals | 16.5.0 |

### Types

`@types/node` 22.20.5, `@types/react` / `@types/react-dom` 19.3.0, `@types/express`
5.0.6, `@types/better-sqlite3` 7.6.13, `@types/qrcode` 1.5.6, `@types/uuid` 10.0.0.

---

## 4. Bundling

| Cible | Config | Entrée | Sortie |
|---|---|---|---|
| `electron-main` | `webpack.main.config.js` | `src/main/main.ts` | `dist/main/main.js` |
| `electron-preload` | idem | `src/main/preload.ts`, `splash-preload.ts` | `dist/main/` |
| renderer | `webpack.renderer.config.js` | `src/renderer/index.tsx` | `dist/renderer/` |
| pages distantes | CopyPlugin (renderer) | `src/remote/*` + client Socket.IO | `dist/remote/` (hors asar) |

Externes du main : `electron`, `better-sqlite3`, `bufferutil`, `utf-8-validate`.
Budget de taille vérifié par `npm run check:bundle-size`.

## 5. Packaging (electron-builder)

| OS | Cibles | Nom |
|---|---|---|
| Windows | NSIS (installeur), portable | `BellePoule Modern-<ver>-setup.exe`, `-portable.exe` |
| macOS | DMG + ZIP, x64 et arm64 | `BellePoule Modern-<ver>-<arch>.dmg` |
| Linux | AppImage, deb, rpm | `BellePoule Modern-<ver>-<arch>.AppImage` |

`asarUnpack` : `dist/remote/**`, `better-sqlite3`, `tesseract.js`.
`extraResources` : `resources/`, `version.json`.

## 6. CI/CD (GitHub Actions)

| Workflow | Déclencheur | Étapes |
|---|---|---|
| `build-dev.yml` | push `dev` | type-check, i18n, tests unitaires, budget bundle → incrément build → builds Windows/macOS/Linux → pré-release dev |
| `build.yml` | push `main` | idem → release stable |
| `claude-code-review.yml` | PR | Revue automatique |
| `claude.yml` | mention @claude | Agent |
| `track-downloads.yml` | cron 6 h UTC | Statistiques de téléchargement (`stats/`) |

Numérotation : `scripts/increment-build.js` met à jour `version.json`
(`{ version, build, date }`) ; commit `🔖 Dev Build #N` / `🔖 Build #N`.

## 7. Technologies côté tablette

Pages HTML autonomes (`src/remote/*.html`), JavaScript vanilla, aucune dépendance npm :

- Socket.IO client (`/bp-sio.js`), reconnexion automatique.
- Service Worker (`src/remote/sw.js`) + IndexedDB (file hors-ligne).
- Web Speech API (minuteur vocal), Vibration API, Battery Status API.
- Canvas (signatures).
- i18n client `src/remote/i18n.js`.

Navigateurs : Chrome/Edge, Safari iOS/iPadOS, Firefox récents.

## 8. Mettre à jour les dépendances

```bash
npm outdated                 # état
npm update                   # mineures/patchs selon les plages ^
npm install <pkg>@latest     # majeure (vérifier les breaking changes)
npm run type-check && npm run lint && npm run test:run && npm run build:ci
```

Après une mise à jour d'Electron : `npx electron-rebuild -f -w better-sqlite3`.
