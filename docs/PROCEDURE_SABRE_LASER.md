# Procédure de bout en bout — compétition Sabre Laser

> Version de référence : **1.0.3 build #1370**. Procédure organisateur, de la création de
> la compétition à l'export des résultats, pour une épreuve **individuelle** Sabre Laser.
> Épreuve par équipes (format arène) : [TEAM_COMPETITIONS.md](TEAM_COMPETITIONS.md) et
> [SCENARIOS_MATCH.md §16](SCENARIOS_MATCH.md#16-sabre-laser-équipe--format-arène).

---

## Sommaire

| Étape | Où | Durée indicative |
|---|---|---|
| [0. Préparer le matériel](#0-préparer-le-matériel) | Salle | J-1 |
| [1. Créer la compétition](#1-créer-la-compétition) | Liste des compétitions | 2 min |
| [2. Régler la formule](#2-régler-la-formule) | ⚙️ Propriétés | 5 min |
| [3. Inscrire les tireurs](#3-inscrire-les-tireurs) | Onglet **Appel** | 5–15 min |
| [4. Pointer (appel)](#4-pointer-appel) | Onglet **Appel** | selon effectif |
| [5. Lancer la saisie distante](#5-lancer-la-saisie-distante) | Onglet **📡 Saisie distante** | 5 min |
| [6. Poules](#6-poules) | **Préparation** → **Poules** | — |
| [7. Tour Quest (optionnel)](#7-tour-quest-optionnel) | Onglet **Quest** | — |
| [8. Classement intermédiaire](#8-classement-intermédiaire) | Onglet **Classement** | 1 min |
| [9. Tableau](#9-tableau) | Onglet **Tableau** | — |
| [10. Résultats et exports](#10-résultats-et-exports) | **Résultats**, centre d'export | 5 min |
| [11. Clôture](#11-clôture) | — | 2 min |

---

## 0. Préparer le matériel

| Élément | Requis |
|---|---|
| Poste organisateur | BellePoule Modern installé ([INSTALLATION.md](../INSTALLATION.md)), alimenté secteur |
| Réseau | Un Wi-Fi local commun au poste et aux tablettes (Internet non requis) |
| Tablettes / smartphones | 1 par arène (arbitre), navigateur récent |
| Écrans d'arène (optionnel) | 1 TV/navigateur par arène (`/arene{N}`) |
| Fichier d'inscrits | FFE (`.fff`, `.csv`), XML BellePoule, Engarde, TXT ([FILE_FORMATS.md](../FILE_FORMATS.md)) |

Vérifier la veille :
- Le pare-feu du poste autorise le port **8066** (ou le port libre suivant).
- Les tablettes acceptent le certificat auto-signé (test à blanc conseillé, voir §5).
- QR Wi-Fi prêt : **🔧 Outils → 📶 QR Code WiFi** ([WIFI_QR_GUIDE.md](WIFI_QR_GUIDE.md)).

---

## 1. Créer la compétition

1. Écran d'accueil → **Nouvelle compétition**.
2. Renseigner **Titre**, **Date**, **Lieu**, **Catégorie**.
3. **Arme** : `Sabre Laser`. Le genre passe automatiquement à **Mixte** (non modifiable).
4. Laisser **Épreuve par équipes** décoché (individuel).
5. Valider.

---

## 2. Régler la formule

Compétition ouverte → **⚙️ Propriétés**.

### 2.1 Formule de base

| Champ | Recommandé Sabre Laser | Remarque |
|---|---|---|
| Tours de poules | `1` | `0` possible avec Tour Quest direct |
| Élimination directe | Activée | |
| Score max poules | ≥ score maximal attendu (ex. `21`) | Saisie manuelle refusée au-delà ; défaut `21` |
| Chrono poules (s) | `180` | Chrono tablette en poule |
| Score max tableau | ≥ score maximal attendu | |
| Chrono tableau (s) | `180` | Chrono tablette en tableau |
| Match pour la 3ᵉ place | selon règlement | |
| Signature des matchs de tableau | conseillé | Écran signatures sur tablette après chaque match |

> En Sabre Laser, le match se joue **au temps** : aucune limite de score automatique sur
> la tablette, l'arbitre termine le match. Le serveur accepte des scores de 0 à 50.

### 2.2 Tour Quest

Section **Tour Quest** (visible uniquement en Sabre Laser) :

| Choix | Formule obtenue |
|---|---|
| Tour Quest **Non** | Poules → Tableau |
| **Oui**, poules préliminaires **Sans** | Tour Quest → Tableau (tours de poules forcés à 0) |
| **Oui**, poules préliminaires **Avec** | 1 tour de poules → Top *N* qualifiés → Tour Quest → Tableau |

*N* = **Nombre de qualifiés des poules vers le Tour Quest** (min. 2, défaut 8).

### 2.3 Arbitrage et options

| Option | Effet |
|---|---|
| Activer la gestion des arbitres | Arbitres affectés aux poules/matchs, barre arbitre sur la tablette, onglet **Arbitres** |
| Carton noir | Bouton **N** sur la tablette (exclusion + appel DT automatique). Désactivé par défaut |
| Commentaires entraîneurs | Interface `/trainer` |

Enregistrer.

---

## 3. Inscrire les tireurs

Onglet **Appel** :

- **Import** : bouton d'import → choisir le fichier → vérifier l'aperçu → importer.
- **Saisie manuelle** : **Ajouter un tireur** (nom, prénom, club, région, nation, classement).
- Renseigner **club / région / nation** si le Tour Quest utilise une contrainte
  d'adversaire (§7).
- Photos (optionnel) : [GUIDE_PHOTOS.md](GUIDE_PHOTOS.md).

---

## 4. Pointer (appel)

Onglet **Appel** :

1. Cocher chaque tireur présent (statut **Pointé**).
2. Absents : laisser **Non pointé** ou passer en **Forfait**.
3. Pointage déporté possible via `https://<IP>:8066/appel` une fois la saisie distante
   démarrée.

Seuls les tireurs pointés sont répartis en poules / Tour Quest.

---

## 5. Lancer la saisie distante

Onglet **📡 Saisie distante** ([démarrage express](../REMOTE_SCORE_GUIDE.md#démarrage-express)) :

1. Régler le nombre de **pistes / arènes**.
2. Garder **🔒 HTTPS** coché → **Démarrer la saisie distante**.
3. Optionnel : mot de passe par arène (≥ 8 caractères) ou **MDP commun**.
4. Options Sabre Laser utiles : **annonce des cartons** (motif sur l'écran d'arène),
   minuteur vocal.
5. Afficher les **QR codes** : « Arbitre » → tablette, « Affichage piste » → TV.
6. Test à blanc : ouvrir `/arene1/arbitre` sur une tablette, accepter le certificat,
   vérifier « ● Connecté ».

URLs :

```
https://<IP>:8066/arene{N}/arbitre   tablette arbitre
https://<IP>:8066/arene{N}           écran d'arène
https://<IP>:8066/arene{N}/public    spectateurs
https://<IP>:8066/kiosk              affichage général
```

---

## 6. Poules

### 6.1 Préparation

Onglet **Préparation** : nombre et taille des poules, répartition (serpentin par
classement, séparation clubs), arbitres. Valider pour générer les poules.

### 6.2 Affectation aux arènes

Automatique : chaque poule est envoyée à la piste qui lui est attribuée (par défaut
poule N → arène N), y compris pour des poules générées après le démarrage de la saisie
distante. Changer de piste : depuis la poule. Les matchs apparaissent dans la liste de la
tablette correspondante, dans l'ordre de tirage.

### 6.3 Déroulé d'un match (tablette)

| Action | Bouton |
|---|---|
| Sélection du match | Tap sur la carte « A vs B » |
| Démarrer / pause | **▶️ Démarrer**, tap sur le chrono |
| Touche zone A / B / C | **+1** / **+3** / **+5** (appui long = retrait) |
| Carton blanc / jaune / rouge / noir | **B** / **J** (+3 adversaire) / **R** (+5 adversaire) / **N** |
| Sortie d'arène | **🚪 Sortie** (+3 adversaire) |
| Annuler la dernière action | **↩ Annuler** (10 niveaux) |
| Fin | **🏁 Terminer** → **Confirmer** |

Règles automatiques :

| Situation | Comportement |
|---|---|
| 2ᵉ carton blanc | Converti en jaune |
| 2ᵉ faute de groupe 2 | Rouge |
| Les deux tireurs ≥ 10 pts | **Mort subite Challenger** : zone C (+5) seule valide |
| Égalité à 00:00 | **⏱ Lancer 30s** |
| Égalité après 30 s | **Tirage au sort** 🪙 (animation sur l'écran d'arène) |

Détail bouton par bouton : [ARBITRAGE.md](ARBITRAGE.md). Cas concrets :
[SCENARIOS_MATCH.md §1 à §6](SCENARIOS_MATCH.md).

### 6.4 Saisie manuelle (sans tablette)

Onglet **Poules** → clic sur une case de la matrice → saisir les deux scores.

- **Égalité** : obligatoire de désigner le vainqueur → bouton **V** du tireur (ou touche
  `V` au clavier, `Tab` pour changer de tireur). Sans V : « Match nul : cliquez sur V pour
  attribuer la victoire ».
- Annulation : `Ctrl+Z`.

### 6.5 Fin de poule

- Tablette : overlay **POULE TERMINÉE** → **✍️ SIGNATURE** (feuille `/arene{N}/poule`,
  chaque tireur signe) → **📋 JOURNAL**.
- Application : poule marquée complète, classement de poule recalculé.

Classement de poule Sabre Laser (règlement 2026) :

1. Victoires / matchs (V/M)
2. Points Quest / matchs (Q/M)
3. Indice (TD − TR)
4. Victoires par cotation (V4, puis V3, V2, V1)

Barème des points Quest (par victoire) :

| Écart de score | Points Quest |
|---|---|
| ≤ 3 | 1 |
| 4 – 7 | 2 |
| 8 – 11 | 3 |
| ≥ 12 | 4 |

Victoire contre un adversaire forfait / abandon / exclu : ne rapporte pas de points Quest.
Tireurs forfait / abandon / exclus : classés en fin de classement.

---

## 7. Tour Quest (optionnel)

Onglet **Quest** (si activé en §2.2).

1. **Temps disponible (min)** et **Nombre d'arènes** → nombre de combats par tireur
   calculé : `(2 × temps × arènes) / (tireurs × 5 min)`.
2. Forcer une valeur si besoin (champ combats/tireur ; vide = calcul automatique).
3. **Contrainte d'adversaire** : Aucune · Pas même club · Pas même région · Pas même nation.
4. **Générer le planning** → vérifier (erreurs de validation affichées) → **Régénérer** si
   besoin.
5. **Lancer le Tour Quest →** : les combats forment une poule unique, saisie tablette ou
   manuelle comme en §6.
6. Tous combats terminés → contrôler le **Classement Tour Quest** (V/M → Points Quest →
   cartons) → **Valider le Tour Quest →**.

---

## 8. Classement intermédiaire

Onglet **Classement** :

1. Vérifier le classement général (colonnes V/M, Q/M, indice).
2. Corriger si besoin (retour à la poule concernée).
3. Valider le classement → débloque l'onglet **Tableau**.

---

## 9. Tableau

Onglet **Tableau** :

1. Générer le tableau à partir du classement.
2. Les matchs à jouer sont diffusés aux arènes de la saisie distante.
3. Déroulé tablette identique aux poules (chrono `Chrono tableau`).
4. Si **signature des matchs de tableau** activée : écran **✍️ Signature des
   combattants** après chaque match.
5. Saisie manuelle possible : clic sur le match → scores → validation.
6. Match pour la 3ᵉ place si activé.

---

## 10. Résultats et exports

Onglet **Résultats** : classement final, podium.

Centre d'export (sections **Tireurs**, **Poules**, **Tableau d'élimination**,
**Classement**, **Résultats finaux**, **Statistiques**, **Export complet compétition**) :

| Besoin | Export |
|---|---|
| Affichage / impression | PDF poules, tableau, classement ([USER_GUIDE_PDF_EXPORT.md](USER_GUIDE_PDF_EXPORT.md)) |
| Classement avec points Quest | CSV / JSON du classement |
| Archive / reprise | Export complet (depuis l'onglet **Résultats**) |
| Fédération | Export FFE |

---

## 11. Clôture

1. **📡 Saisie distante** → arrêter le serveur.
2. Vérifier l'enregistrement (sauvegarde auto toutes les 2 min, et à la fermeture).
3. Archiver l'export complet (§10) hors du poste.

---

## Dépannage rapide

| Symptôme | Action |
|---|---|
| Tablette « Déconnecté » | Même Wi-Fi ? IP/port corrects ? Pare-feu port 8066 |
| Avertissement certificat | Normal en HTTPS auto-signé : accepter (empreinte visible dans l'app) |
| Coupure Wi-Fi en match | Continuer : file hors-ligne (📴 N), synchro auto au retour ([§12](SCENARIOS_MATCH.md#12-coupure-wi-fi-pendant-le-match)) |
| Score refusé en saisie manuelle | Augmenter **Score max poules / tableau** (§2.1) |
| Égalité refusée en saisie manuelle | Désigner le vainqueur avec **V** (§6.4) |
| Onglet Tableau grisé | Terminer toutes les poules et valider le classement (§8) |
| Mauvais point / carton | Appui long sur le bouton concerné ou **↩ Annuler** |

Plus : [TROUBLESHOOTING.md](../TROUBLESHOOTING.md), [REMOTE_SCORE_GUIDE.md](../REMOTE_SCORE_GUIDE.md).
