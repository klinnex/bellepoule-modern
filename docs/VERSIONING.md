# Règles de versionnage

Ce document fixe la façon dont BellePoule Modern est numéroté, construit et publié.
Outil associé : `scripts/version.js` (scripts npm `version:show` / `version:bump`).

## 1. Deux nombres, deux rôles

| Élément | Exemple | Qui le change | Signification |
|---|---|---|---|
| **Version** SemVer `MAJEUR.MINEUR.CORRECTIF` | `1.2.0` | un humain, via `npm run version:bump` | ce que la version *promet* à l'utilisateur |
| **Build** (compteur) | `1402` | la CI `dev` ou `hotfix/*`, automatiquement | quel binaire exact ; départage deux binaires de même version |

Source de vérité : `version.json`.

```json
{ "version": "1.2.0", "build": 1402, "channel": "dev", "date": "2026-10-12T09:11:49Z" }
```

- `package.json` / `package-lock.json` portent la même version `X.Y.Z` (sans build).
  La CI y écrit la version complète au moment du packaging, sans la committer.
- Le **build** est un compteur unique et strictement croissant, partagé par `dev`, `main` et
  les branches de maintenance `hotfix/*`. Il n'est incrémenté **que** par le workflow
  `build-dev.yml` (commit `🔖 Dev Build #N` ou `🔖 RC Build #N`). Chaque branche a son
  `version.json` : le nouveau build dépasse toujours le plus haut build publié, toutes
  branches confondues (`next-build --min`).
  Un build local (`npm run build`) ne touche plus à la numérotation.
- `channel` vaut `dev` dans le dépôt ; la CI le remplace par `rc` (branche `hotfix/*`) ou
  `stable` (`main`) dans le paquet.

## 2. Quand changer MAJEUR / MINEUR / CORRECTIF

Le « contrat » de BellePoule Modern = fichiers de compétition, base SQLite, interfaces
distantes (tablettes, écrans), formats d'import/export, flux d'arbitrage.

| Incrément | Quand | Exemples |
|---|---|---|
| **MAJEUR** `2.0.0` | Rupture de compatibilité ou refonte qui oblige l'utilisateur à changer ses habitudes | migration de base **sans retour possible** vers l'ancienne version ; format de fichier/export incompatible ; protocole tablette ↔ serveur modifié (anciennes pages `/arene{N}` inutilisables) ; suppression d'une fonctionnalité ; refonte majeure de l'UI ; changement de règlement (FIE/FFE) qui change les résultats |
| **MINEUR** `1.3.0` | Nouvelle fonctionnalité compatible | nouvel écran, nouvelle arme/formule, nouvel export, nouvelle langue, migration de base additive (nouvelle table/colonne) |
| **CORRECTIF** `1.2.1` | Uniquement des corrections | bug, traduction, performance, sécurité, dépendance mise à jour sans effet visible |

Règles :
- Le niveau se décide sur **l'ensemble** des changements depuis la dernière release stable :
  le plus haut l'emporte (une seule fonctionnalité → MINEUR, même avec 30 correctifs).
- En `0.x`, tout peut casser : non applicable, le projet est en `1.x`.
- Une migration de schéma (`src/database/migrations`) est au minimum MINEUR.

## 3. Branches et canaux

```
claude/… , feature/…  ──PR──▶  dev  ──PR (promotion)──▶  main  ◀──PR──  hotfix/2.0.1
                                │                          │                │
                    pré-release v3.0.0-dev.1990   release v2.0.1 (#1995)   pré-release v2.0.1-rc.1995
```

| Branche | Canal | Tag | Titre de release | Fichiers |
|---|---|---|---|---|
| `dev` | pré-release (`prerelease: true`) | `vX.Y.Z-dev.N` | `🧪 BellePoule Modern X.Y.Z-dev.N (Build #N)` | `BellePoule-Modern-X.Y.Z-dev.N-<os>-<arch>.<ext>` |
| `hotfix/*` | pré-release (`prerelease: true`) | `vX.Y.Z-rc.N` | `🩹 BellePoule Modern X.Y.Z-rc.N (Build #N)` | `BellePoule-Modern-X.Y.Z-rc.N-<os>-<arch>.<ext>` |
| `main` | stable (`latest`) | `vX.Y.Z` | `🚀 BellePoule Modern X.Y.Z (Build #N)` | `BellePoule-Modern-X.Y.Z-<os>-<arch>.<ext>` |

`<os>` = `win` / `mac` / `linux` ; Windows ajoute `-portable` ou `-setup`.

- **`dev`** : chaque push construit un nouveau build `N+1`. `X.Y.Z` = **la prochaine version
  stable visée** ; `1.2.0-dev.1402` se lit « build 1402, en route vers 1.2.0 ».
  Les 5 pré-releases dev les plus récentes sont conservées.
- **`hotfix/*`** : branche de maintenance de la version stable (voir 4.). Chaque push construit
  les paquets et publie `X.Y.Z-rc.N`. Les pré-releases rc sont toutes conservées.
- **`main`** : ne crée **pas** de nouveau build. La release stable reprend le numéro du dernier
  build dev (ou rc) promu : `v1.2.0 (Build #1402)` = même code que `v1.2.0-dev.1402`.
  Aucun commit n'est poussé sur `main` par la CI.
  Toutes les releases stables `vX.Y.Z` sont conservées.
- La CI `main` **échoue** si le tag `vX.Y.Z` existe déjà : impossible de publier deux fois la
  même version. Après chaque release, `dev` est bumpé automatiquement en `X.Y.(Z+1)`.

## 4. Cycle de release

1. Développer sur `dev` (PR depuis `claude/…` ou `feature/…`).
2. `dev` vise par défaut le prochain correctif (bump `patch` automatique, voir 5.).
   Dès qu'un changement relève d'un niveau supérieur (fonctionnalité → MINEUR, rupture →
   MAJEUR), ajuster sur `dev` :
   ```bash
   npm run version:bump -- minor     # ou major | 1.4.0
   ```
   Committer `version.json`, `package.json`, `package-lock.json` (PR vers `dev`).
   *Au plus tard* juste avant la promotion.
3. Tester la pré-release `vX.Y.Z-dev.N`.
4. Promouvoir : PR `dev` → `main` (merge par le mainteneur uniquement).
5. La CI `main` publie `vX.Y.Z` en *Latest*, puis pousse sur `dev`
   `🔖 Version X.Y.(Z+1) (après release vX.Y.Z)` — sauf si `dev` a déjà été bumpé plus haut.
   Le build **n'est pas** remis à zéro : `1.1.0 (Build #1402)` → `1.1.1-dev.1403`.

### Pourquoi le build n'est jamais remis à zéro

- Les versions installées jusqu'à la 2.0.x comparent le build seul. Un retour à `#1` les
  bloquerait pour toujours.
- La release stable reprend le build dev : deux builds de même numéro doivent être le même code.
- Le build identifie un binaire de façon unique, quelle que soit la version.

### Branche de maintenance (correctif sur la version stable)

`dev` porte les grosses fonctions de la prochaine majeure (ex. `3.0.0`) et n'est pas
promouvable en l'état. Un correctif de la stable (ex. `2.0.0` → `2.0.1`) passe par une
branche `hotfix/*` tirée de `main` :

```bash
git switch -c hotfix/2.0.1 v2.0.0        # ou origin/main
npm run version:bump -- patch            # 2.0.0 → 2.0.1 (commit + push de la branche)
```

1. Les correctifs arrivent par PR vers `hotfix/2.0.1` (contrôles `pr-quality`).
2. Chaque push publie la pré-release `v2.0.1-rc.N` (paquets de toutes les plateformes) :
   c'est elle qu'on recette.
3. Recette validée : PR `hotfix/2.0.1` → `main` (merge par le mainteneur). La CI `main` publie
   `v2.0.1` en reprenant le build du dernier rc. Le bump automatique de `dev` ne fait rien :
   `dev` vise déjà une autre version.
4. Merge retour `main` → `dev` (PR). Conflit sur `version.json`, `package.json`,
   `package-lock.json` : garder la version de `dev` (`3.0.0`) et le plus grand des deux builds.
5. Supprimer la branche `hotfix/2.0.1`. Le correctif suivant repart de `main` (`hotfix/2.0.2`).

Un correctif déjà fait sur `dev` se reporte par `git cherry-pick -x` sur la branche hotfix.
Jamais de commit direct sur `main`.

Paquet rc installé : canal de mise à jour **stable** par défaut. Le testeur reçoit la
`2.0.1` publiée, jamais les `3.0.0-dev`.

## 5. Mises à jour automatiques

`src/main/autoUpdater.ts` compare la **version** `X.Y.Z` (tag), puis le **build** (`Build #N` dans
le titre) à version égale (`src/main/updateReleases.ts`). Un correctif `2.0.1` au build plus
élevé qu'une `3.0.0-dev` n'est donc jamais proposé à un testeur dev. Les binaires 2.0.x et
antérieurs comparent encore le build seul.
- Paquet `stable` ou `rc` → ne voit que les releases stables.
- Paquet `dev` (ou exécution locale) → voit aussi les pré-releases (dev et rc).

Le canal vient de `version.json` (`channel`), figé au packaging, sauf choix utilisateur
dans Préférences → Mises à jour → Canal (`channel` dans `updater-settings.json`).
Passer de dev à stable ne rétrograde pas : seule une version plus récente est proposée.
Comme `main` reprend le build de `dev`, un testeur en `1.2.0-dev.1410` ne se voit pas proposer
`1.2.0 (Build #1402)`, plus ancien.

Vérification au démarrage (+5 s) puis toutes les 12 h, désactivable dans
Préférences → Mises à jour (`<userData>/updater-settings.json`, clé `autoCheck`).
Le menu Aide → Vérifier les mises à jour reste toujours actif.
Nouveau build détecté → bannière dans l'app + téléchargement en arrière-plan (`autoDownload`),
installation proposée à la fin. Version déjà téléchargée → pas de nouveau téléchargement.

Installation intégrée (bannière « Installer » ou menu) : aucun passage par le navigateur.
Asset choisi par `src/main/updateAssets.ts` (plateforme + arch + mode), téléchargé dans
`userData/pending-update`, vérifié par SHA-256 (digest GitHub), puis :

| Mode détecté | Action |
|---|---|
| AppImage (`APPIMAGE`) | remplacement du fichier en place + relance |
| Windows portable (`PORTABLE_EXECUTABLE_FILE`) | nouvel exe copié à côté sous le nom de l'asset (l'exe courant est verrouillé par son lanceur) + relance ; ancien exe supprimé au lancement suivant |
| Windows installé | `-setup.exe` NSIS ouvert via ShellExecute (UAC si Program Files) |
| macOS, `.app` dans un dossier inscriptible | `.zip` extrait (`ditto`), bundle `.app` remplacé en place + relance (`src/main/updateNativeInstall.ts`) |
| macOS, dossier en lecture seule (translocation) | ouverture du `.dmg` de la bonne arch |
| Linux deb (`/etc/debian_version`) / rpm | paquet du format système installé via `pkexec` (apt-get / dpkg, dnf / zypper / rpm) + relance ; échec ou annulation → gestionnaire de logiciels. Pas de paquet publié (rpm arm64) → AppImage |

Repli sur la page des versions GitHub uniquement si aucun asset ne correspond.

## 6. Référence `scripts/version.js`

| Commande | Effet |
|---|---|
| `npm run version:show` | affiche `version.json` |
| `npm run version:bump -- <major\|minor\|patch\|X.Y.Z>` | change la version (refuse un retour en arrière) |
| `node scripts/version.js next-build [--min N]` | CI dev / hotfix : build + 1, au-delà de `N` (plus haut build publié) |
| `node scripts/version.js apply <dev\|rc\|stable> [--build N]` | CI : écrit canal + version complète avant packaging (non commité) |
| `node scripts/version.js meta <dev\|rc\|stable> [--github-output]` | CI : expose `version`, `build`, `channel`, `full_version`, `tag`, `title` |

## 7. Historique

Jusqu'au build #1371, les tags étaient `vX.Y.Z-build.N` (stable, nouveau build à chaque push
`main`) et `dev-build-N` (dev, numéro de run GitHub). La version `1.0.3` n'a jamais été bumpée.
Les anciennes releases `-build.N` sont retirées à la première release stable du nouveau format
(les tags sont conservés) ; les `dev-build-N` disparaissent avec la rotation des 5 pré-releases.
