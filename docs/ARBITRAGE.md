# Interface d'arbitrage (tablette)

> Version de référence : **1.0.3 build #1365** — source : `src/remote/referee.html`,
> serveur : `src/main/remoteScoreServer.ts`.
> Voir aussi : [SCENARIOS_MATCH.md](SCENARIOS_MATCH.md) (cas concrets pas à pas),
> [../REMOTE_SCORE_GUIDE.md](../REMOTE_SCORE_GUIDE.md) (mise en place côté organisateur).

L'interface d'arbitrage est une page web servie par l'application organisateur. Elle tourne
dans le navigateur de n'importe quelle tablette ou smartphone du réseau local — aucune
installation. Un arbitre = une arène (ou piste) = une URL.

---

## 1. Accès

| Élément | Valeur |
|---|---|
| URL arbitre | `https://<IP-organisateur>:8066/arene{N}/arbitre` |
| Alias acceptés | `/arena{N}/referee`, `/arene{N}/referee`, `/arbitre/{N}`, `/arbitre/arene{N}` |
| Écran d'arène associé | `/arene{N}` (même N) |
| Protocole | HTTPS par défaut (certificat auto-signé), HTTP si désactivé dans la saisie distante |
| Port | 8066 par défaut ; port libre suivant si occupé |

1. L'organisateur démarre la **Saisie distante** et affiche le **QR code** de l'arène.
2. L'arbitre scanne le QR code (ou tape l'URL).
3. En HTTPS : accepter l'avertissement de certificat (auto-signé). L'empreinte SHA-256 est
   visible dans l'application pour vérification.
4. Si l'arène a un **mot de passe** (8 caractères min.) : redirection vers `/login`. Après
   saisie, un cookie `bp_token_arena{N}` (HttpOnly, 8 h) garde la session.
   - Tentatives limitées par IP et par arène, blocage progressif en cas d'échecs.
   - Sans mot de passe : accès libre.

---

## 2. Écran « Liste des matchs »

Premier écran affiché à l'ouverture.

```
┌──────────────────────────────────────────────┐
│ 📋 Matchs — Arène 3                          │
│ [🔍 Rechercher un tireur...              ]   │
│ ⬛ Cartons noirs actifs (si présents)        │
│ ┌──────────────────────────────────────────┐ │
│ │ DUPONT vs MARTIN   🕐 À jouer          › │ │
│ │ Club A · Club B                          │ │
│ ├──────────────────────────────────────────┤ │
│ │ LEROY vs PETIT     ⚔️ En cours         › │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

- Matchs de la poule (ou du tableau) assignés à l'arène, dans l'ordre de tirage.
- Badges : **🕐 À jouer**, **⚔️ En cours**.
- Recherche par nom de tireur.
- **Cartons noirs actifs** : liste des tireurs exclus sur cette arène, avec bouton
  d'annulation (erreur d'arbitrage).
- Tous matchs finis → message « ✅ Tous les matchs de cette arène sont terminés » +
  boutons **✍️ SIGNATURE** (feuille de poule `/arene{N}/poule`) et **📋 JOURNAL**.
- Toucher une carte → sélection du match (`select_match`), passage à l'écran de match.

---

## 3. Écran de match

```
┌────────────────────────────────────────────────────────┐
│ ⚔️ Arène 3      ⇄  👁  ● Connecté  📴2  🔋15%  📣  📋   │  ← en-tête
├────────────────────────────────────────────────────────┤
│                                          [← Retour]    │
│  ┌──────── ROUGE ────────┐ VS ┌──────── VERT ────────┐ │
│  │ DUPONT Jean           │    │ MARTIN Paul          │ │
│  │ Club A                │    │ Club B               │ │
│  │ [B][J]  (cartons)     │    │                      │ │
│  │          7            │    │          4           │ │
│  │  [+1]  [+3]  [+5]     │    │  [+1]  [+3]  [+5]    │ │
│  │  [B] [J] [R] [N]      │    │  [B] [J] [R] [N]     │ │
│  └───────────────────────┘    └──────────────────────┘ │
│                   ⚡ MORT SUBITE – Zone C uniquement !  │
│                        02:14                            │
│                 ⏱ 30s SUPPLEMENTAIRE                    │
│      Tapez pour démarrer/pause - Appui long pour reset  │
│                       [🔇 Voix]                         │
│        [ ▶️ Démarrer / ⏸ Pause ]   [ 🏁 Terminer ]      │
│   [🚪 Sortie rouge]   [↩ Annuler]   [🚪 Sortie verte]   │
│   ⚖️ Arbitre : NOM Prénom              [Changer]        │
└────────────────────────────────────────────────────────┘
```

### 3.1 En-tête

| Icône | Fonction |
|---|---|
| ⇄ | Inverse rouge/vert à l'écran (tireurs changés de côté). Mémorisé pour le match. |
| 👁 | Mode daltonien : vert → bleu. Persistant (`localStorage bp_colorblind`, ou `?cb=1` dans l'URL). |
| ● / texte | État de connexion Socket.IO (Connecté / Déconnecté). |
| 📴 N | Hors-ligne : N actions en attente de synchronisation. |
| ⟳ Sync... | Synchronisation de la file hors-ligne en cours. |
| 🔋 N% | Batterie faible (badge rouge) ; niveau remonté à l'organisateur. |
| 📣 | **Appel DT** (Directoire Technique). Tap court = appel, appui long = annulation. Notification dans l'application organisateur. |
| 📋 | Journal du match (`/arene{N}/journal`) : chronologie touches / cartons / sorties. |

### 3.2 Côtés et couleurs

- Par défaut : **gauche = rouge**, **droite = vert**.
- Le bouton ⇄ échange les côtés ; les boutons s'appliquent toujours au tireur affiché
  au-dessus d'eux.
- L'écran d'arène (`/arene{N}`) peut aussi inverser son affichage (`toggle_swap`).

### 3.3 Boutons de touche

| Bouton | Sabre Laser (`L`) | Escrime olympique (`E`/`F`/`S`) |
|---|---|---|
| **+1** | Zone A = 1 pt | 1 touche |
| **+3** | Zone B = 3 pts | masqué |
| **+5** | Zone C = 5 pts | masqué |

- **Appui court** : ajoute les points.
- **Appui long (0,8 s)** : retire les points (correction).
- Vibration proportionnelle (40/80/120 ms).
- Saisie bloquée tant que le match n'est pas **démarré** (« ⏱ Démarrez le match pour
  saisir des touches ») et après la fin.
- Aucune limite de score automatique : l'arbitre termine lui-même le match (score
  validé côté serveur entre 0 et 50).

### 3.4 Boutons de carton

| Bouton | Sabre Laser | Escrime olympique |
|---|---|---|
| **B** (blanc) | Avertissement. 2ᵉ blanc → jaune automatique. | Remplacé par **P** (passivité). |
| **J** (jaune) | +3 pts à l'adversaire. 2ᵉ faute de groupe 2 → rouge. | Avertissement, 0 pt. Jaune après jaune/rouge → rouge. |
| **R** (rouge) | +5 pts à l'adversaire. | +1 touche à l'adversaire. |
| **N** (noir) | Exclusion (si option activée). | Exclusion (si option activée). |
| **P** (passivité) | — | 1ᵉʳ : P-rouge aux deux tireurs, +1 chacun. 2ᵉ : P-noir, fin du combat. |

- **Appui long** sur un bouton carton : retire le dernier carton du tireur et restitue
  les points accordés. Appui long sur **P** : retire le dernier carton de passivité.
- **Carton noir** : visible seulement si `blackCardEnabled` (paramètre compétition,
  désactivé par défaut). Fenêtre de confirmation → match perdu, tireur **exclu** de la
  compétition (statut `EXCLUDED`, motif enregistré), **DT appelé automatiquement**.
  Annulable depuis la liste des matchs.

#### Sélecteur de motif (annonce des cartons)

Si l'option **annonce des cartons** est active (`cardAnnounce`), un appui sur B/J/R ouvre
la liste des motifs. Le carton réellement donné dépend du groupe de faute et de
l'historique du tireur :

| Groupe (Sabre Laser) | Progression | Exemples |
|---|---|---|
| 1 | Blanc → Jaune → Jaune | Contre-attaque, touche lourde, sortie sans autorisation, commencer avant « Combattez ! » |
| 2 | Jaune → Rouge → Rouge | Acte violent, touche d'estoc, sortie volontaire pour éviter une touche, bras non armé |
| 3 | Rouge direct | Combat non loyal, comportement antisportif, trouble de l'ordre |

En escrime olympique : fautes « jaunes » (jaune → rouge) et fautes « rouges » (rouge direct),
pas de blanc. Le motif est annoncé sur l'écran d'arène (`card_announcement`), avec mention
« revalorisation » quand un blanc devient jaune. « ✕ Annuler » = carton donné sans annonce.

### 3.5 Chronomètre

| Geste | Effet |
|---|---|
| Tap sur l'affichage ou **▶️ Démarrer** | Démarre le match (1ʳᵉ fois) puis pause/reprise. |
| Appui long (0,8 s) sur l'affichage | Remise à zéro du chrono (sort de la mort subite). |
| 🔇 Voix | Minuteur vocal (TTS) : « Une minute », « Trente secondes », « Dix secondes », 5-4-3-2-1, « Temps ! ». Paliers et voix réglés dans l'application. |

- Durée : `defaultPoolTimerSeconds` en poule, `defaultTableTimerSeconds` en tableau
  (180 s par défaut). Mode entraînement : durée personnalisée.
- **← Retour** désactivé pendant que le chrono tourne.
- Le temps est diffusé chaque seconde à l'écran d'arène.

### 3.6 Fin de temps, temps supplémentaire, mort subite

| Situation | Sabre Laser | Escrime olympique |
|---|---|---|
| Temps écoulé, scores différents | « ⏰ Temps écoulé ! » → arbitre appuie **🏁 Terminer** | idem |
| Temps écoulé, **égalité** | Bouton **⏱ Lancer 30s** | Bouton **⏱ Lancer 1 min** |
| Fin du temps supplémentaire, égalité | **Tirage au sort** 🪙 | **Tirage au sort** 🪙 |
| Les deux tireurs ≥ 10 pts | **Mort subite Challenger** : zone C (+5) uniquement | — |

- Mort subite Challenger + temps supplémentaire peuvent se cumuler
  (`challenger_supplementary`) : 30 s, zone C uniquement.
- Retirer des points sous 10 annule la mort subite Challenger.
- Mode entraînement : `disableSuddenDeath` supprime ces mécanismes ; `allowedZones`
  restreint les zones autorisées.

**Tirage au sort** : animation plein écran sur l'écran d'arène (≈ 4,5 s), puis
confirmation sur la tablette (« Vainqueur : NOM (VERT/ROUGE) ») → fin du match avec ce
vainqueur.

### 3.7 Sortie d'arène / de piste

**🚪 Sortie rouge** / **🚪 Sortie verte** : pénalise le tireur sorti.

| Arme | Points à l'adversaire |
|---|---|
| Sabre Laser | +3 |
| Escrime olympique | +1 |

Enregistrée dans `match_arena_exits`, annoncée à l'arène si l'annonce est active.

### 3.8 Annuler

**↩ Annuler** restaure l'état avant la dernière action (touche, carton, sortie) : scores,
cartons, historique des fautes, état mort subite. Jusqu'à **10** actions.

### 3.9 Terminer

**🏁 Terminer** → pause du chrono → fenêtre « Confirmez-vous la fin de ce match ? » avec
le score (rouge – vert).

- **Annuler** : reprise du chrono si il tournait.
- **Confirmer** : `POST /api/matches/:id/finish` → vainqueur = meilleur score →
  enregistrement en base, mise à jour de la poule/du tableau dans l'application,
  diffusion `match_finished`.
- Retour automatique à la liste après 2 s.
- **Tableau** + option `signTableauMatches` : écran **✍️ Signature des combattants**
  (deux zones de signature) avant le match suivant.

### 3.10 Barre arbitre

Visible si `refereeFeatureEnabled`. Affiche l'arbitre du match (par défaut l'arbitre de la
poule). **Changer** → liste des arbitres pointés → `change_referee` (mise à jour en base
et dans l'application organisateur).

---

## 4. Fin de poule et signatures

Dernier match de la poule terminé → overlay plein écran **POULE TERMINÉE** :

- **✍️ SIGNATURE** → `/arene{N}/poule` : feuille de poule (onglets *Tableau* / *Matchs*),
  chaque tireur signe au doigt. Signatures stockées dans `pool_signatures`.
- **📋 JOURNAL** → chronologie détaillée de l'arène.

---

## 5. Mode hors-ligne

- Service Worker (`/sw.js`) : la page reste utilisable sans réseau.
- Chaque sauvegarde de score (`POST /api/matches/:id/score`) qui échoue est placée dans une
  file IndexedDB (`OfflineQueueInline`). Badge 📴 + compteur.
- Retour réseau → synchronisation automatique (⟳ Sync...).
- Socket.IO se reconnecte seul (200 ms → 5 s).

---

## 6. Interfaces voisines

| URL | Rôle |
|---|---|
| `/arene{N}` | Écran d'arène (TV) : score, chrono, cartons, photos, annonces, tirage au sort. |
| `/arene{N}/public` | Vue spectateurs sur smartphone. |
| `/arene{N}/overlay` | Overlay streaming OBS/vMix (configurateur : `/overlay-config`). |
| `/arene{N}/matchs` | Ordre des matchs de l'arène. |
| `/arene{N}/poule` | Feuille de poule + signatures (auth arène). |
| `/arene{N}/journal` | Journal du match courant. |
| `/equipe{N}/arbitre` | Tablette **Sabre Laser équipe** (format arène) : compteur d'assaut plafonné (5 touches / 3 min), « Relais suivant → », cartons d'équipe « E ». |
| `/equipe{N}` | Écran d'arène équipe. |
| `/poule-ocr` | Saisie d'une feuille de poule par photo (OCR Tesseract). |
| `/formateur` | Formateurs : commentaires sur les arbitres (mot de passe dédié). |
| `/appel` | Pointage tireurs/arbitres sur tablette (mot de passe obligatoire). |
| `/inscription` | Pré-inscription tireur. |
| `/kiosk` | Affichage public (TV) : tableau, poules, classement. |
| `/lobby` | Salle d'attente (page d'accueil `/`). |

---

## 7. Protocole (référence technique)

Socket.IO — événement unique `arena_control` `{ arenaId, action, ... }` (auth par cookie
d'arène, sauf `toggle_swap`).

| `action` | Émis par | Effet serveur |
|---|---|---|
| `select_match` | tablette | Assigne le match à l'arène, remet cartons/touches/sorties à zéro. |
| `start` / `pause` | tablette | Statut de l'arène. |
| `update_score` | tablette | Scores, cartons, zones touchées, état mort subite (anti-rebond). |
| `update_timer` / `pause_timer` / `reset_timer` | tablette | Diffusion du chrono. |
| `waiting_overtime` | tablette | Égalité en attente de temps supplémentaire. |
| `coin_flip` | tablette | Animation de tirage au sort sur l'arène. |
| `add_card`, `arena_exit` | tablette | Cartons / sorties. |
| `card_announcement`, `exit_announcement` | tablette | Annonce à l'écran d'arène. |
| `dt_call` / `dt_cancel` | tablette | Notification DT dans l'application. |
| `change_referee` | tablette | Change l'arbitre du match. |
| `finish`, `next`, `reset_scores` | tablette | Fin, match suivant, remise à zéro. |
| `toggle_swap` | arène | Inverse l'affichage. |

Diffusion vers les écrans : `arena:{id}:update`, `arena:{id}:card_announcement`,
`arena:{id}:exit_announcement`, `arena:{id}:coin_flip`, `server:command` (thèmes,
identification d'écran, ping).

REST utilisé par la tablette : `GET /api/session`, `GET /api/tts-config`,
`GET /api/arenas/:id/matches`, `GET /api/arenas/:id/black-cards`,
`POST /api/arenas/:id/black-cards/:fencerId/cancel`, `POST /api/matches/:id/score`,
`POST /api/matches/:id/finish`, `POST /api/matches/:id/fencers/:fencerId/signature`.
