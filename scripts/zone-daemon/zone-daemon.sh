#!/bin/bash
#
# zone-daemon.sh - Multi-server Infantry zone control daemon
# ==========================================================
# Replaces the old single-server zone-database-client.sh.
#
# Each game server runs ONE copy of this daemon with its own config file
# (zone-daemon.conf next to this script). The daemon:
#   1. Reports the status of the zones it owns to Supabase, keyed by this
#      server's SERVER_KEY  (one zone_status row per server).
#   2. Picks up pending commands in zone_commands whose `host` == SERVER_KEY
#      and executes start / stop / restart / rebuild for the target zone.
#
# The web app NEVER executes anything. It only reads zone_status (to show
# which server each zone runs on) and inserts zone_commands rows. This keeps
# the architecture firewall-friendly and lets zones move between servers.
#
# Config (zone-daemon.conf, sourced at runtime - keep SUPABASE_SERVICE_KEY
# out of git, chmod 600 the conf on the server):
#   SERVER_KEY="serverA"                 # stable id (also zone_status.id / zone_commands.host)
#   SERVER_LABEL="Server A (SFO droplet)"
#   ZONES_BASE="/opt/infantry"           # parent dir that holds the zone folders
#   REBUILD_SCRIPT="/opt/infantry/scripts/rebuild-zones.sh"
#   SUPABASE_URL="https://xxxx.supabase.co"
#   SUPABASE_SERVICE_KEY="eyJ..."
#   declare -A ZONE_DIRS=( [usl]="League - USL Matches" ... )   # tag -> folder
#   declare -A ZONE_NAMES=( [usl]="League - USL Matches" ... )  # tag -> display name (optional)
#   declare -A ZONE_SLOTS=( [ctfmini]="zid175" [qca]="zid175" )  # tag -> slot (optional)
#
# ZONE_SLOTS groups tags that SHARE a game-DB zoneid. Only one member of a slot
# may run at a time: two zones logging in under one zoneid kick each other off
# the database in a loop. Starting a zone auto-stops any running sibling in its
# slot, so a slot behaves like one swappable zone "seat".
#
# Usage:
#   ./zone-daemon.sh daemon   # run forever (systemd ExecStart)
#   ./zone-daemon.sh once     # single status+command cycle (for testing)
#   ./zone-daemon.sh status   # print the status JSON this server would report
#   ./zone-daemon.sh test     # check config + DB connectivity, then exit

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${ZONE_DAEMON_CONF:-$SCRIPT_DIR/zone-daemon.conf}"
POLL_INTERVAL="${ZONE_DAEMON_INTERVAL:-5}"   # seconds between cycles
LOG_FILE="${ZONE_DAEMON_LOG:-$SCRIPT_DIR/zone-daemon.log}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE" >&2; }

# ---- load + validate config -------------------------------------------------
if [ ! -f "$CONF_FILE" ]; then
  echo "FATAL: config not found: $CONF_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONF_FILE"

for v in SERVER_KEY ZONES_BASE SUPABASE_URL SUPABASE_SERVICE_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "FATAL: $v not set in $CONF_FILE" >&2
    exit 1
  fi
done
SERVER_LABEL="${SERVER_LABEL:-$SERVER_KEY}"
REBUILD_SCRIPT="${REBUILD_SCRIPT:-}"
ROTATE_SCRIPT="${ROTATE_SCRIPT:-$SCRIPT_DIR/rotate-map.sh}"
# default only if the conf did not define it - re-declaring would wipe the conf value
declare -p ZONE_SLOTS >/dev/null 2>&1 || declare -A ZONE_SLOTS=()
MAPS_REFRESH_CYCLES="${MAPS_REFRESH_CYCLES:-12}"  # refresh zone_maps every N poll cycles (~60s at 5s)
declare -A ZONE_DIRS  2>/dev/null || true
declare -A ZONE_NAMES 2>/dev/null || true

for c in curl jq screen; do
  command -v "$c" >/dev/null 2>&1 || { echo "FATAL: '$c' is required but not installed" >&2; exit 1; }
done

# ---- supabase helpers -------------------------------------------------------
sb() {  # sb METHOD ENDPOINT [DATA]
  local method="$1" endpoint="$2" data="${3:-}"
  local url="${SUPABASE_URL}/rest/v1/${endpoint}"
  local hdr=(-H "apikey: $SUPABASE_SERVICE_KEY"
             -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
             -H "Content-Type: application/json"
             -H "Prefer: resolution=merge-duplicates")
  if [ -n "$data" ]; then
    curl -s -X "$method" "${hdr[@]}" --data-raw "$data" "$url"
  else
    curl -s -X "$method" "${hdr[@]}" "$url"
  fi
}

json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || jq -Rs . ; }

# ---- zone primitives --------------------------------------------------------
zone_dir() { echo "$ZONES_BASE/${ZONE_DIRS[$1]:-}"; }

is_running() {  # tag -> 0 if a detached screen session named tag exists
  screen -ls 2>/dev/null | grep -E "[0-9]+\.${1}[[:space:]]" >/dev/null 2>&1
}

slot_siblings() {  # tag -> other tags sharing its zoneid slot (blank if unslotted)
  local tag="$1" slot="${ZONE_SLOTS[$tag]:-}" t
  [ -n "$slot" ] || return 0
  for t in "${!ZONE_SLOTS[@]}"; do
    [ "$t" = "$tag" ] && continue
    [ "${ZONE_SLOTS[$t]}" = "$slot" ] && echo "$t"
  done
}

start_zone() {
  local tag="$1" dir sib; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { log "ERROR start $tag: dir not found ($dir)"; return 1; }
  if is_running "$tag"; then log "WARN start $tag: already running"; return 0; fi
  # one zoneid = one running zone; hand the slot over instead of fighting for it
  for sib in $(slot_siblings "$tag"); do
    if is_running "$sib"; then
      log "SLOT ${ZONE_SLOTS[$tag]}: stopping $sib to free the zoneid for $tag"
      stop_zone "$sib"
    fi
  done
  log "Starting $tag in $dir"
  ( cd "$dir" && screen -dmS "$tag" dotnet ZoneServer.dll )
  sleep 3
  if is_running "$tag"; then log "OK $tag started"; return 0; else log "ERROR $tag failed to start"; return 1; fi
}

stop_zone() {
  local tag="$1"
  if ! is_running "$tag"; then log "WARN stop $tag: not running"; return 0; fi
  log "Stopping $tag"
  # Ctrl+C first: only SIGINT makes a zone deregister from the client directory.
  # A bare "screen quit" leaves a ghost entry sitting on its zoneid.
  local waited=0
  screen -S "$tag" -X stuff $'\003'
  while [ $waited -lt 12 ] && is_running "$tag"; do sleep 1; waited=$((waited + 1)); done
  if is_running "$tag"; then
    log "WARN $tag ignored SIGINT after ${waited}s, forcing"
    screen -S "$tag" -X quit
    sleep 2
  fi
  if ! is_running "$tag"; then log "OK $tag stopped"; return 0; else log "ERROR $tag failed to stop"; return 1; fi
}

restart_zone() { stop_zone "$1"; sleep 2; start_zone "$1"; }

rebuild_zone() {
  local tag="$1"
  if [ -z "$REBUILD_SCRIPT" ] || [ ! -x "$REBUILD_SCRIPT" ]; then
    echo "REBUILD_SCRIPT not set or not executable ($REBUILD_SCRIPT)"
    return 1
  fi
  log "Rebuilding $tag via $REBUILD_SCRIPT"
  local out rc
  out="$("$REBUILD_SCRIPT" "$tag" 2>&1)"
  rc=$?
  # full script output to the daemon log for debugging
  printf '%s\n' "$out" >> "$LOG_FILE"
  # concise summary back to the caller -> stored in zone_commands.result_message
  local release steps
  release="$(printf '%s' "$out" | grep -oE 'releases/download/[^/]+/' | head -1 | sed -E 's#releases/download/##; s#/$##')"
  steps="$(printf '%s' "$out" | grep -E '==> |started |stopped |SKIP |ERROR' | sed -E 's/^[[:space:]]+//' | awk '{printf "%s%s", sep, $0; sep="; "}')"
  echo "build=${release:-unknown}; ${steps:-no steps captured}"
  return $rc
}

# Map rotation: point a zone's cfg at a new lvl/lio (file edit) then restart so
# the zone loads it. rotate-map.sh does the edit; the daemon owns stop/start.
swap_map() {
  local tag="$1" cfg="$2" lvl="$3" lio="$4" zn="${5:-}"
  local dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { echo "zone dir not found for $tag ($dir)"; return 1; }
  [ -x "$ROTATE_SCRIPT" ] || { echo "ROTATE_SCRIPT not executable ($ROTATE_SCRIPT)"; return 1; }
  log "Swapping map for $tag: cfg='$cfg' lvl='$lvl' lio='$lio' zoneName='$zn'"
  local res; res="$("$ROTATE_SCRIPT" "$dir" swap-lvl-lio "$cfg" "$lvl" "$lio" "$zn" 2>&1)"
  if ! echo "$res" | jq -e '.success==true' >/dev/null 2>&1; then
    local e; e="$(echo "$res" | jq -r '.error // empty' 2>/dev/null)"
    echo "map edit failed: ${e:-$res}"; return 1
  fi
  # reload the new map with a restart
  if restart_zone "$tag"; then
    echo "map set on ${cfg:-active cfg}: lvl=$lvl lio=$lio${zn:+ zoneName='$zn'} (zone restarted)"
    return 0
  fi
  echo "map edited but zone failed to restart"; return 1
}

# ---- zone file management (the website's 'files' grant) ---------------------
# The web app stages uploads in the Supabase Storage bucket 'zone-files' and
# queues a sync-files command whose args list {path, object} pairs. The daemon
# downloads each object into the zone folder. Writes are restricted to the
# scripts/ and assets/ subfolders - server.xml (port/zoneid/db password) is
# untouchable by construction. The API validates paths too; this re-validation
# is the trust boundary that matters, so keep both in sync.

valid_rel_path() {  # zone-relative destination path -> 0 if safe to write
  local p="$1"
  case "$p" in
    scripts/*|assets/*) ;;
    *) return 1 ;;
  esac
  case "/$p/" in
    */../*|*/./*|*//*) return 1 ;;
  esac
  [[ "$p" =~ ^[A-Za-z0-9\ _()./-]+$ ]] || return 1
  return 0
}

storage_url() { echo "${SUPABASE_URL}/storage/v1/object/zone-files/${1// /%20}"; }

sync_files() {  # tag args_json -> deploys staged storage objects into the zone
  local tag="$1" args="$2" dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { echo "zone dir not found for $tag"; return 1; }
  local n; n=$(jq '.files | length' <<<"$args" 2>/dev/null)
  [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -gt 0 ] || { echo "args.files missing or empty"; return 1; }
  local i ok=0 fail=0 out=""
  for ((i = 0; i < n; i++)); do
    local rel obj tmp code
    rel=$(jq -r ".files[$i].path // \"\"" <<<"$args")
    obj=$(jq -r ".files[$i].object // \"\"" <<<"$args")
    if ! valid_rel_path "$rel"; then out+="REJECT $rel (bad path); "; fail=$((fail + 1)); continue; fi
    case "$obj" in
      "$tag"/*) ;;
      *) out+="REJECT $rel (object not under $tag/); "; fail=$((fail + 1)); continue ;;
    esac
    tmp="$(mktemp)"
    # sb_secret_* keys need the apikey header too - Authorization alone is HTTP 400
    code=$(curl -s -w '%{http_code}' -o "$tmp" \
           -H "apikey: $SUPABASE_SERVICE_KEY" \
           -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" "$(storage_url "$obj")")
    if [ "$code" != "200" ]; then
      out+="FAIL $rel (download HTTP $code); "; fail=$((fail + 1)); rm -f "$tmp"; continue
    fi
    mkdir -p "$dir/$(dirname "$rel")"
    mv "$tmp" "$dir/$rel"
    chmod 644 "$dir/$rel"
    out+="OK $rel ($(stat -c%s "$dir/$rel") bytes); "; ok=$((ok + 1))
    # staged object is consumed - delete it so the bucket doesn't grow forever
    curl -s -X DELETE -H "apikey: $SUPABASE_SERVICE_KEY" \
         -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" "$(storage_url "$obj")" >/dev/null
  done
  echo "$ok deployed, $fail failed. $out(restart the zone to load script/cfg changes)"
  [ "$fail" -eq 0 ]
}

list_files() {  # tag -> file inventory of scripts/ + assets/ (into result_message)
  local tag="$1" dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { echo "zone dir not found for $tag"; return 1; }
  ( cd "$dir" && find scripts assets -type f -printf '%10s  %TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null \
      | sort -k4 | head -500 )
}

tail_log() {  # tag -> recent zone log lines (compile errors etc.)
  local tag="$1" dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { echo "zone dir not found for $tag"; return 1; }
  [ -d "$dir/logs" ] || { echo "no logs directory"; return 1; }
  local f found=0
  for f in ZoneServerHandler1.txt errors.txt warnings.txt; do
    if [ -f "$dir/logs/$f" ]; then
      echo "=== logs/$f (last 40 lines) ==="
      tail -n 40 "$dir/logs/$f"
      found=1
    fi
  done
  [ "$found" -eq 1 ] || echo "no log files found"
}

execute_action() {  # zone action [args_json] -> propagates exit code
  local zone="$1" action="$2" args="${3:-}"
  case "$action" in
    start)   start_zone   "$zone" ;;
    stop)    stop_zone    "$zone" ;;
    restart) restart_zone "$zone" ;;
    rebuild) rebuild_zone "$zone" ;;
    sync-files) sync_files "$zone" "$args" ;;
    list-files) list_files "$zone" ;;
    tail-log)   tail_log   "$zone" ;;
    swap-lvl-lio)
      local cfg lvl lio zn
      cfg=$(jq -r '.cfg // ""' <<<"$args" 2>/dev/null)
      lvl=$(jq -r '.lvl // ""' <<<"$args" 2>/dev/null)
      lio=$(jq -r '.lio // ""' <<<"$args" 2>/dev/null)
      zn=$(jq -r '.zoneName // .name // ""' <<<"$args" 2>/dev/null)
      swap_map "$zone" "$cfg" "$lvl" "$lio" "$zn" ;;
    *)       log "ERROR unknown action '$action'"; return 1 ;;
  esac
}

# ---- status reporting -------------------------------------------------------
build_zones_json() {  # -> {"tag":{"name":..,"status":..,"directory":..}, ...}
  local first=true out="{"
  for tag in "${!ZONE_DIRS[@]}"; do
    local name="${ZONE_NAMES[$tag]:-${ZONE_DIRS[$tag]}}"
    local status="STOPPED"; is_running "$tag" && status="RUNNING"
    $first && first=false || out+=","
    out+=$(printf '"%s":{"name":%s,"status":"%s","directory":%s}' \
            "$tag" "$(printf '%s' "$name" | jq -Rs .)" "$status" "$(printf '%s' "${ZONE_DIRS[$tag]}" | jq -Rs .)")
  done
  out+="}"
  echo "$out"
}

report_status() {
  local zones_json; zones_json="$(build_zones_json)"
  echo "$zones_json" | jq empty 2>/dev/null || { log "ERROR built invalid zones JSON"; return 1; }
  # Only uses columns that already exist on zone_status (id, hostname, source,
  # zones_data, last_update) so status reporting needs no schema migration.
  # SERVER_KEY is stored as the row id; the web app maps it to a label.
  local record
  record=$(jq -nc \
    --arg id "$SERVER_KEY" \
    --arg host "$(hostname)" \
    --argjson zones "$zones_json" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
    '{id:$id, hostname:$host, source:"zone-daemon", zones_data:$zones, last_update:$ts}')
  sb POST "zone_status" "$record" >/dev/null
}

# ---- map rotation reporting -------------------------------------------------
# Upsert one zone_maps row per zone (keyed "<server>:<tag>") with the current
# cfg/lvl/lio and the available cfgs/lvls/lios, so the console can offer swaps.
build_maps_record() {  # tag -> JSON record (or empty if zone has no assets)
  local tag="$1" dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir/assets" ] || return 1
  [ -x "$ROTATE_SCRIPT" ] || return 1
  local st cfgs lvls lios
  st="$("$ROTATE_SCRIPT" "$dir" status 2>/dev/null)"
  echo "$st" | jq -e '.success==true' >/dev/null 2>&1 || return 1
  cfgs="$("$ROTATE_SCRIPT" "$dir" list-cfgs 2>/dev/null)"; echo "$cfgs" | jq -e 'type=="array"' >/dev/null 2>&1 || cfgs="[]"
  lvls="$("$ROTATE_SCRIPT" "$dir" list-lvls 2>/dev/null)"; echo "$lvls" | jq -e 'type=="array"' >/dev/null 2>&1 || lvls="[]"
  lios="$("$ROTATE_SCRIPT" "$dir" list-lios 2>/dev/null)"; echo "$lios" | jq -e 'type=="array"' >/dev/null 2>&1 || lios="[]"
  jq -nc \
    --arg id "${SERVER_KEY}:${tag}" --arg sk "$SERVER_KEY" --arg zk "$tag" \
    --argjson st "$st" --argjson cfgs "$cfgs" --argjson lvls "$lvls" --argjson lios "$lios" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
    '{id:$id, server_key:$sk, zone_key:$zk, current_cfg:$st.cfg, current_lvl:$st.lvl,
      current_lio:$st.lio, zone_name:$st.zoneName, cfgs:$cfgs, lvls:$lvls, lios:$lios, updated_at:$ts}'
}

report_maps() {
  for tag in "${!ZONE_DIRS[@]}"; do
    local rec; rec="$(build_maps_record "$tag")" || continue
    sb POST "zone_maps" "$rec" >/dev/null
  done
}

# ---- command processing -----------------------------------------------------
process_commands() {
  local rows; rows="$(sb GET "zone_commands?status=eq.pending&host=eq.${SERVER_KEY}&order=created_at.asc")"
  [ -z "$rows" ] && return 0
  # Ignore anything that isn't a JSON array (e.g. a PostgREST error object when
  # the `host` column hasn't been added yet - see schema.sql).
  if ! echo "$rows" | jq -e 'type=="array"' >/dev/null 2>&1; then
    return 0
  fi
  echo "$rows" | jq -c '.[]' 2>/dev/null | while read -r row; do
    local id action zone admin args
    id=$(jq -r '.id'       <<<"$row")
    action=$(jq -r '.action'   <<<"$row")
    zone=$(jq -r '.zone'     <<<"$row")
    admin=$(jq -r '.admin_id // empty' <<<"$row")
    args=$(jq -c '.args // {}' <<<"$row" 2>/dev/null)
    [ -z "$id" ] || [ "$id" = "null" ] && continue

    log "CMD $id: $action $zone (host=$SERVER_KEY)"
    sb PATCH "zone_commands?id=eq.$id" \
       "{\"status\":\"processing\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" >/dev/null

    local msg status
    if msg="$(execute_action "$zone" "$action" "$args" 2>&1)"; then status="completed"; else status="failed"; fi
    local result; result=$(printf '%s' "Zone $zone $action $status. ${msg}" | jq -Rs .)
    sb PATCH "zone_commands?id=eq.$id" \
       "{\"status\":\"$status\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"result_message\":$result}" >/dev/null
    log "CMD $id -> $status"
  done
}

# ---- entrypoints ------------------------------------------------------------
db_test() {
  local r; r="$(sb GET "zone_status?select=id&limit=1")"
  if echo "$r" | jq empty 2>/dev/null; then echo "DB OK ($SERVER_KEY -> $SUPABASE_URL)"; return 0
  else echo "DB FAIL: $r"; return 1; fi
}

case "${1:-daemon}" in
  daemon)
    log "zone-daemon starting: key=$SERVER_KEY base=$ZONES_BASE zones=[${!ZONE_DIRS[*]}]"
    db_test || { log "FATAL db_test failed"; exit 1; }
    report_maps   # initial maps snapshot
    cyc=0
    while true; do
      report_status
      process_commands
      cyc=$((cyc + 1))
      if [ $((cyc % MAPS_REFRESH_CYCLES)) -eq 0 ]; then report_maps; fi
      sleep "$POLL_INTERVAL"
    done
    ;;
  once)    report_status; report_maps; process_commands ;;
  status)  build_zones_json | jq . ;;
  maps)    for tag in "${!ZONE_DIRS[@]}"; do build_maps_record "$tag" | jq -c '{id,current_cfg,current_lvl,current_lio,cfgs:(.cfgs|length),lvls:(.lvls|length),lios:(.lios|length)}' 2>/dev/null; done ;;
  test)    db_test ;;
  *) echo "Usage: $0 [daemon|once|status|maps|test]"; exit 1 ;;
esac
