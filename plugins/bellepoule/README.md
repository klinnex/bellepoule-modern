# Plugin Claude Code « bellepoule »

Interroger et, sur autorisation, piloter BellePoule Modern en langage naturel (#1880), par le
serveur MCP intégré à l'application (local, `127.0.0.1`). Référence des outils : [docs/MCP.md](../../docs/MCP.md).

## Installation

1. BellePoule Modern : **Paramètres → Système → Agent IA (MCP)** → activer (et « Autoriser
   l'écriture » pour préparer ou conduire une épreuve), puis « Copier la configuration ».
   Sans écran : `bellepoule-modern --mcp-print-config` affiche l'URL et le jeton ;
   `bellepoule-modern --headless --mcp [--mcp-write]` démarre le serveur.
2. Dans Claude Code :

   ```
   /plugin install bellepoule --marketplace BellePoule-Modern/bellepoule-modern
   /plugin configure bellepoule
   ```

   `/plugin configure` demande le jeton (rangé dans le stockage sécurisé du système) et le port
   (8067 par défaut). Puis `/reload-plugins`. Après « Nouveau jeton », recommencer
   `/plugin configure bellepoule`.

   Depuis un clone du dépôt : `claude --plugin-dir plugins/bellepoule`.

3. Repli : sans valeur dans `/plugin configure`, le plugin lit les variables d'environnement
   `BELLEPOULE_MCP_TOKEN` et `BELLEPOULE_MCP_PORT` (défaut 8067). Elles doivent être visibles du
   process Claude Code : exportées dans le fichier du shell qui le lance (`~/.bashrc`,
   `~/.zshrc`…). Lancé depuis VS Code ou un lanceur graphique, ce fichier n'est souvent pas lu :
   préférer `/plugin configure`.

## Contenu

| Élément | Rôle |
|---|---|
| `.mcp.json` | Serveur `bellepoule` (HTTP local) : jeton et port de `/plugin configure`, sinon `BELLEPOULE_MCP_TOKEN` / `BELLEPOULE_MCP_PORT` |
| `skills/bellepoule` | Vocabulaire de l'escrime, déroulés types, garde-fous |
| `/bp-etat [journée]` | État de la salle : retards, conflits, pistes libres (lecture seule) |
| `/bp-journee <dossier>` | Préparer une journée depuis un dossier de fichiers |
| `/bp-epreuve <épreuve>` | Conduire une épreuve : pointage, poules, scores, tableau, résultats |
