#!/bin/bash
# rotation-daemon.sh — Runs on the Linux server, polls Supabase for rotation commands
# Deploy to: /opt/infantry/server/rotation-daemon.sh
# Run with: screen -dmS rotation-daemon bash /opt/infantry/server/rotation-daemon.sh
#
# Required env vars (set in /opt/infantry/server/.env):
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_SERVICE_KEY=your-service-role-key

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATE_SCRIPT="$SCRIPT_DIR/rotate-map.sh"
ENV_FILE="$SCRIPT_DIR/.env"
POLL_INTERVAL=5  # seconds between DB polls
STATUS_INTERVAL=30  # seconds between status updates
ZONE_KEY="usl"

# Load env vars
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
else
  echo "ERROR: $ENV_FILE not found. Create it with SUPABASE_URL and SUPABASE_SERVICE_KEY."
  exit 1
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in $ENV_FILE"
  exit 1
fi

API_HEADERS="apikey: $SUPABASE_SERVICE_KEY
Authorization: Bearer $SUPABASE_SERVICE_KEY
Content-Type: application/json
Prefer: return=representation"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# --- Supabase REST helpers ---

supabase_get() {
  local endpoint="$1"
  curl -s -X GET \
    "$SUPABASE_URL/rest/v1/$endpoint" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
}

supabase_patch() {
  local endpoint="$1"
  local data="$2"
  curl -s -X PATCH \
    "$SUPABASE_URL/rest/v1/$endpoint" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$data"
}

supabase_post() {
  local endpoint="$1"
  local data="$2"
  curl -s -X POST \
    "$SUPABASE_URL/rest/v1/$endpoint" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$data"
}

supabase_upsert() {
  local endpoint="$1"
  local data="$2"
  curl -s -X POST \
    "$SUPABASE_URL/rest/v1/$endpoint" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation,resolution=merge-duplicates" \
    -d "$data"
}

supabase_delete() {
  local endpoint="$1"
  curl -s -X DELETE \
    "$SUPABASE_URL/rest/v1/$endpoint" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
}

# --- Update zone status in DB ---

update_status() {
  local status_json
  status_json=$("$ROTATE_SCRIPT" status 2>/dev/null)

  if [ $? -ne 0 ] || [ -z "$status_json" ]; then
    log "WARNING: Failed to get zone status"
    return 1
  fi

  local running cfg lvl lio zoneName
  running=$(echo "$status_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('running','false')).lower())" 2>/dev/null || echo "false")
  cfg=$(echo "$status_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cfg',''))" 2>/dev/null || echo "")
  lvl=$(echo "$status_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('lvl',''))" 2>/dev/null || echo "")
  lio=$(echo "$status_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('lio',''))" 2>/dev/null || echo "")
  zoneName=$(echo "$status_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('zoneName',''))" 2>/dev/null || echo "")

  local upsert_data
  upsert_data=$(cat <<EOF
{
  "zone_key": "$ZONE_KEY",
  "running": $running,
  "current_cfg": "$cfg",
  "current_lvl": "$lvl",
  "current_lio": "$lio",
  "zone_name": "$zoneName",
  "updated_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
)

  supabase_upsert "map_rotation_status?on_conflict=zone_key" "$upsert_data" > /dev/null
}

# --- Update available files list in DB ---

update_available_files() {
  log "Refreshing available files list..."

  # Clear old entries
  supabase_delete "map_rotation_available_files?zone_key=eq.$ZONE_KEY" > /dev/null

  # Get cfg list
  local cfgs_json
  cfgs_json=$("$ROTATE_SCRIPT" list-cfgs 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$cfgs_json" ]; then
    # Parse each cfg entry and insert
    local count
    count=$(echo "$cfgs_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

    for i in $(seq 0 $((count - 1))); do
      local cfg lvl lio
      cfg=$(echo "$cfgs_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[$i]['cfg'])" 2>/dev/null)
      lvl=$(echo "$cfgs_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[$i].get('lvl',''))" 2>/dev/null)
      lio=$(echo "$cfgs_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[$i].get('lio',''))" 2>/dev/null)

      supabase_post "map_rotation_available_files" \
        "{\"zone_key\":\"$ZONE_KEY\",\"file_type\":\"cfg\",\"filename\":\"$cfg\",\"lvl_file\":\"$lvl\",\"lio_file\":\"$lio\"}" > /dev/null
    done
    log "  Inserted $count cfg entries"
  fi

  # Get lvl list
  local lvls_json
  lvls_json=$("$ROTATE_SCRIPT" list-lvls 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$lvls_json" ]; then
    local count
    count=$(echo "$lvls_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

    for i in $(seq 0 $((count - 1))); do
      local name
      name=$(echo "$lvls_json" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i])" 2>/dev/null)
      supabase_post "map_rotation_available_files" \
        "{\"zone_key\":\"$ZONE_KEY\",\"file_type\":\"lvl\",\"filename\":\"$name\"}" > /dev/null
    done
    log "  Inserted $count lvl entries"
  fi

  # Get lio list
  local lios_json
  lios_json=$("$ROTATE_SCRIPT" list-lios 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$lios_json" ]; then
    local count
    count=$(echo "$lios_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

    for i in $(seq 0 $((count - 1))); do
      local name
      name=$(echo "$lios_json" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i])" 2>/dev/null)
      supabase_post "map_rotation_available_files" \
        "{\"zone_key\":\"$ZONE_KEY\",\"file_type\":\"lio\",\"filename\":\"$name\"}" > /dev/null
    done
    log "  Inserted $count lio entries"
  fi

  log "Available files refresh complete"
}

# --- Process a single command ---

process_command() {
  local cmd_id="$1"
  local command="$2"
  local args_json="$3"
  local requested_by="$4"
  local requested_by_alias="$5"
  local player_count="$6"
  local force_rotated="$7"

  log "Processing command $cmd_id: $command (args: $args_json)"

  # Mark as in_progress
  supabase_patch "map_rotation_commands?id=eq.$cmd_id" \
    "{\"status\":\"in_progress\",\"started_at\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"}" > /dev/null

  # Get status before rotation for history
  local pre_status
  pre_status=$("$ROTATE_SCRIPT" status 2>/dev/null)
  local prev_cfg prev_lvl prev_lio
  prev_cfg=$(echo "$pre_status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cfg',''))" 2>/dev/null || echo "")
  prev_lvl=$(echo "$pre_status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lvl',''))" 2>/dev/null || echo "")
  prev_lio=$(echo "$pre_status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lio',''))" 2>/dev/null || echo "")

  # Build and execute the rotate-map.sh command
  local result
  local exit_code

  case "$command" in
    swap-cfg)
      local cfg
      cfg=$(echo "$args_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['cfg'])" 2>/dev/null)
      result=$("$ROTATE_SCRIPT" swap-cfg "$cfg" 2>&1)
      exit_code=$?
      ;;
    swap-lvl)
      local lvl lio cfg
      lvl=$(echo "$args_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['lvl'])" 2>/dev/null)
      lio=$(echo "$args_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['lio'])" 2>/dev/null)
      cfg=$(echo "$args_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cfg',''))" 2>/dev/null)
      if [ -n "$cfg" ]; then
        result=$("$ROTATE_SCRIPT" swap-lvl "$lvl" "$lio" "$cfg" 2>&1)
      else
        result=$("$ROTATE_SCRIPT" swap-lvl "$lvl" "$lio" 2>&1)
      fi
      exit_code=$?
      ;;
    *)
      result="{\"success\":false,\"error\":\"Unknown command: $command\"}"
      exit_code=1
      ;;
  esac

  # Parse result
  local success
  success=$(echo "$result" | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('success',False)).lower())" 2>/dev/null || echo "false")

  # Get new values from result
  local new_cfg new_lvl new_lio
  new_cfg=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cfg',''))" 2>/dev/null || echo "")
  new_lvl=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lvl',''))" 2>/dev/null || echo "")
  new_lio=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lio',''))" 2>/dev/null || echo "")

  local status_val error_msg
  if [ "$success" = "true" ]; then
    status_val="completed"
    error_msg=""
    log "Command $cmd_id completed successfully"
  else
    status_val="failed"
    error_msg=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','Unknown error'))" 2>/dev/null || echo "Command failed")
    log "Command $cmd_id failed: $error_msg"
  fi

  # Update command status
  supabase_patch "map_rotation_commands?id=eq.$cmd_id" \
    "{\"status\":\"$status_val\",\"result\":$(echo "$result" | python3 -c "import sys,json; json.dump(sys.stdin.read(),sys.stdout)" 2>/dev/null || echo '""'),\"error_message\":\"$error_msg\",\"completed_at\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"}" > /dev/null

  # Log to rotation history
  local history_status
  if [ "$success" = "true" ]; then
    history_status="success"
  else
    history_status="failed"
  fi

  # Escape error message for JSON
  local escaped_error
  escaped_error=$(echo "$error_msg" | python3 -c "import sys,json; json.dump(sys.stdin.read().strip(),sys.stdout)" 2>/dev/null || echo '""')

  supabase_post "map_rotation_history" \
    "{\"zone_key\":\"$ZONE_KEY\",\"rotation_type\":\"$command\",\"previous_cfg\":\"$prev_cfg\",\"new_cfg\":\"$new_cfg\",\"previous_lvl\":\"$prev_lvl\",\"new_lvl\":\"$new_lvl\",\"previous_lio\":\"$prev_lio\",\"new_lio\":\"$new_lio\",\"triggered_by\":\"$requested_by\",\"triggered_by_alias\":\"$requested_by_alias\",\"force_rotated\":$force_rotated,\"player_count_at_rotation\":$player_count,\"status\":\"$history_status\",\"error_message\":$escaped_error}" > /dev/null

  # Update status immediately after rotation
  update_status
}

# --- Poll for pending commands ---

poll_commands() {
  local pending
  pending=$(supabase_get "map_rotation_commands?status=eq.pending&order=created_at.asc&limit=1")

  # Check if we got any results
  local count
  count=$(echo "$pending" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")

  if [ "$count" -gt 0 ]; then
    local cmd_id command args_json requested_by requested_by_alias player_count force_rotated
    cmd_id=$(echo "$pending" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
    command=$(echo "$pending" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['command'])" 2>/dev/null)
    args_json=$(echo "$pending" | python3 -c "import sys,json; import json as j; print(j.dumps(json.load(sys.stdin)[0].get('args',{})))" 2>/dev/null)
    requested_by=$(echo "$pending" | python3 -c "import sys,json; print(json.load(sys.stdin)[0].get('requested_by',''))" 2>/dev/null)
    requested_by_alias=$(echo "$pending" | python3 -c "import sys,json; print(json.load(sys.stdin)[0].get('requested_by_alias','unknown'))" 2>/dev/null)
    player_count=$(echo "$pending" | python3 -c "import sys,json; print(json.load(sys.stdin)[0].get('player_count_at_request',0))" 2>/dev/null || echo "0")
    force_rotated=$(echo "$pending" | python3 -c "import sys,json; print(str(json.load(sys.stdin)[0].get('force_rotated',False)).lower())" 2>/dev/null || echo "false")

    process_command "$cmd_id" "$command" "$args_json" "$requested_by" "$requested_by_alias" "$player_count" "$force_rotated"
  fi
}

# --- Expire stale commands ---

expire_stale_commands() {
  # Mark commands pending for > 5 minutes as expired
  local cutoff
  cutoff=$(date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-5M '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)

  if [ -n "$cutoff" ]; then
    supabase_patch "map_rotation_commands?status=eq.pending&created_at=lt.$cutoff" \
      "{\"status\":\"expired\",\"error_message\":\"Command expired (not picked up within 5 minutes)\"}" > /dev/null
  fi
}

# --- Main loop ---

log "=== Map Rotation Daemon Starting ==="
log "Zone: $ZONE_KEY"
log "Poll interval: ${POLL_INTERVAL}s"
log "Status interval: ${STATUS_INTERVAL}s"
log "Supabase URL: $SUPABASE_URL"

# Initial file list update
update_available_files

# Initial status update
update_status

last_status_update=$(date +%s)
last_files_update=$(date +%s)

while true; do
  # Poll for commands
  poll_commands

  # Update status periodically
  now=$(date +%s)
  if [ $((now - last_status_update)) -ge $STATUS_INTERVAL ]; then
    update_status
    last_status_update=$now
  fi

  # Refresh file list every 10 minutes
  if [ $((now - last_files_update)) -ge 600 ]; then
    update_available_files
    last_files_update=$now
  fi

  # Expire stale commands every cycle
  expire_stale_commands

  sleep $POLL_INTERVAL
done
