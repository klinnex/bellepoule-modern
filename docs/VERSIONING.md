# Règles de versionnage

Ce document fixe la façon dont BellePoule Modern est numéroté, construit et publié.
Outil associé : `scripts/version.js` (scripts npm `version:show` / `version:bump`).

## 1. Deux nombres, deux rôles

| Élément | Exemple | Qui le change | Signification |
|---|---|---|---|
| **Version** SemVer `MAJEUR.MINEUR.CORRECTIF` | `1.2.0` | un humain, via `npm run version:bump` | ce que la version *promet* à l'utilisateur |
| **Build** (compteur) | `1402` | la CI `dev`, automatiquement | quel binaire exact ; sert à la détection des mises à jour |

Source de vérité : `version.json`.

```json
{ "version": "1.2.0", "build": 1402, "channel": "dev", "date": "2026-10-12T09:11:49Z" }
```

- `package.json` / `package-lock.json` portent la même version `X.Y.Z` (sans build).
  La CI y écrit la version complète au moment du packaging, sans la committer.
- Le **build** est un compteur unique et strictement croissant, partagé par `dev` et `main`.
  Il n'est incrémenté **que** par le workflow `build-dev.yml` (commit `🔖 Dev Build #N`).
  Un build local (`npm run build`) ne touche plus à la numérotation.
- `channel` vaut `dev` dans le dépôt ; la CI `main` le remplace par `stable` dans le paquet.

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
claude/… , feature/…  ──PR──▶  dev  ──PR (promotion)──▶  main
                                │                          │
                       pré-release v1.2.0-dev.1402   release v1.2.0 (Build #1402)
```

| Branche | Canal | Tag | Titre de release | Fichiers |
|---|---|---|---|---|
| `dev` | pré-release (`prerelease: true`) | `vX.Y.Z-dev.N` | `🧪 BellePoule Modern X.Y.Z-dev.N (Build #N)` | `BellePoule-Modern-X.Y.Z-dev.N-<os>-<arch>.<ext>` |
| `main` | stable (`latest`) | `vX.Y.Z` | `🚀 BellePoule Modern X.Y.Z (Build #N)` | `BellePoule-Modern-X.Y.Z-<os>-<arch>.<ext>` |

`<os>` = `win` / `mac` / `linux` ; Windows ajoute `-portable` ou `-setup`.

- **`dev`** : chaque push construit un nouveau build `N+1`. `X.Y.Z` = **la prochaine version
  stable visée** ; `1.2.0-dev.1402` se lit « build 1402, en route vers 1.2.0 ».
  Les 5 pré-releases dev les plus récentes sont conservées.
- **`main`** : ne crée **pas** de nouveau build. La release stable reprend le numéro du dernier
  build dev promu : `v1.2.0 (Build #1402)` = même code que `v1.2.0-dev.1402`.
  Aucun commit n'est poussé sur `main` par la CI.
  Toutes les releases stables `vX.Y.Z` sont conservées.
- La CI `main` **échoue** si le tag `vX.Y.Z` existe déjà : impossible de publier deux fois la
  même version. → bumper la version sur `dev` avant de promouvoir.

## 4. Cycle de release

1. Développer sur `dev` (PR depuis `claude/…` ou `feature/…`).
2. Dès qu'un changement relève d'un niveau supérieur à la version visée, ajuster sur `dev` :
   ```bash
   npm run version:bump -- minor     # ou patch | major | 1.4.0
   ```
   Committer `version.json`, `package.json`, `package-lock.json` (PR vers `dev`).
   *Au plus tard* juste avant la promotion. Juste après une release stable `1.2.0`, le
   prochain bump (`patch` minimum) se fait dans le premier PR qui suit.
3. Tester la pré-release `vX.Y.Z-dev.N`.
4. Promouvoir : PR `dev` → `main` (merge par le mainteneur uniquement).
5. La CI `main` publie `vX.Y.Z` en *Latest*.

### Correctif urgent sur une version stable

Le correctif passe par `dev` comme le reste : PR vers `dev` avec `npm run version:bump -- patch`,
puis promotion `dev` → `main`. Jamais de commit direct sur `main` (le build stable doit
toujours correspondre à un build dev).

### Version majeure longue

Si `dev` doit rester livrable pendant la préparation d'une majeure, les travaux cassants
vivent sur une branche longue `next` (sans build CI) et rejoignent `dev` d'un bloc,
accompagnés de `npm run version:bump -- major`.

## 5. Mises à jour automatiques

`src/main/autoUpdater.ts` compare uniquement le **build** (`Build #N` dans le titre de release).
- Paquet `stable` → ne voit que les releases stables.
- Paquet `dev` (ou exécution locale) → voit aussi les pré-releases dev.

Le canal vient de `version.json` (`channel`), figé au packaging.
Comme `main` reprend le build de `dev`, un testeur en `1.2.0-dev.1410` ne se voit pas proposer
`1.2.0 (Build #1402)`, plus ancien.

## 6. Référence `scripts/version.js`

| Commande | Effet |
|---|---|
| `npm run version:show` | affiche `version.json` |
| `npm run version:bump -- <major\|minor\|patch\|X.Y.Z>` | change la version (refuse un retour en arrière) |
| `node scripts/version.js next-build` | CI dev : build + 1 |
| `node scripts/version.js apply <dev\|stable> [--build N]` | CI : écrit canal + version complète avant packaging (non commité) |
| `node scripts/version.js meta <dev\|stable> [--github-output]` | CI : expose `version`, `build`, `full_version`, `tag`, `title` |

## 7. Historique

Jusqu'au build #1371, les tags étaient `vX.Y.Z-build.N` (stable, nouveau build à chaque push
`main`) et `dev-build-N` (dev, numéro de run GitHub). La version `1.0.3` n'a jamais été bumpée.
Les anciennes releases `-build.N` sont retirées à la première release stable du nouveau format
(les tags sont conservés) ; les `dev-build-N` disparaissent avec la rotation des 5 pré-releases.
