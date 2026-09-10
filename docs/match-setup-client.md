# Match setup → game client

The site records, per scheduled match, which side the home team picked and
both teams' starting lineup and bench. The game client (or the zone server)
reads one JSON document per match and places players accordingly.

Sides and lineups are **private** on the site: a squad's captain and
co-captains see only their own lineup, the home team's leads see the side,
and staff see everything. The public sees only whether things have been
submitted. The home side is **released to everyone five minutes before the
scheduled time** (`side_reveal_at` / `side_released` in the response);
lineups are never public. The game client gets the full view at any time by
presenting a shared key.

## Key

Staff set the key in CTF management → Season → **Game client key**
(stored as `MATCH_CLIENT_KEY`). The client sends it on every request:

```
GET https://www.freeinf.org/api/matches/<match-id>/setup
X-Client-Key: <the key>
```

Without the header (or with a wrong key) the response is the public view:
progress flags only, no side, no names.

`Cache-Control: no-store`, so poll freely (every 10–30 s around match time
is fine). Match ids come from the schedule:
`GET /api/league/schedule?league=ctfdl&season=5` lists fixtures with their
`id` and `scheduled_at`.

## Naming rule

Home team = the first-listed team of the fixture. The home captain picks
**Titan** or **Collective**; the away team gets the other side.

Each squad gets two in-game teams named from its tag: `<TAG> T` and `<TAG> C`.
Starters go on the team matching their side, unspecced. The bench sits in
spec on the squad's other team name.

Example, KEVI home picking Titan:

| Squad | Side | Starters on | Bench (spec) on |
|-------|------|-------------|-----------------|
| KEVI  | Titan | `KEVI T` | `KEVI C` |
| NSS   | Collective | `NSS C` | `NSS T` |

## Response (with the key)

```jsonc
{
  "match": { "id": "…", "scheduled_at": "2026-10-03T00:00:00Z", "status": "scheduled", "league_slug": "ctfdl", "season_number": 5, "week": 1, "stage": "regular", "locked": false },
  "home": {
    "squad_id": "…", "name": "Kev's Squad", "tag": "KEVI", "side": "titan",
    "team_starting": "KEVI T", "team_bench": "KEVI C",
    "roster": [ { "player_id": "…", "alias": "Kev", "role": "captain" } ],
    "lineup": { "starting": [ { "player_id": "…", "alias": "Kev", "position": 0 } ], "bench": [ … ] }
  },
  "away": { "…same shape…", "side": "collective", "team_starting": "NSS C", "team_bench": "NSS T" },
  "progress": { "side_picked": true, "home_lineup_set": true, "away_lineup_set": true, "ready": true },
  "client": {
    "ready": true,                                    // side picked and both starting lineups non-empty
    "teams": [ "KEVI T", "KEVI C", "NSS C", "NSS T" ], // create these four teams
    "players": [
      { "alias": "Kev",  "player_id": "…", "squad_tag": "KEVI", "team": "KEVI T", "spec": false, "slot": "starting" },
      { "alias": "Soup", "player_id": "…", "squad_tag": "KEVI", "team": "KEVI C", "spec": true,  "slot": "bench" },
      { "alias": "Thiz", "player_id": "…", "squad_tag": "NSS",  "team": "NSS C",  "spec": false, "slot": "starting" }
    ]
  }
}
```

The `client` block is all the game side needs: create the four teams, then
for each player put them on `team` and spec them if `spec` is true. Players
not listed are not part of the match. `alias` is the site's in-game alias,
which is the name the zone sees.

`client.teams` is empty and `side` is `null` until the home captain has
picked. `match.locked` turns true at the scheduled time (or when the match
is completed/cancelled); after that only staff can change the setup, so the
client can treat a locked document as final.

## Public response (no key)

```jsonc
{
  "match": { … },
  "home": { "squad_id": "…", "name": "…", "tag": "KEVI", "side": null, "team_starting": null, "team_bench": null, "roster": [ … ], "lineup": null },
  "away": { … },
  "progress": { "side_picked": true, "home_lineup_set": true, "away_lineup_set": false, "ready": false },
  "client": null
}
```

## Writing (site only)

`POST` to the same URL with a signed-in user's Bearer token:

- `{ "action": "set_side", "side": "titan" | "collective" | null }` — home captain/co-captain, or staff
- `{ "action": "set_lineup", "squad_id": "…", "starting": [player_id…], "bench": [player_id…] }` — that squad's captain/co-captain, or staff
- `{ "action": "swap_home" }` — staff; the other team becomes home and the side is cleared

Schema: `add-match-setup.sql` (`match_setup` and `match_lineups`, both RLS
with no policies, so the browser can never read them directly).
