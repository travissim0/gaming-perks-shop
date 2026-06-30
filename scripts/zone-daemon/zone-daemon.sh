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

start_zone() {
  local tag="$1" dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { log "ERROR start $tag: dir not found ($dir)"; return 1; }
  if is_running "$tag"; then log "WARN start $tag: already running"; return 0; fi
  log "Starting $tag in $dir"
  ( cd "$dir" && screen -dmS "$tag" dotnet ZoneServer.dll )
  sleep 3
  if is_running "$tag"; then log "OK $tag started"; return 0; else log "ERROR $tag failed to start"; return 1; fi
}

stop_zone() {
  local tag="$1"
  if ! is_running "$tag"; then log "WARN stop $tag: not running"; return 0; fi
  log "Stopping $tag"
  screen -S "$tag" -X quit
  sleep 2
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
  local tag="$1" cfg="$2" lvl="$3" lio="$4"
  local dir; dir="$(zone_dir "$tag")"
  [ -n "${ZONE_DIRS[$tag]:-}" ] && [ -d "$dir" ] || { echo "zone dir not found for $tag ($dir)"; return 1; }
  [ -x "$ROTATE_SCRIPT" ] || { echo "ROTATE_SCRIPT not executable ($ROTATE_SCRIPT)"; return 1; }
  log "Swapping map for $tag: cfg='$cfg' lvl='$lvl' lio='$lio'"
  local res; res="$("$ROTATE_SCRIPT" "$dir" swap-lvl-lio "$cfg" "$lvl" "$lio" 2>&1)"
  if ! echo "$res" | jq -e '.success==true' >/dev/null 2>&1; then
    local e; e="$(echo "$res" | jq -r '.error // empty' 2>/dev/null)"
    echo "map edit failed: ${e:-$res}"; return 1
  fi
  # reload the new map with a restart
  if restart_zone "$tag"; then
    echo "map set on ${cfg:-active cfg}: lvl=$lvl lio=$lio (zone restarted)"
    return 0
  fi
  echo "map edited but zone failed to restart"; return 1
}

execute_action() {  # zone action [args_json] -> propagates exit code
  local zone="$1" action="$2" args="${3:-}"
  case "$action" in
    start)   start_zone   "$zone" ;;
    stop)    stop_zone    "$zone" ;;
    restart) restart_zone "$zone" ;;
    rebuild) rebuild_zone "$zone" ;;
    swap-lvl-lio)
      local cfg lvl lio
      cfg=$(jq -r '.cfg // ""' <<<"$args" 2>/dev/null)
      lvl=$(jq -r '.lvl // ""' <<<"$args" 2>/dev/null)
      lio=$(jq -r '.lio // ""' <<<"$args" 2>/dev/null)
      swap_map "$zone" "$cfg" "$lvl" "$lio" ;;
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
