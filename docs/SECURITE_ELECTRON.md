# Durcissement Electron (#1148)

- **Sandbox** : la fenêtre principale est en `sandbox: true` (+ `contextIsolation`, sans `nodeIntegration`). Le preload (bundle webpack) ne requiert que `electron`.
- **Navigation** : `will-navigate` / `will-redirect` bloquent toute URL hors de l'app (`file://…/dist/renderer`, ou `http://localhost:8066` en dev) ; `will-attach-webview` interdit. `window.open` est refusé et redirigé vers le navigateur système pour les URLs `https://` et `http://` du réseau local (écrans/arbitres). Logique testée dans `src/main/windowSecurity.ts`.
- **Permissions** : `setPermissionRequestHandler` et `setPermissionCheckHandler` n'accordent que la vidéo (`media`/`camera`) à l'application ; micro et autres permissions refusés.
- **CSP** : la meta de `index.html` est alignée sur l'en-tête de session (`script-src 'self'`). `style-src 'self'` sans `'unsafe-inline'` (#1157) : CSS extraites en fichiers (`mini-css-extract-plugin`), styles React posés par CSSOM, aperçu PDF (iframe) réappliqué par CSSOM (`renderer/utils/writeHtmlWithCssom.ts`). L'en-tête de session est strict (`style-src 'self'`) pour la fenêtre principale ; seules les autres fenêtres (impression / PDF, HTML avec `<style>`, JS désactivé) reçoivent `'unsafe-inline'` (`buildSessionCsp`, #1343). `connect-src http://localhost:*` est conservé : le port du serveur distant est dynamique.
- **Fuses** (`build.electronFuses`) : `runAsNode`, `enableNodeOptionsEnvironmentVariable`, `enableNodeCliInspectArguments` désactivés ; `onlyLoadAppFromAsar` activé.
- **`disable-gpu-sandbox`** : uniquement avec `BELLEPOULE_SW_RENDER=1` (Linux/VM sans GPU), jamais par défaut.

## Sandbox Chromium sous Linux (Ubuntu 24.04+, #1715)

**Symptôme** : sur Ubuntu 24.04 et plus récent, `npm start` s'arrête dès le lancement d'Electron :

```
FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:172] The SUID sandbox helper binary was found, but is not configured correctly...
```

**Cause** : Ubuntu 24.04 active `kernel.apparmor_restrict_unprivileged_userns = 1` (vérification : `sysctl kernel.apparmor_restrict_unprivileged_userns`). Un processus non confiné ne peut plus créer de user namespaces. Chromium se rabat alors sur le sandbox SUID `chrome-sandbox`, qui doit appartenir à root avec le mode `4755`. Après `npm install`, ce n'est pas le cas. Le code n'est pas en cause : `sandbox: true` de la fenêtre principale est volontaire et doit rester.

**Contournements pour le développement** (du plus recommandé au plus risqué) :

1. **Profil AppArmor dédié au binaire Electron** (durable). Il n'accorde `userns` qu'au chemin exact du binaire. Adapter le chemin absolu du dépôt :

   ```bash
   sudo tee /etc/apparmor.d/bellepoule-electron-dev >/dev/null <<'EOF'
   abi <abi/4.0>,
   include <tunables/global>
   profile bellepoule-electron-dev /CHEMIN/ABSOLU/bellepoule-modern/node_modules/electron/dist/electron flags=(unconfined) {
     userns,
   }
   EOF
   sudo apparmor_parser -r /etc/apparmor.d/bellepoule-electron-dev
   ```

   À refaire si le dépôt est déplacé. Risque : `userns` lève pour ce binaire la restriction qu'Ubuntu veut justement imposer. Ne l'accorder qu'au binaire de développement, jamais à un chemin large (`/usr/bin/*`, `$HOME`).

2. **Binaire SUID `chrome-sandbox`** (à refaire après chaque `npm install` ou `npm ci`) :

   ```bash
   sudo chown root:root node_modules/electron/dist/chrome-sandbox
   sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
   ```

   Risque : un binaire setuid root est une surface d'attaque locale. Ne pas faire sur un poste partagé. Ce mode est un repli moins fort que les user namespaces.

3. **`--no-sandbox`** (dépannage ponctuel uniquement) : `npx electron . --no-sandbox` après `npm run build`. Désactive le sandbox du renderer : ne jamais l'utiliser pour une session de compétition sur un poste qui affiche ou traite du contenu non maîtrisé.

**Ce qui ne règle pas le problème** : `BELLEPOULE_SW_RENDER=1` ajoute `disable-gpu-sandbox` (sandbox GPU seulement) ; il ne lève pas ce plantage.

**Paquets utilisateur** : aucun profil AppArmor n'est livré avec les paquets à ce jour. Sur Ubuntu 24.04+, le sandbox Chromium n'est donc pas garanti. Le constat de #1715 indique que l'AppImage démarre alors sans sandbox du renderer (`--no-sandbox` ajouté au lancement) ; ce comportement n'a pas été re-vérifié sur un build de ce dépôt.

- Hors périmètre : fenêtres d'impression cachées (JS désactivé, HTML local) ; test E2E Playwright de démarrage à ajouter.
- **Mise à jour en attente** (#1342) : installeur + `pending-update.json` stockés dans `<userData>/pending-update/` (dossier `0700`, fichiers `0600`, nom aléatoire), plus jamais dans `os.tmpdir()`. Relecture via `src/main/pendingUpdate.ts` (helper unique) : rejet si le chemin sort du dossier privé, si le propriétaire (uid) n’est pas l’utilisateur courant ou si les droits sont trop larges ; le SHA-256 reste revérifié avant lancement. Testé dans `pendingUpdate.test.ts`.
