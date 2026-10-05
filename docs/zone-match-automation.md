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
      "arena": "CTFDL NSS-KEVI",              // open exactly this arena name; AWAY first; always <= 15 chars
      "title": "Week 1 · NSS vs KEVI", "league_slug": "ctfdl", "season_number": 5, "week": 1, "stage": "regular",
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

A league fixture whose time the captains haven't agreed yet ("Time TBD" on the schedule) is
**never in the queue**: it has no kick-off time. It appears once staff set its time.

## Which game is the match

The arena saves stats for every game it runs: a warm-up before kick-off, a restart, the match,
anything after. The site links and scores exactly one of them: **the first game reported
`played` that has a winner and started at kick-off.**

- A game with **no winner** (restarted or abandoned before a team held the flags) is refused,
  and the match goes back to waiting. Keep not reporting these.
- A game that **started more than 10 minutes before the scheduled time** is a warm-up and is
  refused the same way, even if it ended with a winner. This matters with the countdown: when
  `*timer` reaches zero it ends whatever warm-up game is running.
- Once a result is recorded the match is closed; later games in the arena are ignored.

If you can, don't save stats at all for a game the timer ends at kick-off: otherwise the
warm-up lands in `player_stats` as a league-mode game and counts toward league stats.

## Free-scheduled (FS) matches

Accepted FS matches are in the queue like any other league match (`stage: "fs"`); a proposal
the other captain hasn't accepted is not. Each carries `fs_color`: `"red"` (a normal match) or
`"green"`. In a **Green** match only the captain and round 4+ draft picks may play. The site
enforces it in the lineup and the sub form, and `client.players` never lists an ineligible
player as a starter, so placing the desired state is enough. Do **not** let anyone outside
`client.players`' starters unspec (the arena is locked anyway). If a round 1–3 pick does play,
the site scores the match as Red when the result comes in. Tag the game's mode with the league
as usual (`CTFDL`); the colour is the site's business.

## Switches (site side, nothing to do on the zone)

- **Site-wide:** CTF management → Season → *Zone automation*. Off returns an **empty queue**
  (`"automation": "off"`, `"matches": []`), so the zone opens nothing, places nobody and applies
  no subs until it is turned back on. Treat an empty queue as "nothing to do", never as an error.
- **Per match:** staff can mark one match *Run by hand* on its match page. That match is simply
  left out of the queue; the others carry on. If a match you were running disappears from the
  queue, stop reconciling it (and close its arena if empty), exactly as for a cancelled match.

## Match timer (`*timer`)

When you open the arena, start the arena's countdown so the game starts itself at kick-off:
the equivalent of `*timer <starts_in_min>` (`arena.setTicker(1, arena.playtimeTickerIdx,
minutes * 6000, "Time Remaining: ", () => arena.gameEnd())`, which is what `*timer` does).
At zero the game ends/resets and the script starts the match with the placed players.

- `starts_in_min` is in every poll; set the timer from it when the arena is opened.
- **Staff can extend:** if `scheduled_at` moves (staff changed the time on the site), set the
  timer again from the new `starts_in_min`. A mod can also type `*timer N` in the arena; don't
  fight that — only reset the timer when `scheduled_at` actually changed since you last set it.
- Once the game has started (`status: in_progress`), leave the timer alone.

## Spectators (`*allowspec`)

A league match is open to watch: nobody playing in it may switch spectating of themself off.
Apply the equivalent of the mod command `*allowspec` to every match arena the zone opens,
together with the lock and spec quiet. Requested by league staff on 2026-10-05; not yet confirmed
as implemented.

- **Every league match**, no flag from the site: RS, FS and playoffs alike. If a league ever
  needs it off, the site can add an on/off field to the queue; until then, always on.
- **If the setting is per player** rather than per arena, set it when each player is placed and
  again in the reconcile step, so a sub who comes in or a player who rejoins is covered too.
- **It has to survive restarts** inside the arena (warm-ups, `*restart`, the timer starting the game).
- **Run by hand** matches are not touched by the zone, so the referee types `*allowspec`
  themself, as with `*lock`, `*specquiet` and `*timer`.
- The field or call behind `*allowspec` is not written down here yet: fill it in under
  "Server calls used" once it is in.

`client.players` is the **desired state**: every listed player, the team they
belong on, and whether they sit in spec. It already reflects subs. Players
not listed are not part of the match.

## Naming

- Arena: `"<LEAGUE> <AWAY TAG>-<HOME TAG>"`, e.g. `CTFDL NSS-KEVI`, away first. **Never more
  than 15 characters**: the client's arena-join packet holds the name in a 16-byte field
  (`CS_ArenaJoin` reads `ReadString(16)`), so a longer name is cut off when a player clicks it
  and the server opens a second arena under the cut name (first live test, 2026-09-27:
  "CTFDL: TSTB vs TSTA" put everyone into "CTFDL: TSTB vs"). The site trims tags to fit, so
  just open the `arena` value as given. Home is `matches.squad_a`. Use the `home` / `away`
  fields rather than parsing the name.
- Teams: `<TAG> T` and `<TAG> C` for each squad (the zone already builds these
  from the squads). The home captain picks Titan or Collective; the site puts
  home starters on that letter and away starters on the other. Read
  `team_starting` / `team_bench` per squad rather than deriving it.

## First live test (2026-09-27) — what we learned

Soup, Kev and anjro ran a test match ("CTFDL TSTB-TSTA"). Queue polling, arena open, lock,
spec quiet, placement, subs and both game reports all worked once these were sorted:

1. **Arena names ≤ 15 chars** (site fixed; see Naming). The old 19-char name made every click
   join a second, cut-off arena.
2. **Place players through the normal team-join path.** Players moved onto teams by the zone
   were on the team but the game script didn't count them ("Not enough players"); the game only
   started after someone unlocked, re-specced and rejoined by hand. Use whatever the script
   hooks (the same path as a player picking a team), not a raw team assignment. *(zone)*
3. **Report `played` only for a game with a winner.** A no-winner game is aborted and will be
   replayed; the zone already does this. After a `played` report the site now ignores further
   `in_progress` reports for that match, so the arena auto-starting its next game can't take it
   over. *(site fixed)*
4. **Tag league-match games as league, not `Pub`.** Every test game landed in `player_stats`
   with `game_mode: "Pub"`, so a real match would count toward pub stats and pub ELO. Give
   games in a match arena their league mode (e.g. `"CTFDL"`). *(zone)*
5. `updated_at` now also moves at the side release (see Reconcile). *(site fixed)*

## What to do, by time

| When | Do |
|---|---|
| `starts_in_min <= 30` | Open the arena if it isn't open: `_arena._server.newArena(arena, true)` (public named arena; `ZoneServer.newArena` in the server source). Set `arena._specQuiet = true` and `arena._bLocked = true` (the flags behind `*specquiet` / `*lock`). Apply `*allowspec` so nobody in the match can block spectators (see Spectators). Start the countdown: `*timer <starts_in_min>` (see Match timer). Make sure the four `client.teams` exist. |
| `side_released == true` and `client.ready` | Place everyone: for each `client.players` entry, if `spec` is false → `player.unspec(getTeamByName(team))`; if `spec` is true → `player.spec(team)` (spec'd, sitting on the bench team name). Anyone in the arena who is not in the list → spec. |
| every poll while `status` is scheduled/in_progress | **Reconcile**: compare each player's actual team/spec against the desired state and move only those that differ. That is what makes subs work: the site swaps the two rows and `updated_at` bumps. `updated_at` also bumps at the side release, so a zone that skips unchanged matches still gets the placement moment. If you cache, key the skip on `updated_at` **and** `side_released`, and never skip a match whose arena you haven't finished setting up (lock / spec quiet / allowspec / teams). |
| a player enters the arena | Place them per the desired state at once (or on the next poll). Not in the list → spec. |
| the game starts | `POST /api/matches/<id>/game` `{ "game_id": "<the zone's game id>", "status": "in_progress" }` with the key. Marks the match live. |
| the game ends | `POST /api/matches/<id>/game` `{ "game_id": "…", "status": "played" }`. The site links the game's stats to the match and **records the result itself**: the winning team from the stat rows, the win type (regulation / OT / 2OT) from the game length under the season's rules, standings rebuilt. The reply's `result.recorded` says whether it worked; if the stat rows haven't landed yet (`reason: "no stat rows for this game yet"`), call again a minute later. Staff can remove a wrong result in the match manager and re-enter it. |
| the match leaves the queue (completed/cancelled/deleted) | Unlock, stop reconciling, and **close the arena yourself if it's empty** (`arena.close()`). The server only closes an arena when a player *leaves* it empty, so an arena nobody ever entered stays in the list until a restart (seen after the first test: the 19-char "CTFDL: TSTB vs TSTA" sat at 0 players). If players are still inside, it closes when the last one leaves. |

An arena closes when its last player leaves (Arena `TotalPlayerCount == 0`), so
if a ref opens it early and leaves, just re-open it on the next poll.

## Subs

Captains, co-captains, league staff and referees can sub on the match page from
side release until the result is recorded. A sub swaps one starter with one
bench (or roster) player; the site logs who did it. Placement needs no special
handling beyond reconciling the desired state.

**Announce subs by name.** Each entry in the queue's `subs` array carries `id`, `squad_tag`,
`team` (that squad's playing team, e.g. `TSTA T`), `out_alias`, `in_alias`, `by_alias`,
`created_at` and a ready-made `message`:

```jsonc
{ "id": "…", "squad_tag": "TSTA", "team": "TSTA T", "out_alias": "anjro", "in_alias": "Soup",
  "by_alias": "Soup", "created_at": "…", "message": "[TSTA] Sub: anjro out, Soup in" }
```

Keep the ids you've already announced per match; for each new one, send `message` to the
arena instead of a generic "Lineup updated from freeinf.org (1 player moved)".

## Server calls used

All public in the Infantry server source (`dotnetcore/Server/Game`):

- `ZoneServer.newArena(string name, bool namedArena)` — create; scripts reach it via `_arena._server`.
- `Arena._bLocked` (spec lock), `Arena._specQuiet` — public fields.
- Whatever `*allowspec` sets (field name to be confirmed on the zone side; see Spectators).
- `Player.unspec(Team)`, `Player.spec(string teamName)`, `Arena.getTeamByName(string)`.

The existing OvD automation's poll loop and the dueling connector's HTTP
client are the patterns to copy.
