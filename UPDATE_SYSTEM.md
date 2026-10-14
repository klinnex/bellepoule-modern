# Mises à jour automatiques

Code : `src/main/autoUpdater.ts`, `src/main/updateIntegrity.ts`,
`src/renderer/components/UpdateNotification.tsx`. Versionnage et canaux :
[docs/VERSIONING.md](docs/VERSIONING.md).

## Utilisateur

- Vérification **5 s après le démarrage**, puis **toutes les 12 h**.
- Vérification manuelle : menu **🔄 Vérifier les mises à jour...**
  - « 📥 Télécharger maintenant » → ouvre le fichier de la plateforme
    (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`/`.deb`/`.rpm`) dans le navigateur ;
  - « 🔗 Voir les releases » → page GitHub Releases ;
  - « ✖️ Plus tard ».
- Une notification apparaît dans l'application quand une version plus récente existe.
- Mise à jour déjà téléchargée et vérifiée : au lancement suivant, boîte
  « Mise à jour en attente » → **Installer maintenant** / **Plus tard**.

## Fonctionnement

| Élément | Comportement |
|---|---|
| Source | API GitHub Releases de `klinnex/bellepoule-modern` |
| Comparaison | numéro de **build** (`version.json`), pas la version SemVer |
| Canal | figé au packaging : build `dev` → suit aussi les pré-releases `vX.Y.Z-dev.N` ; build `stable` → releases stables uniquement |
| Téléchargement | manuel (`autoDownload: false` dans `main.ts`) |
| Intégrité | URL GitHub HTTPS obligatoire + empreinte **SHA-256** publiée par GitHub, revérifiée juste avant de lancer l'installeur |
| En attente | `<tmp>/bellepoule-pending-update.json` |

Configuration (`AutoUpdaterConfig`, passée dans `main.ts`) : `autoDownload`,
`autoInstall`, `checkInterval` (heures), `betaChannel`, `silent`, `installOnQuit`.

## API renderer (`window.electronAPI.updater`)

`check()`, `setSilentMode(enabled)`, `getSilentMode()`, `hasPendingUpdate()`,
`getPendingUpdateInfo()`, `installPendingUpdate()`.

## Dépannage

- **Pas de notification** : vérifier l'accès à `api.github.com` (pare-feu, proxy) ;
  lancer la vérification manuelle depuis le menu.
- **Téléchargement refusé** : asset sans empreinte SHA-256 ou URL non GitHub → passer
  par « Voir les releases » et télécharger manuellement.
- **Rester sur une version** : répondre « Plus tard » ; aucune installation n'est
  faite sans confirmation.
