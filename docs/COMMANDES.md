# Palette de commandes (Ctrl+K)

`Ctrl+K` (`⌘K` sur macOS) ouvre la palette. Sans `/` : recherche de compétitions et d'actions.
Avec `/` en tête : commandes.

- `↑` `↓` : choisir une suggestion
- `Tab` : compléter la commande sélectionnée
- `↵` : exécuter (si un argument manque, la commande est complétée et attend l'argument)
- `Esc` : fermer

Le résultat s'affiche dans une notification (toast). Liste aussi visible dans l'aide `?` → onglet **Commandes** (ou `/help`).

## Mises à jour

| Commande | Effet |
|---|---|
| `/update` | Recherche une mise à jour ; si disponible, réaffiche la bannière |
| `/update quiet` | Mode silencieux : plus de notification visuelle de mise à jour |
| `/update quiet off` | Réactive les notifications de mise à jour |
| `/update install` | Télécharge, vérifie (SHA-256) puis lance l'installation |
| `/update channel <stable\|dev>` | Canal : releases stables ou pré-releases dev |
| `/update auto <on\|off>` | Vérification automatique au démarrage |

## Saisie distante (compétition ouverte)

| Commande | Effet |
|---|---|
| `/remote start` | Ouvre la phase « Saisie distante » et démarre serveur + session (paramètres du panneau : port, interface, HTTPS) |
| `/remote stop` | Arrête la saisie distante |
| `/remote status` | Indique si le serveur tourne et son URL |
| `/remote url` | Copie l'URL du serveur dans le presse-papiers |

## Navigation

| Commande | Effet |
|---|---|
| `/phase <nom>` | Va à une phase : `checkin`, `poolprep`, `pools`, `quest`, `ranking`, `tableau`, `results`, `remote`, `logs`, `referees` |
| `/open <nom>` | Ouvre la première compétition dont le titre contient `<nom>` |
| `/new` | Nouvelle compétition |
| `/training` | Mode entraînement |
| `/wifi` | QR code Wi-Fi |

## Interface

| Commande | Effet |
|---|---|
| `/theme <light\|dark\|default>` | Thème |
| `/lang <code>` | Langue : `fr`, `en`, `br`, `ca`, `de`, `es`, `pt`, `it`, `ru`, `zh-HK` |
| `/settings` | Paramètres |
| `/wiki` | Documentation intégrée |
| `/help`, `/shortcuts` | Aide raccourcis + commandes |
| `/report` | Signaler un problème |
| `/about` | À propos |

## Développeurs

- Registre, analyse, exécution : `src/renderer/services/slashCommands.ts` (`SLASH_COMMANDS`, `executeSlashCommand`)
- Ajouter une commande : entrée dans `SLASH_COMMANDS` + `case` dans `executeSlashCommand` + clé `slashCommands.*` dans les 10 locales + ligne dans ce fichier. L'aide `?` se met à jour seule.
- `/remote start|stop` : événement fenêtre `bp:remote-command` écouté par `RemoteScoreManager` (`useRemoteCommand`)
- Tests : `slashCommands.test.ts`, `CommandPalette.test.tsx`
