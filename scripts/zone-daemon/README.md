# Multi-server zone control daemon

Lets the website's **Admin → Zones** page start / stop / restart / **rebuild**
Infantry zones that live across several Linux game servers, even though zones
move between servers over time.

## How it works

```
 Admin UI  ──POST──>  zone_commands (Supabase)  <──poll──  zone-daemon (Server A)
 (browser)                                       <──poll──  zone-daemon (Server B)
    ^                  zone_status  (Supabase)   ──upsert──    (each server reports
    └────────GET───────────┘                                    the zones it owns)
```

* The web app **never** SSHes or runs anything. It only inserts rows into
  `zone_commands` and reads `zone_status`. Firewall-friendly, no inbound access
  to the game servers needed.
* Each game server runs **one** `zone-daemon.sh` with its own `zone-daemon.conf`
  (server key + zone base dir + tag→folder map + Supabase creds).
* Every poll the daemon (a) upserts its `zone_status` row (keyed by `SERVER_KEY`,
  e.g. `serverA`) listing the zones it owns and whether each is running, and
  (b) executes any `zone_commands` row whose `host` equals its `SERVER_KEY`.
* The API merges all servers' status rows, so the UI shows **which server each
  zone runs on**. Commands auto-target the running server, with a manual
  override dropdown when a zone exists on more than one server.

## Files

| File | Purpose |
|------|---------|
| `zone-daemon.sh` | the daemon (generic; behaviour comes from the conf) |
| `zone-daemon.serverA.conf` | Server A config (`/opt/infantry`, tags bhx/sk/tzmolo/usl) |
| `zone-daemon.serverB.conf` | Server B config (`/home/freeinfantry/zones`, tag usl) |
| `zone-daemon.service.template` | systemd unit (fill `__USER__` / `__SCRIPT_DIR__` / `__SERVER_KEY__`) |
| `rebuild-zones.serverB.sh` | Server B rebuild script (A already has one) |
| `schema.sql` | the one required DB change: `zone_commands.host` |

> **Never commit the real `SUPABASE_SERVICE_KEY`.** The committed conf files use
> the `__INJECT_AT_DEPLOY__` placeholder; the real key is written into the conf
> on the server at deploy time and the conf is `chmod 600`.

## One-time DB change

Run `schema.sql` in the Supabase SQL editor (adds `zone_commands.host`). This is
required before commands will queue; status reporting works without it.

## Deploy (per server)

Server A (`travis@167.71.118.224`, base `/opt/infantry`, scripts in
`/opt/infantry/scripts/`), Server B (`freeinfantry@51.81.82.133`, base
`/home/freeinfantry/zones`, scripts in `/home/freeinfantry/zones/scripts/`):

1. Copy `zone-daemon.sh` and the server's `*.conf` (renamed to
   `zone-daemon.conf`) into that server's scripts dir; `chmod +x` the script,
   `chmod 600` the conf, and replace `__INJECT_AT_DEPLOY__` with the service key.
2. (Server B only) also copy `rebuild-zones.serverB.sh` → `rebuild-zones.sh`.
3. Smoke test:  `./zone-daemon.sh test`  then  `./zone-daemon.sh status`.
4. Install the systemd unit from the template (User = `travis` / `freeinfantry`)
   and `systemctl enable --now zone-daemon`.

## Caveats

* `screen` sessions are per-user. The daemon controls zones started by **its own
  user**. A zone running under a different account won't be stoppable by the
  daemon until zones are consolidated under one service user.
* `start`/`rebuild` of a zone require that zone's folder (and a `ZoneServer.dll`)
  to exist in the server's `ZONES_BASE`.
