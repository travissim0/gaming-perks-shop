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
    log "ERROR rebuild $tag: REBUILD_SCRIPT not set/executable ($REBUILD_SCRIPT)"; return 1
  fi
  log "Rebuilding $tag via $REBUILD_SCRIPT"
  "$REBUILD_SCRIPT" "$tag" >>"$LOG_FILE" 2>&1
}

execute_action() {  # zone action -> propagates exit code
  local zone="$1" action="$2"
  case "$action" in
    start)   start_zone   "$zone" ;;
    stop)    stop_zone    "$zone" ;;
    restart) restart_zone "$zone" ;;
    rebuild) rebuild_zone "$zone" ;;
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
    local id action zone admin
    id=$(jq -r '.id'       <<<"$row")
    action=$(jq -r '.action'   <<<"$row")
    zone=$(jq -r '.zone'     <<<"$row")
    admin=$(jq -r '.admin_id // empty' <<<"$row")
    [ -z "$id" ] || [ "$id" = "null" ] && continue

    log "CMD $id: $action $zone (host=$SERVER_KEY)"
    sb PATCH "zone_commands?id=eq.$id" \
       "{\"status\":\"processing\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" >/dev/null

    local msg status
    if msg="$(execute_action "$zone" "$action" 2>&1)"; then status="completed"; else status="failed"; fi
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
    while true; do
      report_status
      process_commands
      sleep "$POLL_INTERVAL"
    done
    ;;
  once)    report_status; process_commands ;;
  status)  build_zones_json | jq . ;;
  test)    db_test ;;
  *) echo "Usage: $0 [daemon|once|status|test]"; exit 1 ;;
esac
