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
