# RGPD — données personnelles dans BellePoule Modern

> Issue #1882. Le logiciel **n'est pas responsable de traitement** : l'organisateur (club,
> comité, ligue) l'est. BellePoule Modern fournit les outils pour qu'il puisse être conforme.
> Ce document n'est pas un avis juridique.

## 1. Données traitées

Tout est stocké **en local**, dans `<userData>/bellepoule.db` (SQLite). Aucune télémétrie.

| Où | Données | Tables |
|---|---|---|
| Compétitions | nom, prénom, date de naissance, sexe, nationalité, région, département, club, licence, classement, latéralité, photo, statut, statistiques de poule | `fencers`, `pool_stats` (colonne) |
| Résultats | matchs, scores, touches, cartons, sorties d'arène, abandons, classement saisonnier | `matches`, `match_touches`, `match_cards`, `match_arena_exits`, `fencer_abandons`, `season_results`, `bracket_nodes`, `team_*` |
| Signatures | signatures manuscrites des feuilles de poule et des matchs de tableau | `pool_signatures`, `de_match_signatures` |
| Instantanés | état de la session (poules, tableau, classements) | `session_state`, `arena_state` |
| Arbitres | nom, club, licence, commentaires, nom et IP de la tablette dans le journal des scores | `referees`, `event_day_referees`, `referee_comments`, `score_audit_log` |
| Mode Club | nom, prénom, licence, date/année de naissance, sexe, latéralité, photo, notes, code de carte, présences, combats, bilans de séance | `club_members`, `club_attendance`, `club_bouts` |
| Mode Club – maîtres d'armes | nom, prénom, fonction, téléphone, e-mail, armes enseignées, notes, séances encadrées (hors recherche RGPD : rectification / effacement depuis l'onglet Maîtres d'armes) | `club_coaches`, `club_session_coaches` |

Sorties possibles : exports PDF / CSV / XML / `.bpm`, sauvegarde cloud (chiffrement AES-GCM
optionnel), webhooks Discord/Slack (HTTPS imposé), pages servies en Wi-Fi par le serveur distant.

## 2. Finalités et base légale (à adapter par l'organisateur)

| Finalité | Base légale usuelle |
|---|---|
| Inscription, poules, tableaux, classement, résultats | exécution du contrat d'inscription / intérêt légitime de l'organisateur |
| Affichage des résultats (écrans, PDF, publication) | intérêt légitime (sport en compétition publique) — information préalable |
| Photo des tireurs et des membres | **consentement** (des parents pour un mineur) |
| Suivi des membres du club (présences, combats, bilans) | exécution du contrat d'adhésion / intérêt légitime du club |

## 3. Outils fournis

Tous dans **Paramètres → Confidentialité (RGPD)**, sauf mention contraire.

### Droits des personnes

Recherche d'une personne par nom, prénom ou licence dans **toutes les compétitions** et le
**Mode Club**. Les fiches sont regroupées par licence, sinon par nom + prénom + date de naissance.
Un membre du club sans licence n'est rattaché à un homonyme que si les dates de naissance
sont compatibles (même date, ou date inconnue et candidat unique).

| Droit | Action | Détail |
|---|---|---|
| Accès / portabilité | **Exporter (JSON)** | Lignes brutes de toutes les tables qui référencent la personne (`format: bellepoule-modern/personal-data`) |
| Accès | **Exporter (PDF)** | Synthèse lisible : identité, compétitions, matchs, présences et combats du club |
| Effacement (alternative) | **Anonymiser** | Nom → pseudonyme `Anonyme XXXXXX` commun à toutes les fiches ; prénom, date de naissance, licence, photo effacés ; signatures supprimées ; instantanés JSON réécrits. Résultats et statistiques conservés |
| Effacement | **Effacer** | Supprime les fiches tireur (matchs, touches, cartons, signatures, équipes, classement saisonnier) et membre (présences, combats). Les instantanés de session gardent une place neutre `—` |
| Rectification | fiche tireur / membre | Modification classique depuis la liste des tireurs ou le Mode Club |

Effacer un tireur supprime aussi ses matchs : les résultats de ses adversaires changent.
Pour une compétition terminée, préférer **Anonymiser**.

**Anonymiser** et **Effacer** sont refusés tant qu'une compétition de la personne est ouverte
dans l'application ou servie aux tablettes : son état en mémoire réécrirait les noms. Fermer
la compétition (et arrêter son serveur distant) avant l'action. La purge par durée de
conservation ignore de même une compétition ouverte.

Après chaque anonymisation, effacement ou purge, la base est compactée (WAL vidé, `VACUUM`)
et `secure_delete` est actif : aucune donnée effacée ne reste lisible dans `bellepoule.db`
ni dans une sauvegarde (**Enregistrer sous**, archive `.bpm`).

### Durée de conservation

- Deux durées (en mois, 0 = illimitée) : **compétitions** (date de la compétition) et
  **membres inactifs du club** (dernière présence, dernier combat ou dernière modification).
- Action : **Anonymiser** (tireurs `Anonyme <n°>`, arbitres `Arbitre <n°>`, nom et IP des
  tablettes retirés du journal, commentaires d'arbitre sans auteur ni libellé de match et
  noms des tireurs remplacés par leur pseudonyme) ou **Supprimer définitivement**.
- **Vérifier maintenant** liste les éléments échus ; **Appliquer** demande confirmation.
- **Appliquer automatiquement au démarrage** : purge sans intervention. Sinon, un rappel
  s'affiche au démarrage tant que des données sont échues.
- Une compétition anonymisée est marquée (`competitions.anonymized_at`) et sort de la liste.

Réglages stockés dans `<userData>/privacy-settings.json`.

### Exposition réseau

**Noms sur le réseau** : toutes les réponses REST et tous les paquets Socket.IO du serveur
distant (écrans, `public.html`, overlay, résultats, kiosque, tablettes) passent par
`src/main/remote/publicDto.ts` :

| Réglage | Affichage |
|---|---|
| Noms complets | `DUPONT Léa` |
| Prénom abrégé | `DUPONT L.` |
| Initiales | `D. L.` |

Noms concernés : prénom / nom des tireurs, noms composés (`fencerAName`, `refereeName`,
`fencerName`, `opponentName`, `opponent`…) et clé `name` des objets personne (`referee`,
`fencer`, `fencerA` / `fencerB`, listes `referees` / `fencers`), dont le programme public
`/api/public/fencers/:id/schedule`. Le serveur ne reprend jamais un nom abrégé renvoyé par une
tablette : à la sélection d'un match, tireurs et arbitre viennent de la session.

Toujours retirés, quel que soit le réglage : date de naissance, licence, IP des tablettes,
photo (sauf affichage des photos activé pour la session). Appliqué à chaud.

### Suppression d'une compétition

Supprimer une compétition efface toutes ses lignes : tireurs, poules, matchs de poule et de
tableau, touches, cartons, signatures, équipes, instantanés de session et d'arène, journal
des tablettes. Seuls les résultats déjà versés au **classement saisonnier** sont conservés ;
la purge par durée de conservation (mode suppression) les efface aussi.

### Archives `.bpm` chiffrées

Un `.bpm` contient les données personnelles de la compétition. **Archive .bpm chiffrée**
exporte une compétition (ou toute la base) chiffrée par mot de passe :

- AES-256-GCM, clé dérivée par scrypt (N = 2^15, r = 8, p = 1), sel et IV aléatoires,
  en-tête authentifié (`src/main/bpmCrypto.ts`) ; mot de passe de 8 caractères minimum ;
- **Fichier → Ouvrir** détecte une archive chiffrée et demande le mot de passe ;
- mot de passe perdu = archive illisible (aucune récupération) ;
- la copie en clair intermédiaire est créée sous `userData` puis supprimée : le dossier choisi
  (éventuellement synchronisé) ne reçoit que le fichier chiffré.

### Information et consentement

- `register.html` (inscription distante) : mention d'information sous le formulaire ; case
  de **consentement photo** obligatoire pour envoyer un selfie (refus côté serveur sinon).
- Fiches tireur (ajout, modification) et import de photos (tireurs, club) : rappel du
  consentement (parental pour un mineur).
- Centre d'export et webhooks : avertissement « contient des données personnelles ».

## 4. Mesures de sécurité recommandées à l'organisateur

- **Chiffrer le disque** de l'ordinateur (BitLocker, FileVault, LUKS) : recommandé en complément
  du chiffrement de la base par l'application (voir § 6) ; il couvre aussi les exports et sauvegardes.
- Session utilisateur protégée par mot de passe ; verrouillage automatique.
- Activer le chiffrement de la sauvegarde cloud ; chiffrer les `.bpm` transmis.
- Wi-Fi de la salle protégé (WPA2/3) ; mots de passe d'arène ; HTTPS du serveur distant.
- Webhooks : ne publier que les résultats, sur des canaux à accès restreint.

## 5. Procédures

**Demande d'accès / de portabilité** — Paramètres → Confidentialité → rechercher la
personne → Exporter (JSON et/ou PDF) → transmettre de façon sécurisée (sous un mois).

**Demande d'effacement** — vérifier l'identité ; si des résultats doivent rester publiés
(compétition officielle), proposer l'anonymisation ; sinon Effacer. Effacer aussi les
exports déjà diffusés et les sauvegardes, à leur prochaine rotation.

**Rectification** — modifier la fiche (liste des tireurs, Mode Club).

**Fin de saison** — fixer les durées de conservation, Vérifier maintenant, Appliquer.

## 6. Limites connues

- **Chiffrement au repos (SQLCipher)** : `bellepoule.db` est chiffrée (SQLCipher 4, AES-256) dès
  le premier lancement ; une base en clair existante est migrée en place au démarrage. La clé
  (256 bits aléatoires) est stockée dans `<userData>/db-key.bin`, chiffrée par le trousseau du
  système (Keychain, DPAPI, libsecret) ; elle n'est jamais écrite en clair.
  Limites :
  - si le trousseau n'est pas disponible (Linux sans gestionnaire de secrets), la base reste
    **en clair** et un avertissement est journalisé ;
  - la clé est liée au compte système : une copie du dossier `userData` sur un autre poste ou
    après réinitialisation du trousseau rend la base **illisible** (l'application refuse de
    l'ouvrir et n'écrase rien). Transporter les données via les archives `.bpm` chiffrées ;
  - les fichiers **exportés** restent en clair : **Enregistrer sous**, exports PDF/CSV/XML,
    `.bpm` non chiffré, et **sauvegardes automatiques** (dossier de sauvegarde, cf. réglages).
    Les chiffrer relève de l'organisateur (archive `.bpm` chiffrée, chiffrement du disque) ;
  - **Fichier → Ouvrir** d'un fichier externe l'ouvre dans son format (en clair s'il l'est) ;
  - l'effacement des anciennes versions de la base repose sur `secure_delete` et un écrasement
    du fichier : sur support SSD, la couche flash peut conserver des copies hors de portée de
    l'application. Mesure compensatoire : chiffrement du disque.
- Les exports déjà produits (PDF, CSV, XML, `.bpm` non chiffrés) ne sont pas suivis par
  l'application : leur effacement relève de l'organisateur.
- Les référentiels importés (classements FFE, fichiers FFF) restent sous la responsabilité
  de leur source.

## 7. Modèle de mention d'information

> **Protection des données personnelles** — Les informations recueillies (nom, prénom, sexe,
> date de naissance, nationalité, club, n° de licence, photo le cas échéant) sont traitées par
> **[nom de l'organisateur, adresse]**, responsable de traitement, pour l'organisation de la
> compétition **[nom]** : inscription, constitution des poules et tableaux, arbitrage,
> classement et publication des résultats. Base légale : exécution de votre inscription et
> intérêt légitime de l'organisateur ; la photo repose sur votre consentement (celui de vos
> parents si vous êtes mineur), retirable à tout moment.
> Les nom, prénom, club et résultats peuvent être affichés sur les écrans de la salle et
> publiés (feuilles de résultats, site, réseaux de la fédération). Les données sont
> conservées **[durée, ex. 3 ans]** après la compétition, puis anonymisées.
> Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation,
> d'opposition et de portabilité : **[adresse e-mail de contact]**. Vous pouvez introduire une
> réclamation auprès de la CNIL (www.cnil.fr).

## 8. Code

| Fichier | Rôle |
|---|---|
| `src/database/encryption.ts` | Chiffrement SQLCipher : ouverture, migration d'une base en clair, écrasement |
| `src/main/dbKey.ts` | Clé de la base, stockée chiffrée par safeStorage (`db-key.bin`) |
| `src/database/repos/privacyRepo.ts` | Recherche, export, anonymisation, effacement, conservation, purge d'une compétition |
| `src/main/ipc/privacyHandlers.ts` | Canaux `privacy:*`, purge automatique au démarrage |
| `src/main/privacySettings.ts` | Réglages `<userData>/privacy-settings.json` |
| `src/main/remote/publicDto.ts` | Filtrage et abréviation des noms sur le réseau |
| `src/main/bpmCrypto.ts` | Archives `.bpm` chiffrées |
| `src/renderer/components/PrivacySettingsSection.tsx` | Paramètres → Confidentialité |
| `src/renderer/components/PrivacyPrompts.tsx` | Mot de passe d'archive, rappel de conservation |
| `src/shared/utils/personalDataPdf.ts` | Export PDF par personne |
