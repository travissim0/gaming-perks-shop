# Zone match automation — spec for the CTF zone script

What the zone script needs to do so that a scheduled league match runs itself:
open the arena, lock it, place both lineups, apply subs, and report the game.
The site side is done; this page is the contract.

## The one call to poll

```
GET https://www.freeinf.org/api/matches/zone-queue?league=ctfdl&hours=6&past=2
X-Client-Key: <MATCH_CLIENT_KEY>
```

The key is set by staff in CTF management → Season → **Game client key** and
never travels through chat. Poll every 30–60 s. `Cache-Control: no-store`.

Response:

```jsonc
{
  "generated_at": "2026-10-04T23:10:00Z",
  "window_hours": 6,
  "matches": [
    {
      "id": "…",                              // match id, used by the report call below
      "arena": "CTFDL - KEVI vs NSS",         // open exactly this arena name; home first
      "title": "KEVI vs NSS", "league_slug": "ctfdl", "season_number": 5, "week": 1, "stage": "regular",
      "status": "scheduled",                  // scheduled | in_progress
      "scheduled_at": "2026-10-05T00:00:00Z",
      "side_reveal_at": "2026-10-04T23:55:00Z",
      "side_released": false,
      "starts_in_min": 50,                    // negative once it has started
      "home": { "squad_id": "…", "tag": "KEVI", "name": "Kev's Squad", "side": "titan", "team_starting": "KEVI T", "team_bench": "KEVI C" },
      "away": { "squad_id": "…", "tag": "NSS",  "name": "…",           "side": "collective", "team_starting": "NSS C", "team_bench": "NSS T" },
      "progress": { "side_picked": true, "home_lineup_set": true, "away_lineup_set": true, "ready": true },
      "client": {
        "ready": true,
        "teams": [ "KEVI T", "KEVI C", "NSS C", "NSS T" ],
        "players": [
          { "alias": "Kev",  "player_id": "…", "squad_tag": "KEVI", "team": "KEVI T", "spec": false, "slot": "starting" },
          { "alias": "Soup", "player_id": "…", "squad_tag": "KEVI", "team": "KEVI C", "spec": true,  "slot": "bench" },
          { "alias": "Thiz", "player_id": "…", "squad_tag": "NSS",  "team": "NSS C",  "spec": false, "slot": "starting" }
        ]
      },
      "subs": [ { "out_alias": "Soup", "in_alias": "Kev", "by_alias": "Zmn", "created_at": "…" } ],
      "updated_at": "2026-10-04T23:58:12Z",   // bumps on any side/lineup/sub change
      "game_id": null                         // set once the zone has reported it
    }
  ]
}
```

`client.players` is the **desired state**: every listed player, the team they
belong on, and whether they sit in spec. It already reflects subs. Players
not listed are not part of the match.

## Naming

- Arena: `"<LEAGUE> - <HOME TAG> vs <AWAY TAG>"`, e.g. `CTFDL - KEVI vs NSS`.
  Home is `matches.squad_a`; tags are the squad's tag, upper-cased, first 8 chars.
- Teams: `<TAG> T` and `<TAG> C` for each squad (the zone already builds these
  from the squads). The home captain picks Titan or Collective; the site puts
  home starters on that letter and away starters on the other. Read
  `team_starting` / `team_bench` per squad rather than deriving it.

## What to do, by time

| When | Do |
|---|---|
| `starts_in_min <= 30` | Open the arena if it isn't open: `_arena._server.newArena(arena, true)` (public named arena; `ZoneServer.newArena` in the server source). Set `arena._specQuiet = true` and `arena._bLocked = true` (the flags behind `*specquiet` / `*lock`). Make sure the four `client.teams` exist. |
| `side_released == true` and `client.ready` | Place everyone: for each `client.players` entry, if `spec` is false → `player.unspec(getTeamByName(team))`; if `spec` is true → `player.spec(team)` (spec'd, sitting on the bench team name). Anyone in the arena who is not in the list → spec. |
| every poll while `status` is scheduled/in_progress | **Reconcile**: compare each player's actual team/spec against the desired state and move only those that differ. That is what makes subs work: the site swaps the two rows and `updated_at` bumps. Skip the match entirely when `updated_at` hasn't changed since the last pass. |
| a player enters the arena | Place them per the desired state at once (or on the next poll). Not in the list → spec. |
| the game starts | `POST /api/matches/<id>/game` `{ "game_id": "<the zone's game id>", "status": "in_progress" }` with the key. Marks the match live. |
| the game ends | `POST /api/matches/<id>/game` `{ "game_id": "…", "status": "played" }`. Links the game's stats to the match; staff still record the score in the match manager. |
| the match leaves the queue (completed/cancelled) | Unlock, stop reconciling. Empty named arenas close themselves when the last player leaves. |

An arena closes when its last player leaves (Arena `TotalPlayerCount == 0`), so
if a ref opens it early and leaves, just re-open it on the next poll.

## Subs

Captains, co-captains, league staff and referees can sub on the match page from
side release until the result is recorded. A sub swaps one starter with one
bench (or roster) player; the site logs who did it. The zone needs no special
handling beyond reconciling the desired state.

## Server calls used

All public in the Infantry server source (`dotnetcore/Server/Game`):

- `ZoneServer.newArena(string name, bool namedArena)` — create; scripts reach it via `_arena._server`.
- `Arena._bLocked` (spec lock), `Arena._specQuiet` — public fields.
- `Player.unspec(Team)`, `Player.spec(string teamName)`, `Arena.getTeamByName(string)`.

The existing OvD automation's poll loop and the dueling connector's HTTP
client are the patterns to copy.
