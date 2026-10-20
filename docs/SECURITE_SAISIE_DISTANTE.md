# Sécurité de la saisie distante

Le serveur de saisie distante (tablettes arbitres, écrans d'arène, appel) écoute sur le réseau local, port 8066 par défaut.

## HTTPS (activé par défaut)

- Case **🔒 Activer HTTPS** dans l'écran de démarrage du serveur, cochée par défaut.
- Certificat auto-signé généré au premier démarrage HTTPS, conservé dans `<userData>/certs/` (`server.pem`, `server.key`), valable 10 ans.
- En HTTP, l'application affiche un avertissement : mots de passe et cookies de session circulent en clair sur le Wi-Fi.

### Première connexion d'une tablette

1. Ouvrir l'URL `https://<ip>:<port>/…` (ou scanner le QR code).
2. Le navigateur signale un certificat non reconnu : c'est attendu.
3. Vérifier l'empreinte : détails du certificat dans le navigateur → empreinte **SHA-256** ; elle doit être identique à celle affichée sur le PC sous l'URL du serveur (`🔒 Empreinte cert. SHA-256`).
4. Si l'empreinte correspond, accepter l'exception. Sinon, ne pas continuer : un autre appareil intercepte la connexion.

L'empreinte ne change pas tant que le certificat n'est pas supprimé.

## Interface réseau

Le sélecteur d'interface (section **Réseau**) limite l'écoute à une carte réseau (Wi-Fi du gymnase par exemple) au lieu de `0.0.0.0` (toutes les interfaces).

## Mots de passe

- Mot de passe par arène (optionnel) et mot de passe d'appel (obligatoire pour ouvrir l'appel) : **8 caractères minimum**.
- Stockés en mémoire uniquement, hachés avec scrypt salé.
- Sessions valables 8 h, invalidées à chaque changement de mot de passe.

## Protections automatiques

| Menace                                       | Protection                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Force brute                                  | 5 essais/min par IP, 20/min par arène ou appel ; blocage progressif après 5 échecs (30 s, doublé, max 15 min) ; alerte dans le diagnostic |
| Action sans mot de passe                     | Toutes les actions de score (HTTP et Socket.IO) vérifient la session de l'arène                                                           |
| Page web tierce (CSRF, WebSocket cross-site) | Origine étrangère refusée                                                                                                                 |
| Saturation                                   | 30 connexions Socket.IO max par IP ; 20 événements/s par connexion (rafale 40) ; corps JSON 4 Ko sur les routes de connexion              |

L'IP client est celle de la connexion TCP. `X-Forwarded-For` est ignoré, sauf derrière un reverse proxy de confiance (`setTrustProxy(true)`).

## IPC fichiers (processus principal, #1146)

- Le renderer ne peut lire/écrire que des chemins renvoyés par une boîte de dialogue native (`dialog:openFile`, `dialog:saveFile`) ou par le menu Importer (`.bpf`). `src/main/pathAuthorization.ts` les mémorise (10 min, 200 max, sens lecture/écriture).
- `file:writeContent`, `file:export/import`, `file:exportPhotos/importPhotos`, `file:exportFencersArchive/importFencersArchive`, `file:printHtmlToPDF` refusent tout autre chemin, les liens symboliques, les extensions exécutables en écriture (`.exe`, `.sh`, `.js`…) et exigent `.zip` / `.bpf` / `.pdf` selon l'usage.
- Imports ZIP bornés (surchargeables : `BP_ZIP_MAX_FILE_BYTES` 50 Mo, `BP_ZIP_MAX_ENTRIES` 5000, `BP_ZIP_MAX_UNCOMPRESSED_BYTES` 200 Mo, `BP_ZIP_MAX_ENTRY_BYTES` 20 Mo, `BP_IMPORT_MAX_FENCERS` 20000) ; entrées `..`, absolues ou avec `\` ignorées ; `fencers.json` validé (tableau, champs texte bornés) avant `upsertFencersByLicense`.

## CSP des pages distantes (#1149)

- Chaque page HTML est servie par `sendHtmlPage` (`src/main/remote/csp.ts`) : nonce aléatoire (16 octets) ajouté à tous les `<script>`/`<style>`, en-tête `script-src 'nonce-…' 'self'` **sans `'unsafe-inline'`**, `object-src 'none'`, `base-uri 'self'`, `connect-src 'self' ws: wss:`. Les `.html` ne sont plus servis en statique brut.
- Plus de handlers inline (`onclick=`…) ni de `javascript:` : délégation `data-click` / `data-change` / `data-input` + `data-args` (JSON, `"$el"`, `"$value"`) dans `common.js`. Les cibles sont des fonctions globales de la page (`window.refereeApp` pour l'arbitre). Nouvelle page avec action : charger `/common.js` et utiliser ces attributs ; les arguments dynamiques passent par `escHtml(JSON.stringify([...]))`.
- `style-src` garde `'unsafe-inline'` (attributs `style=` trop nombreux, voir #1157).
- `BP_CSP_REPORT_ONLY=1` : politique stricte en mode rapport seul (diagnostic d'une casse sur le terrain). Pas d'endpoint `/csp-report` : le navigateur journalise les violations en console.
- Test `csp.test.ts` : nonce sur chaque script, aucun handler inline dans `src/remote` ni dans les pages générées, chaque `data-click` statique cible une fonction définie.

## Performance des pages distantes (#1151)

- Au démarrage, `remote/pageStore.ts` extrait chaque `<script>` inline (client socket.io compris) vers un asset `/_a/<hash>.js` (`Cache-Control: public, max-age=31536000, immutable`, dédupliqué entre pages) ; plus aucun script inline ⇒ CSP fixe `script-src 'self'` (sans nonce). Une page qui garde un bloc inline non extractible (ex. JSON) retombe sur le nonce par réponse (#1149).
- Pages et `common.js`/`i18n.js`/`app.js`/`styles.css` sont pré-compressés (brotli q9 + gzip), servis selon `Accept-Encoding` (q-values), avec `ETag` + `Cache-Control: no-cache` (304 au rechargement) et `Vary: Accept-Encoding`.
- Les réponses `res.json()` > 1 Ko sont compressées en gzip (`jsonCompression`).
- Mesure (Chromium, `referee.html` complet, socket.io inclus) : ~60 Ko au premier chargement contre ~220 Ko avant (chiffre de l'issue) ; test `pageStore.test.ts` : page + assets brotli < 60 Ko.
- Service worker : cache `bellepoule-referee-v6` ; les assets `/_a/*` sont mis en cache à la volée (réseau d'abord, repli cache hors-ligne).

## Kiosque sans polling (#1152)

- `kiosk.html` n'interroge plus le serveur périodiquement (avant : session/pools 15 s, tableau 15 s, logo 30 s, ETA 30 s). Chargement initial, puis rechargement sur événements Socket.IO : `kiosk:data` (toute écriture en base via `DatabaseManager.onChange`, mise à jour d'une piste, début/fin de session ; regroupé sur 300 ms par `notifyKioskData`), `bracket:update`, `logo:update`.
- Resynchronisation complète à la **reconnexion** Socket.IO, au retour de **visibilité** de la page et à l'événement `online` ; en cas d'échec de chargement : backoff exponentiel (1 s → 30 s) avec jitter.
- Les timers d'animation (barres de progression, pan du tableau) ne travaillent pas quand la page est masquée. Remplacement par `requestAnimationFrame`/CSS non fait.
- Mesure (Chromium + serveur Socket.IO réel, kiosque inactif) : 0 requête HTTP en 15–40 s ; 7 requêtes de rechargement par événement `kiosk:data` ; 7 après coupure/reprise du réseau.
- Tests : `kioskNoPolling.test.ts`, `remoteScoreServer.test.ts` (`kiosk:data`).
