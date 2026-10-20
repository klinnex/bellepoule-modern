# Événements Socket.IO

> ⚠️ Fichier **généré** par `npm run docs:socket` (`scripts/generate-socket-doc.js`).
> Ne pas éditer à la main. La CI échoue (`npm run check:socket-doc`) s'il n'est
> pas régénéré après ajout / suppression d'un événement.

Serveur : `src/main/remoteScoreServer.ts` (Express 5 + Socket.IO, port 8066).
Clients : pages `src/remote/*.html`. `{…}` = segment dynamique (n° d'arène, de poule…).
Guide fonctionnel : [ARBITRAGE.md](ARBITRAGE.md), [REMOTE_SCORE_GUIDE.md](../REMOTE_SCORE_GUIDE.md).

## Client → serveur

| Événement | Écouté par le serveur | Émis par |
|---|:---:|---|
| `arena_control` | ✓ | `arena.html`, `referee.html` |
| `client:battery` | ✓ | `referee.html` |
| `client:pong` | ✓ | `arena.html`, `kiosk.html`, `lobby.html`, `public.html`, `referee.html` |
| `client:register` | ✓ | `arena.html`, `kiosk.html`, `lobby.html`, `public.html`, `referee.html` |
| `dashboard:subscribe` | ✓ | `dashboard.html` |
| `join_arena` | ✓ | `arena.html`, `overlay.html`, `public.html`, `referee.html` |
| `join_pool` | ✓ | `pool.html` |
| `join_team_arena` | ✓ | `teamArena.html`, `teamReferee.html` |
| `team_advance_bout` | ✓ | `teamReferee.html` |
| `team_card` | ✓ | `teamReferee.html` |
| `team_fencer_card` | ✓ | `teamReferee.html` |
| `team_reset_bout` | ✓ | `teamReferee.html` |
| `team_timer_pause` | ✓ | `teamReferee.html` |
| `team_timer_start` | ✓ | `teamReferee.html` |
| `team_touch` | ✓ | `teamReferee.html` |

### Actions `arena_control`

Champ `action` de l'événement `arena_control` (`handleArenaControl`) :
`add_card`, `arena_exit`, `card_announcement`, `change_referee`, `coin_flip`, `dt_call`, `dt_cancel`, `exit_announcement`, `finish`, `next`, `pause`, `pause_timer`, `reset_scores`, `reset_timer`, `select_match`, `start`, `toggle_swap`, `update_score`, `update_timer`, `waiting_overtime`.

## Serveur → client

| Événement | Émis par le serveur | Écouté par |
|---|:---:|---|
| `arena:{…}:card_announcement` | ✓ | `arena.html`, `public.html` |
| `arena:{…}:coin_flip` | ✓ | `arena.html`, `public.html` |
| `arena:{…}:dt_call_ack` | ✓ | `referee.html` |
| `arena:{…}:exit_announcement` | ✓ | `arena.html` |
| `arena:{…}:replay` | ✓ | `overlay.html` |
| `arena:{…}:score_limit_reached` | ✓ | `referee.html` |
| `arena:{…}:sign_request` | ✓ | `referee.html` |
| `arena:{…}:update` | ✓ | `arena.html`, `overlay.html`, `public.html`, `referee.html` |
| `arenas:updated` | ✓ | — |
| `auth_error` | ✓ | `referee.html`, `teamReferee.html` |
| `bracket:update` | ✓ | `kiosk.html` |
| `eta:update` | ✓ | `dashboard.html` |
| `kiosk:data` | ✓ | `kiosk.html` |
| `kiosk:note` | ✓ | — |
| `logo:update` | ✓ | `kiosk.html` |
| `match:finished` | ✓ | — |
| `match:reset` | ✓ | — |
| `matches:update` | ✓ | `dashboard.html` |
| `pool:{…}:update` | ✓ | `pool.html` |
| `pools:update` | ✓ | `dashboard.html` |
| `rankings:update` | ✓ | `dashboard.html` |
| `server:command` | ✓ | `arena.html`, `kiosk.html`, `lobby.html`, `pool.html`, `public.html`, `referee.html` |
| `team_arena_state` | ✓ | `teamArena.html`, `teamReferee.html` |
| `tts:update` | ✓ | `referee.html` |
| `wallpaper:update` | ✓ | `arena.html` |

✗ dans « Émis par le serveur » : écouté par une page mais jamais émis tel quel
(nom construit autrement, ou événement mort côté page).
