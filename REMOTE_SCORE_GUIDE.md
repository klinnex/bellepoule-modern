# BellePoule Modern — Saisie distante (guide organisateur)

> Version **1.0.3**, build **#1365**.
> Côté arbitre : [docs/ARBITRAGE.md](docs/ARBITRAGE.md) · cas pratiques :
> [docs/SCENARIOS_MATCH.md](docs/SCENARIOS_MATCH.md) · démarrage express :
> [REMOTE_SCORE_QUICKSTART.md](REMOTE_SCORE_QUICKSTART.md).

La saisie distante transforme le poste organisateur en serveur web local. Tablettes
d'arbitrage, écrans d'arène, kiosque, spectateurs et overlays de streaming s'y connectent
avec un simple navigateur.

## 1. Prérequis

- Poste organisateur et appareils sur le **même réseau** (Wi-Fi ou Ethernet). Internet
  inutile.
- Port **8066** (ou celui choisi) autorisé dans le pare-feu du poste.
- Navigateurs récents (Chrome/Edge, Safari iPadOS, Firefox).
- Astuce : **🔧 Outils → 📶 QR Code WiFi** pour connecter les tablettes au réseau
  ([docs/WIFI_QR_GUIDE.md](docs/WIFI_QR_GUIDE.md)).

## 2. Démarrage

1. Ouvrir la compétition, onglet **📡 Saisie distante**.
2. Panneau « Saisie distante inactive » :
   - **Pistes** : nombre d'arènes/pistes (± puis Sauvegarder).
   - **Réseau** : interface (toutes, ou une carte précise) et **port** (1–65535,
     défaut 8066 ; si occupé, le port libre suivant est pris).
   - **🔒 Activer HTTPS** (coché par défaut) : certificat auto-signé généré et conservé
     dans le dossier utilisateur. Empreinte SHA-256 affichée.
3. **Démarrer la saisie distante**. L'URL réseau s'affiche (ex. `https://192.168.1.20:8066`).
4. Pour chaque arène : URL + **QR code** des vues (arène, arbitre, poule, public, overlay)
   et **mot de passe** facultatif (8 caractères min., vide = accès libre). Un
   **MDP commun** peut s'appliquer à toutes les pistes.

> HTTPS : à la première connexion, chaque appareil affiche un avertissement de
> certificat. Accepter (comparer l'empreinte si besoin). Changer HTTPS impose un
> redémarrage du serveur.

## 3. Pages disponibles

| URL | Appareil | Accès |
|---|---|---|
| `/` → `/lobby` | Écran d'accueil / salle d'attente | libre |
| `/arene{N}` | TV de l'arène : score, chrono, cartons, photos, annonces | libre |
| `/arene{N}/arbitre` | Tablette d'arbitrage | mot de passe d'arène |
| `/arene{N}/poule` | Feuille de poule + signatures | mot de passe d'arène |
| `/arene{N}/public` | Smartphone spectateur | libre |
| `/arene{N}/overlay` | Overlay OBS / vMix (`/overlay-config` pour le configurer) | libre |
| `/arene{N}/matchs` | Ordre des matchs | libre |
| `/arene{N}/journal` | Journal du match en cours | libre |
| `/equipe{N}`, `/equipe{N}/arbitre` | Sabre Laser équipe (format arène) | arbitre : mot de passe |
| `/kiosk` | Affichage public (tableau, poules, classement), configurable | libre |
| `/poule-ocr` | Saisie d'une feuille de poule par photo (OCR) | authentifié |
| `/appel` (`/checkin`) | Pointage tireurs/arbitres | mot de passe d'appel obligatoire |
| `/formateur` | Commentaires des formateurs sur les arbitres | mot de passe formateur (option `trainerCommentsEnabled`) |
| `/inscription` (`/register`) | Pré-inscription tireur | selon ouverture |
| `/competition/:id/results` | Résultats publics | libre |

Alias anglais : `/arena{N}`, `/arena{N}/referee`, `/arena{N}/public`, ...

## 4. Options de la compétition utiles à la saisie distante

| Paramètre (`competition.settings`) | Effet tablette |
|---|---|
| `weapon` | `L` Sabre Laser : +1/+3/+5, cartons B/J/R (+3/+5), mort subite 10-10, 30 s supp. `E`/`F`/`S` : +1, carton P (passivité), rouge +1, 1 min supp. |
| `defaultPoolTimerSeconds` / `defaultTableTimerSeconds` | Durée du chrono (180 s par défaut) |
| `blackCardEnabled` | Affiche les boutons **N** (exclusion). Défaut : désactivé |
| `refereeFeatureEnabled` | Barre arbitre + changement d'arbitre sur tablette |
| `signTableauMatches` | Signature des tireurs après chaque match de tableau |
| `trainerCommentsEnabled` | Ouvre l'espace `/formateur` |

Options de session (panneau Saisie distante) : **annonce des cartons** (motifs + annonces
à l'écran), affichage des **photos**, **thèmes** (global et par écran), **logo**,
**fond d'écran**, **note kiosque**, **minuteur vocal** (voix, paliers), **webhook**.

## 5. Pendant la compétition

- **Écrans connectés** : liste des appareils (type, arène, IP, batterie), identification
  à l'écran, renommage, commandes à distance ([docs/TELECOMMANDE_TV.md](docs/TELECOMMANDE_TV.md)).
- **Appels DT** : notification à chaque 📣 d'une tablette (et à chaque carton noir) ;
  acquittement depuis l'application.
- **Résultats** : chaque match terminé sur tablette met à jour la poule ou le tableau
  dans l'application (IPC `match:finished`). Les signatures apparaissent dans
  Poule → Signatures / Tableau → Signatures.
- **Saisie manuelle** possible en parallèle depuis l'application : l'arène est libérée.
- **Réinitialiser un match** de poule depuis l'application si erreur.
- **Audit** : chaque score est tracé (`score_audit_log` : arbitre, IP, poule). Conflit
  d'IP signalé.

## 6. Sécurité

Détails : [docs/SECURITE_SAISIE_DISTANTE.md](docs/SECURITE_SAISIE_DISTANTE.md).

- Origines HTTP et Socket.IO restreintes au réseau local.
- Mots de passe ≥ 8 caractères, cookies HttpOnly `SameSite=Strict` (8 h), `Secure` en HTTPS.
- Limitation des tentatives de connexion par IP et par arène, blocage progressif.
- Routes d'administration (`/api/session/start|stop`, `/api/debug`) limitées à la machine
  locale.
- Scores validés (entiers 0–50), limitation du nombre de soumissions par minute.
- CSP sur toutes les pages.

## 7. API (référence)

### REST principales

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/session` | Session active (arme, options, règles d'entraînement) |
| GET | `/api/server-info`, `/api/config` | Infos serveur |
| GET | `/api/arenas`, `/api/arenas/:id` | État des arènes |
| GET | `/api/arenas/:id/matches` | Matchs de l'arène |
| GET | `/api/arenas/:id/pool-data`, `/pool-order` | Feuille de poule |
| GET | `/api/arenas/:id/obs-json` | Données overlay |
| GET/POST | `/api/arenas/:id/black-cards[/:fencerId/cancel]` | Cartons noirs |
| POST | `/api/auth/login/:arenaId` | Connexion arène |
| POST | `/api/matches/:id/score` | Sauvegarde intermédiaire du score |
| POST | `/api/matches/:id/finish` | Fin de match (scores, cartons, vainqueur imposé, carton noir) |
| POST | `/api/matches/:id/fencers/:fencerId/signature` | Signature tableau |
| POST | `/api/pools/:poolId/fencers/:fencerId/signature` | Signature poule |
| POST | `/api/pools/:poolId/matches/:matchId/score` | Score depuis la feuille de poule |
| POST | `/api/ocr/pool-sheet` | OCR d'une feuille de poule |
| POST | `/api/sync` | Rejeu de la file hors-ligne |
| GET | `/api/bracket`, `/api/competitions/:id/results-data` | Tableau, résultats |
| GET | `/api/referees/rotation-report` | Rapport de rotation des arbitres |
| GET/POST | `/api/checkin/*`, `/api/trainer/*`, `/api/register*` | Appel, formateurs, inscription |

### Socket.IO

| Client → serveur | Rôle |
|---|---|
| `join_arena`, `join_pool`, `join_team_arena`, `dashboard:subscribe` | Abonnements |
| `client:register`, `client:pong`, `client:battery` | Suivi des écrans |
| `arena_control` | Commandes d'arbitrage (voir [ARBITRAGE.md §7](docs/ARBITRAGE.md#7-protocole-référence-technique)) |
| `team_touch`, `team_timer_start`, `team_timer_pause`, `team_advance_bout`, `team_reset_bout` | Sabre Laser équipe |

| Serveur → client | Rôle |
|---|---|
| `arena:{id}:update` | État de l'arène (match, score, chrono, cartons, mort subite, options) |
| `arena:{id}:card_announcement`, `:exit_announcement`, `:coin_flip` | Annonces et tirage au sort |
| `team_arena_state` | État Sabre Laser équipe |
| `rankings:update`, `pools:update`, `matches:update`, `bracket:update` | Kiosk / dashboard |
| `server:command` | Thèmes, identification, ping, rechargement |
| `logo:update`, `wallpaper:update`, `tts:update`, `kiosk:note` | Personnalisation |
| `auth_error`, `error` | Erreurs |

## 8. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Page inaccessible | Réseau différent, pare-feu | Même Wi-Fi ; autoriser le port ; choisir la bonne interface |
| Avertissement de certificat | HTTPS auto-signé | Accepter ; ou désactiver HTTPS et redémarrer |
| « Le port 8066 est déjà utilisé » | Autre instance / dev server | Changer le port ou fermer l'autre programme |
| Redirection `/login` en boucle | Cookies bloqués / navigation privée | Autoriser les cookies, navigation normale |
| « Trop de tentatives » | Blocage progressif | Attendre, vérifier le mot de passe |
| Tablette « Déconnecté » | Wi-Fi instable | Saisie continue hors-ligne ; synchronisation au retour |
| Score non remonté | Match fini hors-ligne | Re-confirmer une fois reconnecté ; sinon saisie manuelle |
| Boutons +3/+5 absents | Arme olympique | Normal (1 touche) |
| Bouton N absent | Carton noir désactivé | Activer `blackCardEnabled` dans les paramètres |

Voir aussi [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
