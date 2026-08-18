# CTF - Mini zone dev runbook (Soup)

Your zone: **CTF - Mini** — tag `ctfmini`, port 9140, on the freeinfantry Linux server.
Your freeinf.org account has been granted: start / stop / restart / rebuild / **files** on this zone.

You never SSH to the server. Everything goes through freeinf.org, which queues commands
for the zone server's daemon. You can only write into your zone's `scripts/` and `assets/`
subfolders — `server.xml` (port, zoneid, DB password) is managed by Travis.

## The dev loop

1. Edit your gametype script / cfg / map files locally.
2. Upload + deploy them (web UI or API below).
3. **Restart the zone** — script and cfg changes only load at boot.
4. **View the log** — a healthy boot shows `Compile successful!` then `Server started..`;
   compile errors appear here too.

## Option A — web UI

`https://freeinf.org/test-zone` → your CTF - Mini card:

- **📁 Files** — upload a file (destination defaults to `scripts/GameTypes/CTF/<name>` for
  `.cs`, `assets/<name>` otherwise — editable), List Files, View Log.
- **🔄 Restart** — reload the zone with your deployed changes.

## Option B — API (works headless; give this file to Claude)

Set once per session (use YOUR freeinf.org login):

```bash
BASE="https://freeinf.org"
SUPA="https://nkinpmqnbcjaftqduujf.supabase.co"
ANON="sb_publishable_aJ5KPVBdEbkZMNYM8K9MZA_BGhQNA-E"   # public anon key, not a secret

TOKEN=$(curl -s -X POST "$SUPA/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$FREEINF_EMAIL\",\"password\":\"$FREEINF_PASSWORD\"}" | jq -r .access_token)
```

### Deploy a file (example: your gametype script)

```bash
FILE="CTF.cs"                              # local file
DEST="scripts/GameTypes/CTF/CTF.cs"        # zone-relative destination

# 1) request a signed upload slot
SLOT=$(curl -s -X POST "$BASE/api/user-zone-control" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"action\":\"files-upload-url\",\"zone_key\":\"ctfmini\",\"args\":{\"path\":\"$DEST\"}}")
URL=$(jq -r .uploadUrl <<<"$SLOT"); OBJ=$(jq -r .object <<<"$SLOT")

# 2) upload the file to storage
curl -s -X PUT "$URL" -H "Content-Type: application/octet-stream" --data-binary @"$FILE" >/dev/null

# 3) tell the zone server to pull it into place
CMD=$(curl -s -X POST "$BASE/api/user-zone-control" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"action\":\"files-deploy\",\"zone_key\":\"ctfmini\",\"args\":{\"files\":[{\"path\":\"$DEST\",\"object\":\"$OBJ\"}]}}" \
  | jq -r .commandId)

# 4) poll for the result (daemon picks it up within ~5s)
sleep 8; curl -s "$BASE/api/user-zone-control?command=$CMD" \
  -H "Authorization: Bearer $TOKEN" | jq -r .command.result_message
```

### Restart the zone (loads your changes; kicks anyone playing)

```bash
curl -s -X POST "$BASE/api/user-zone-control" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"restart","zone_key":"ctfmini"}' | jq -r .message
```

### View the zone log (compile results — allow ~60s after restart for the boot)

```bash
CMD=$(curl -s -X POST "$BASE/api/user-zone-control" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"files-log","zone_key":"ctfmini"}' | jq -r .commandId)
sleep 8; curl -s "$BASE/api/user-zone-control?command=$CMD" \
  -H "Authorization: Bearer $TOKEN" | jq -r .command.result_message
```

### List your zone's files

```bash
CMD=$(curl -s -X POST "$BASE/api/user-zone-control" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"files-list","zone_key":"ctfmini"}' | jq -r .commandId)
sleep 8; curl -s "$BASE/api/user-zone-control?command=$CMD" \
  -H "Authorization: Bearer $TOKEN" | jq -r .command.result_message
```

## Rules & limits

- Destinations must start with `scripts/` or `assets/`; existing files are overwritten.
- Any file type is allowed (`.tip`, `.rpg`, per-gametype data files, whatever your zone needs). Max 50 MB.
- **Check the destination folder spelling.** Uploading a script to a mistyped path
  (e.g. `scripts/GameTypes/Quarantine/` instead of `.../QuarantineCA/`) does not replace the
  original - it adds a SECOND copy, and the zone compiles both. Every class then collides
  with itself (`CS0121`/`CS0229` -> `Bad IL format`) and the gametype silently fails to load.
  The deploy result now warns you when duplicate `.cs` filenames appear.
- Deploys don't restart the zone — restart deliberately (it disconnects players).
- Your map is `assets/ctfmini.lvl` / `.lio`, config `assets/ctfmini.cfg`, script
  `scripts/GameTypes/CTF/CTF.cs` (self-contained; the zone compiles it at boot).
- Keep asset FILENAMES unique to your zone if content differs from another zone's file
  with the same name — the game client caches by filename and the anti-cheat kicks on
  mid-session checksum flips.
- If the zone won't boot after a change, View Log shows why (missing file, compile error).
  Worst case, ask Travis to restore from the working copy.
