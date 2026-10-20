# Durcissement Electron (#1148)

- **Sandbox** : la fenêtre principale est en `sandbox: true` (+ `contextIsolation`, sans `nodeIntegration`). Le preload (bundle webpack) ne requiert que `electron`.
- **Navigation** : `will-navigate` / `will-redirect` bloquent toute URL hors de l'app (`file://…/dist/renderer`, ou `http://localhost:8066` en dev) ; `will-attach-webview` interdit. `window.open` est refusé et redirigé vers le navigateur système pour les URLs `https://` et `http://` du réseau local (écrans/arbitres). Logique testée dans `src/main/windowSecurity.ts`.
- **Permissions** : `setPermissionRequestHandler` et `setPermissionCheckHandler` n'accordent que la vidéo (`media`/`camera`) à l'application ; micro et autres permissions refusés.
- **CSP** : la meta de `index.html` est alignée sur l'en-tête de session (`script-src 'self'`). `style-src 'unsafe-inline'` reste nécessaire (styles inline React, voir #1157). `connect-src http://localhost:*` est conservé : le port du serveur distant est dynamique.
- **Fuses** (`build.electronFuses`) : `runAsNode`, `enableNodeOptionsEnvironmentVariable`, `enableNodeCliInspectArguments` désactivés ; `onlyLoadAppFromAsar` activé.
- **`disable-gpu-sandbox`** : uniquement avec `BELLEPOULE_SW_RENDER=1` (Linux/VM sans GPU), jamais par défaut.
- Hors périmètre : fenêtres d'impression cachées (JS désactivé, HTML local) ; test E2E Playwright de démarrage à ajouter.
