# Saisie distante — démarrage express

> Version 1.0.3 build #1365. Guide complet : [REMOTE_SCORE_GUIDE.md](REMOTE_SCORE_GUIDE.md).

## Organisateur (2 minutes)

1. Poste et tablettes sur le même Wi-Fi (QR Wi-Fi : **🔧 Outils → 📶 QR Code WiFi**).
2. Compétition → onglet **📡 Saisie distante**.
3. Régler **Pistes**, garder **🔒 HTTPS** coché, **Démarrer la saisie distante**.
4. Optionnel : mot de passe par arène (≥ 8 caractères) ou **MDP commun**.
5. Afficher le **QR code** « Arbitre » de chaque arène, le faire scanner.
6. Sur la TV de chaque arène : ouvrir `/arene{N}` (QR « Affichage piste »).

## Arbitre (30 secondes)

1. Scanner le QR code → accepter le certificat → mot de passe si demandé.
2. Toucher le match dans la liste.
3. **▶️ Démarrer** → saisir les touches (**+1 / +3 / +5**), cartons (**B J R N** ou **P**).
4. **🏁 Terminer** → **Confirmer**. Match suivant.

| Geste | Effet |
|---|---|
| Tap +1/+3/+5 | Ajoute des points |
| Appui long +1/+3/+5 | Retire des points |
| Appui long carton | Retire le dernier carton |
| Tap chrono | Pause / reprise |
| Appui long chrono | Remise à zéro |
| ↩ Annuler | Annule la dernière action (×10) |
| ⇄ | Inverse rouge/vert |
| 📣 | Appel DT (appui long = annuler) |

Détails : [docs/ARBITRAGE.md](docs/ARBITRAGE.md) · cas concrets :
[docs/SCENARIOS_MATCH.md](docs/SCENARIOS_MATCH.md).

## URLs

```
https://<IP>:8066/arene1/arbitre   tablette arbitre, arène 1
https://<IP>:8066/arene1           écran d'arène 1
https://<IP>:8066/arene1/public    spectateurs
https://<IP>:8066/arene1/poule     feuille de poule + signatures
https://<IP>:8066/kiosk            affichage public général
https://<IP>:8066/appel            pointage
```
