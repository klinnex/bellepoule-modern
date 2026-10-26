# macOS : choisir la bonne version (Apple Silicon ou Intel)

BellePoule Modern est publié en **deux versions macOS**. Il faut prendre celle qui correspond au processeur du Mac.

| Votre Mac | Fichier à télécharger |
|---|---|
| Puce **Apple** (M1, M2, M3, M4, M5… ; MacBook Neo) | `BellePoule-Modern-<version>-mac-arm64.dmg` |
| Processeur **Intel** | `BellePoule-Modern-<version>-mac-x64.dmg` |

`<version>` = `X.Y.Z` (stable) ou `X.Y.Z-dev.N` (pré-release de test). Téléchargement : [dernière version stable](https://github.com/klinnex/bellepoule-modern/releases/latest).

Version minimale : **macOS 12 (Monterey)**.

## 1. Identifier le processeur de son Mac

### Méthode simple

1. Menu  (en haut à gauche) → **À propos de ce Mac**
2. Regarder la ligne :
   - **Puce** : `Apple M1` / `M2` / `M3`… → **Apple Silicon** → fichier **`arm64`**
   - **Processeur** : `Intel Core i5` / `i7` / `i9`… → **Intel** → fichier **`x64`**

### Méthode Terminal

Ouvrir **Terminal** (Applications → Utilitaires) et taper :

```bash
uname -m
```

| Résultat | Version à prendre |
|---|---|
| `arm64` | `mac-arm64.dmg` |
| `x86_64` | `mac-x64.dmg` |

> ⚠️ Si le Terminal lui-même tourne sous Rosetta, `uname -m` affiche `x86_64` sur un Mac Apple Silicon. En cas de doute, vérifier avec :
> `sysctl -n machdep.cpu.brand_string` → `Apple M…` = Apple Silicon.

### Repères par année

| Macs | Processeur |
|---|---|
| Vendus **avant fin 2020** | Intel (`x64`) |
| MacBook Air / MacBook Pro 13" / Mac mini de **fin 2020** | Apple M1 ou Intel selon le modèle → vérifier |
| Vendus **à partir de 2021** (hors Mac Pro 2019) | Apple Silicon (`arm64`) |

## 2. Que se passe-t-il en cas d'erreur ?

| Fichier installé | Mac | Résultat |
|---|---|---|
| `arm64` | Apple Silicon | ✅ Natif, rapide |
| `x64` | Intel | ✅ Natif |
| `x64` | Apple Silicon | ⚠️ Fonctionne via **Rosetta 2** (macOS propose de l'installer), plus lent au démarrage. Remplacer par `arm64`. |
| `arm64` | Intel | ❌ Ne s'ouvre pas (« Vous ne pouvez pas ouvrir l'application… ») → prendre `x64` |

### Vérifier la version installée

**Moniteur d'activité** (Applications → Utilitaires), BellePoule Modern lancé, colonne **Type** :

- `Apple` → version `arm64`
- `Intel` → version `x64` (sous Rosetta si le Mac est Apple Silicon)

Colonne absente : clic droit sur l'en-tête des colonnes → cocher **Type**.

## 3. Installer

1. Ouvrir le `.dmg` téléchargé
2. Glisser **BellePoule Modern** dans **Applications**
3. Premier lancement : l'app est signée ad-hoc, **non notarisée** → macOS la bloque.
   - Réglages Système → **Confidentialité et sécurité** → **Ouvrir quand même**
   - ou, dans le Terminal :

     ```bash
     xattr -cr "/Applications/BellePoule Modern.app"
     ```

## 4. Changer de version (x64 → arm64)

1. Quitter BellePoule Modern
2. Supprimer `/Applications/BellePoule Modern.app`
3. Installer le bon `.dmg` (étape 3)

Les compétitions sont conservées : la base (`bellepoule.db`) est dans `~/Library/Application Support/BellePoule Modern/`, pas dans l'application.

## 5. Mises à jour

La mise à jour intégrée télécharge un `.dmg` depuis GitHub. **Vérifier que le nom du fichier contient la bonne architecture** (`arm64` ou `x64`) avant de l'installer. En cas de doute, télécharger manuellement depuis la [page des releases](https://github.com/klinnex/bellepoule-modern/releases/latest).
