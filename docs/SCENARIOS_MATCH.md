# Scénarios de match — tablette d'arbitrage

> Version de référence : **1.0.3 build #1365**. Comportements décrits d'après
> `src/remote/referee.html` et `src/main/remoteScoreServer.ts`.
> Description de chaque bouton : [ARBITRAGE.md](ARBITRAGE.md).

Conventions :
- **ROUGE** = tireur affiché à gauche, **VERT** = à droite (côtés par défaut).
- Score noté `ROUGE – VERT`.
- « Tap » = appui court, « appui long » = 0,8 s.

---

## Sommaire

| # | Scénario | Arme |
|---|---|---|
| 1 | [Match de poule simple](#1-match-de-poule-simple--sabre-laser) | Sabre Laser |
| 2 | [Cartons blanc → jaune, rouge](#2-cartons-blanc--jaune-et-rouge--sabre-laser) | Sabre Laser |
| 3 | [Cartons avec motif (annonce)](#3-cartons-avec-motif-annonce-active--sabre-laser) | Sabre Laser |
| 4 | [Égalité → 30 s → tirage au sort](#4-égalité-à-temps--30-s-supplémentaires--tirage-au-sort--sabre-laser) | Sabre Laser |
| 5 | [Mort subite Challenger 10-10](#5-mort-subite-challenger-10-10--sabre-laser) | Sabre Laser |
| 6 | [Sortie d'arène](#6-sortie-darène--sabre-laser) | Sabre Laser |
| 7 | [Erreur de saisie : corriger](#7-erreur-de-saisie--corriger) | Toutes |
| 8 | [Carton noir / exclusion](#8-carton-noir--exclusion) | Toutes |
| 9 | [Match de poule à l'épée](#9-match-de-poule-à-lépée) | Épée |
| 10 | [Passivité P-rouge / P-noir](#10-passivité-p-rouge--p-noir--fleuret--sabre--épée) | Olympique |
| 11 | [Match de tableau + signature](#11-match-de-tableau-avec-signature) | Toutes |
| 12 | [Coupure Wi-Fi pendant le match](#12-coupure-wi-fi-pendant-le-match) | Toutes |
| 13 | [Tireurs inversés, daltonisme, changement d'arbitre](#13-tireurs-inversés-daltonisme-changement-darbitre) | Toutes |
| 14 | [Appel du DT](#14-appel-du-directoire-technique) | Toutes |
| 15 | [Fin de poule et signatures](#15-fin-de-poule-et-feuille-de-signatures) | Toutes |
| 16 | [Sabre Laser équipe (format arène)](#16-sabre-laser-équipe--format-arène) | Sabre Laser |

---

## 1. Match de poule simple — Sabre Laser

Poule, chrono 3:00, aucun carton.

| Étape | Action arbitre | Tablette | Score |
|---|---|---|---|
| 1 | Ouvre `/arene2/arbitre`, tap sur « DUPONT vs MARTIN » | Écran de match, scores « – », boutons grisés | – |
| 2 | Tap **▶️ Démarrer** | Chrono démarre, boutons actifs. Arène : « en cours » | 0 – 0 |
| 3 | Touche zone A pour ROUGE → **+1** rouge | Vibration courte | 1 – 0 |
| 4 | Touche zone C pour VERT → **+5** vert | | 1 – 5 |
| 5 | Halte : tap sur le chrono | Chrono en pause, bouton « Reprendre » | 1 – 5 |
| 6 | Tap chrono | Reprise | |
| 7 | Zone B ROUGE → **+3** rouge ×2 | | 7 – 5 |
| 8 | 00:00 | Vibration, « ⏰ Temps écoulé ! » | 7 – 5 |
| 9 | **🏁 Terminer** → **Confirmer** | « ✅ Match terminé et enregistré ! » | **7 – 5**, victoire ROUGE |
| 10 | — | Retour liste après 2 s. Poule mise à jour dans l'application. | |

---

## 2. Cartons blanc → jaune et rouge — Sabre Laser

Annonce des cartons **désactivée**.

| Étape | Action | Effet | Score |
|---|---|---|---|
| 1 | Match en cours | | 2 – 3 |
| 2 | **B** pour ROUGE | Carton blanc affiché. Aucun point. | 2 – 3 |
| 3 | **B** pour ROUGE (2ᵉ fois) | « ⚠️ 2ème blanc = Jaune automatique » → **jaune**, +3 VERT | 2 – 6 |
| 4 | **J** pour VERT | Jaune, +3 ROUGE | 5 – 6 |
| 5 | **J** pour VERT (2ᵉ jaune) | Converti en **rouge**, +5 ROUGE | 10 – 6 |
| 6 | **R** pour ROUGE | Rouge, +5 VERT | 10 – 11 |

Correction : appui long sur n'importe quel bouton carton du tireur → retrait du dernier
carton et des points accordés.

---

## 3. Cartons avec motif (annonce active) — Sabre Laser

Option **annonce des cartons** activée dans la saisie distante.

1. Tap **B** pour VERT → liste « Groupe 1 — Blanc → Jaune → Jaune → **Blanc** ».
2. Choix « Contre-attaque » → blanc pour VERT. Écran d'arène : annonce « Carton blanc —
   Contre-attaque ».
3. Plus tard, tap **B** pour VERT → titre « Groupe 1 … → **Jaune** » ; choix « Touche
   lourde » → jaune, +3 ROUGE. Annonce « revalorisation blanc → jaune ».
4. Tap **J** pour ROUGE → « Groupe 2 — … → Jaune » ; choix « Touche d'estoc » → jaune,
   +3 VERT.
5. Tap **R** pour ROUGE → « Groupe 3 — Rouge direct » ; choix « Comportement
   antisportif » → rouge, +5 VERT.
6. Tap **J**, puis **✕ Annuler — carton donné sans annonce** → jaune sans motif.

---

## 4. Égalité à temps → 30 s supplémentaires → tirage au sort — Sabre Laser

| Étape | Situation | Tablette | Score |
|---|---|---|---|
| 1 | 00:00, égalité | Bouton devient **⏱ Lancer 30s**. Arène : « en attente » | 6 – 6 |
| 2 | Tap **⏱ Lancer 30s** | Label « ⏱ 30s SUPPLEMENTAIRE », chrono 00:30 démarre. Toutes zones valides. | 6 – 6 |
| 3a | Touche VERT zone A | | 6 – 7 → **🏁 Terminer** |
| 3b | Aucune touche, 00:00 | « 🪙 Tirage au sort — animation en cours... » | 6 – 6 |
| 4 | — | Arène : animation pièce (≈ 4,5 s). Tablette : « Vainqueur : NOM (ROUGE) » | |
| 5 | Tap confirmer | « 🏆 NOM remporte le match (tirage au sort) ». Match enregistré 6 – 6 avec vainqueur imposé. | 6 – 6 V |

---

## 5. Mort subite Challenger (10-10) — Sabre Laser

| Étape | Action | Effet | Score |
|---|---|---|---|
| 1 | Match en cours | | 9 – 10 |
| 2 | **+1** ROUGE | Les deux ≥ 10 → « ⚡ MORT SUBITE – Zone C uniquement ! » | 10 – 10 |
| 3 | **+1** VERT | Refusé : « ⚡ Mort subite : Zone C uniquement ! » | 10 – 10 |
| 4 | **+5** VERT | Accepté | 10 – 15 → **🏁 Terminer** |

Variantes :
- Erreur à l'étape 2 → appui long **+1** ROUGE : score 9 – 10, mort subite levée.
- Temps écoulé en mort subite à égalité → **⏱ Lancer 30s** (zone C toujours seule
  valide), puis tirage au sort si égalité persiste.
- 10 – 10 atteint pendant les 30 s supplémentaires → état combiné « 30s + zone C ».
- Mode entraînement avec « mort subite désactivée » : aucun de ces mécanismes.

---

## 6. Sortie d'arène — Sabre Laser

| Étape | Action | Effet | Score |
|---|---|---|---|
| 1 | ROUGE sort de l'arène | | 4 – 4 |
| 2 | **🚪 Sortie rouge** | +3 VERT. Notification. Annonce à l'arène si active. Enregistré (`match_arena_exits`). | 4 – 7 |
| 3 | Erreur → **↩ Annuler** | Retour à l'état précédent | 4 – 4 |

Sortie *volontaire pour éviter une touche* = faute de groupe 2 → passer par **J** avec
motif « Sortie volontaire de l'arène pour éviter une touche ».

---

## 7. Erreur de saisie : corriger

| Erreur | Correction |
|---|---|
| Mauvais nombre de points | Appui long sur le même bouton (+1/+3/+5) du même tireur |
| Points au mauvais tireur | **↩ Annuler** puis bonne saisie |
| Carton en trop | Appui long sur un bouton carton du tireur |
| Plusieurs erreurs | **↩ Annuler** répété (10 niveaux) |
| Chrono faux | Pause, appui long sur le chrono (remise à la durée par défaut) |
| Mauvais match ouvert | Chrono arrêté → **← Retour** (match non démarré, rien d'enregistré) |
| Match terminé par erreur | Corriger le score dans l'application organisateur (poule ou tableau) |

---

## 8. Carton noir / exclusion

Prérequis : **carton noir activé** dans les paramètres de la compétition (boutons **N**
masqués sinon).

1. Faute grave de VERT → **N** côté VERT.
2. Fenêtre « ⬛ Carton Noir — NOM — Le combattant perd le combat et est exclu de la
   compétition. Le DT sera appelé automatiquement. »
3. **⬛ Confirmer l'élimination** :
   - match terminé, victoire ROUGE (score conservé) ;
   - tireur VERT → statut **Exclu**, motif « black_card » ;
   - icône 📣 active : appel DT envoyé à l'application ;
   - retour liste après 3 s.
4. Erreur ? Liste des matchs → section **Cartons noirs** → annuler : statut antérieur
   restauré.

---

## 9. Match de poule à l'épée

Arme `E` (idem fleuret `F`, sabre `S`) : libellé **Piste** au lieu d'Arène, seul **+1**
visible, **B** remplacé par **P**.

| Étape | Action | Effet | Score |
|---|---|---|---|
| 1 | **▶️ Démarrer** | | 0 – 0 |
| 2 | Coup double : **+1** ROUGE puis **+1** VERT | | 1 – 1 |
| 3 | **J** ROUGE | Avertissement, 0 point | 1 – 1 |
| 4 | **J** ROUGE (2ᵉ) | Converti en **rouge** : +1 VERT | 1 – 2 |
| 5 | **R** VERT | +1 ROUGE | 2 – 2 |
| 6 | **🚪 Sortie verte** | +1 ROUGE | 3 – 2 |
| 7 | **+1** VERT, 00:00 | Égalité → **⏱ Lancer 1 min** | 3 – 3 |
| 8 | Tap → 1 min, label « ⏱ 1 MIN SUPPLÉMENTAIRE » | Fin à égalité → tirage au sort | |

---

## 10. Passivité P-rouge / P-noir — fleuret / sabre / épée

| Étape | Action | Effet | Score |
|---|---|---|---|
| 1 | Non-combativité | | 2 – 1 |
| 2 | **P** (un côté suffit) | **P-rouge aux deux tireurs**, +1 chacun | 3 – 2 |
| 3 | Nouvelle passivité, **P** | **P-noir** aux deux, combat terminé | 3 – 2 |
| 4 | — | Vainqueur = meilleur score → ROUGE | 3 – 2 V |

Égalité au P-noir : vainqueur = **mieux classé au départ** ; sans classement ou classements
égaux → **tirage au sort**. Appui long sur **P** : retrait du dernier carton de passivité
(et des points du P-rouge). Les cartons P n'entrent pas dans le cumul jaune/rouge.

---

## 11. Match de tableau avec signature

Option **Signature des matchs de tableau** (`signTableauMatches`) active.

1. Le match de tableau est envoyé sur l'arène par l'application (ou choisi dans la liste).
2. Chrono = `defaultTableTimerSeconds`.
3. **🏁 Terminer** → **Confirmer**.
4. Écran **✍️ Signature des combattants**, rappel du score. Chaque tireur signe dans sa
   zone (Effacer possible).
5. **Valider** → signatures enregistrées (`de_match_signatures`), consultables dans
   l'application (Tableau → Signatures).
6. Le vainqueur avance dans le tableau ; le match suivant apparaît dans la liste.

---

## 12. Coupure Wi-Fi pendant le match

| Étape | Situation | Tablette |
|---|---|---|
| 1 | Wi-Fi coupé | Point rouge « Déconnecté », badge **📴 0** |
| 2 | Arbitre continue (touches, chrono) | Saisie locale normale. Chaque sauvegarde échouée → file hors-ligne, **📴 N** |
| 3 | Wi-Fi revient | Reconnexion automatique, **⟳ Sync...**, file rejouée, badge disparaît |
| 4 | **🏁 Terminer** | Doit être fait **en ligne** : en cas d'échec « Erreur d'enregistrement », réessayer après reconnexion |

Rechargement de la page pendant la coupure : le Service Worker sert la page en cache.

---

## 13. Tireurs inversés, daltonisme, changement d'arbitre

- Tireurs côté opposé à l'affichage → **⇄** : couleurs et noms échangés, chaque bouton
  reste sous le tireur qu'il concerne. Le score enregistré reste correct.
- Arbitre daltonien → **👁** : vert affiché en bleu. Mémorisé sur la tablette.
- Remplacement d'arbitre (gestion des arbitres activée) → **Changer** dans la barre
  arbitre → choix dans la liste des arbitres pointés. Mis à jour en base et dans
  l'application.

---

## 14. Appel du Directoire Technique

1. Litige → tap **📣** : icône active, « DT appelé ».
2. Application organisateur : notification « Appel DT — Arène N ».
3. Le DT acquitte depuis l'application → icône passe à l'état « acquitté ».
4. Appel inutile → appui long **📣** : « ❌ Appel DT annulé ».

Le carton noir déclenche l'appel DT automatiquement.

---

## 15. Fin de poule et feuille de signatures

1. Dernier match de la poule confirmé.
2. Overlay **POULE TERMINÉE — Tous les matchs sont terminés**.
3. **✍️ SIGNATURE** → `/arene{N}/poule` : feuille de poule (onglet *Tableau*), puis chaque
   tireur touche son nom et signe.
4. Signatures stockées (`pool_signatures`) et visibles dans l'application.
5. **📋 JOURNAL** → historique complet des matchs de l'arène.

---

## 16. Sabre Laser équipe — format arène

Compétition équipe, `teamFormat = 'laser-arena'`. Tablette : `/equipe{N}/arbitre`.

1. L'application assigne une rencontre à l'arène. Tablette : « Assaut 1/9 », équipes et
   combattants du relais.
2. **▶ Démarrer** le chrono (3:00).
3. Touches saisies par zone pour chaque équipe. Plafond affiché : « 5 touches · 3:00 ».
4. 5 touches cumulées (les deux côtés) ou 3 min → bouton **Relais suivant →** mis en
   évidence → assaut suivant.
5. **↩ Réinitialiser l'assaut** en cas d'erreur.
6. Cartons d'équipe « E » (retard de désignation) : traçabilité, pas d'impact sur le score.
7. Score de rencontre = total des points sur les 9 assauts.

Détails du format : [TEAM_COMPETITIONS.md](TEAM_COMPETITIONS.md).
