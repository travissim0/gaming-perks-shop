#!/bin/bash
# rotate-map.sh — Infantry Zone Map Rotation Script
# Deployed to: /opt/infantry/server/rotate-map.sh
# Usage: bash rotate-map.sh <command> [args...]

set -euo pipefail

ZONE_DIR="/home/travis/infantry/server/League - USL Matches"
ASSETS_DIR="$ZONE_DIR/assets"
SERVER_XML="$ZONE_DIR/server.xml"
SCREEN_NAME="usl"

# --- Helpers ---

json_error() {
  echo "{\"success\":false,\"error\":\"$1\"}"
  exit 1
}

get_current_cfg() {
  grep -oP 'zoneConfig value="\K[^"]+' "$SERVER_XML" 2>/dev/null || echo ""
}

get_current_zone_name() {
  grep -oP 'zoneName value="\K[^"]+' "$SERVER_XML" 2>/dev/null || echo ""
}

get_cfg_field() {
  local cfg_file="$1"
  local field="$2"
  grep -oP "^${field}=\K.*" "$ASSETS_DIR/$cfg_file" 2>/dev/null | tr -d '\r' || echo ""
}

is_screen_running() {
  screen -ls 2>/dev/null | grep -q "\.${SCREEN_NAME}[[:space:]]" && echo "true" || echo "false"
}

stop_zone() {
  if [ "$(is_screen_running)" = "true" ]; then
    screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true
    sleep 2
  fi
}

start_zone() {
  cd "$ZONE_DIR"
  screen -dmS "$SCREEN_NAME" dotnet ZoneServer.dll
  sleep 1
  if [ "$(is_screen_running)" = "true" ]; then
    return 0
  else
    return 1
  fi
}

validate_filename() {
  local name="$1"
  # Only allow alphanumeric, dots, underscores, hyphens
  if [[ ! "$name" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    json_error "Invalid filename: $name"
  fi
}

# --- Commands ---

cmd_status() {
  local cfg
  cfg=$(get_current_cfg)
  local zone_name
  zone_name=$(get_current_zone_name)
  local running
  running=$(is_screen_running)
  local lvl=""
  local lio=""

  if [ -n "$cfg" ] && [ -f "$ASSETS_DIR/$cfg" ]; then
    lvl=$(get_cfg_field "$cfg" "LvlFile")
    lio=$(get_cfg_field "$cfg" "LioFile")
  fi

  cat <<EOF
{"success":true,"running":$running,"cfg":"$cfg","lvl":"$lvl","lio":"$lio","zoneName":"$zone_name"}
EOF
}

cmd_swap_cfg() {
  local new_cfg="${1:-}"
  local new_zone_name="${2:-}"
  if [ -z "$new_cfg" ]; then
    json_error "Usage: rotate-map.sh swap-cfg <cfg_filename> [zone_name]"
  fi

  validate_filename "$new_cfg"

  if [ ! -f "$ASSETS_DIR/$new_cfg" ]; then
    json_error "Config file not found: $new_cfg"
  fi

  local previous_cfg
  previous_cfg=$(get_current_cfg)
  local prev_zone_name
  prev_zone_name=$(get_current_zone_name)

  # Stop zone
  stop_zone

  # Update server.xml zoneConfig
  sed -i "s|zoneConfig value=\"[^\"]*\"|zoneConfig value=\"$new_cfg\"|" "$SERVER_XML"

  # Update zoneName if provided
  if [ -n "$new_zone_name" ]; then
    sed -i "s|zoneName value=\"[^\"]*\"|zoneName value=\"$new_zone_name\"|" "$SERVER_XML"
  fi

  # Get new map info
  local new_lvl
  new_lvl=$(get_cfg_field "$new_cfg" "LvlFile")
  local new_lio
  new_lio=$(get_cfg_field "$new_cfg" "LioFile")
  local actual_zone_name
  actual_zone_name=$(get_current_zone_name)

  # Restart zone
  if start_zone; then
    cat <<EOF
{"success":true,"cfg":"$new_cfg","previous_cfg":"$previous_cfg","lvl":"$new_lvl","lio":"$new_lio","zoneName":"$actual_zone_name","previous_zoneName":"$prev_zone_name"}
EOF
  else
    json_error "Zone failed to start after config swap"
  fi
}

cmd_swap_lvl() {
  local new_lvl="${1:-}"
  local new_lio="${2:-}"
  local target_cfg="${3:-}"
  local new_zone_name="${4:-}"

  if [ -z "$new_lvl" ] || [ -z "$new_lio" ]; then
    json_error "Usage: rotate-map.sh swap-lvl <lvl_file> <lio_file> [cfg_file] [zone_name]"
  fi

  validate_filename "$new_lvl"
  validate_filename "$new_lio"

  # Default to current cfg if not specified
  if [ -z "$target_cfg" ]; then
    target_cfg=$(get_current_cfg)
  else
    validate_filename "$target_cfg"
  fi

  if [ ! -f "$ASSETS_DIR/$target_cfg" ]; then
    json_error "Config file not found: $target_cfg"
  fi

  if [ ! -f "$ASSETS_DIR/$new_lvl" ]; then
    json_error "LVL file not found: $new_lvl"
  fi

  if [ ! -f "$ASSETS_DIR/$new_lio" ]; then
    json_error "LIO file not found: $new_lio"
  fi

  # Get previous values
  local prev_lvl
  prev_lvl=$(get_cfg_field "$target_cfg" "LvlFile")
  local prev_lio
  prev_lio=$(get_cfg_field "$target_cfg" "LioFile")
  local prev_zone_name
  prev_zone_name=$(get_current_zone_name)

  # Stop zone
  stop_zone

  # Update LvlFile and LioFile in the cfg
  sed -i "s|^LvlFile=.*|LvlFile=$new_lvl|" "$ASSETS_DIR/$target_cfg"
  sed -i "s|^LioFile=.*|LioFile=$new_lio|" "$ASSETS_DIR/$target_cfg"

  # Update zoneName if provided
  if [ -n "$new_zone_name" ]; then
    sed -i "s|zoneName value=\"[^\"]*\"|zoneName value=\"$new_zone_name\"|" "$SERVER_XML"
  fi

  local actual_zone_name
  actual_zone_name=$(get_current_zone_name)

  # Restart zone
  if start_zone; then
    cat <<EOF
{"success":true,"cfg":"$target_cfg","lvl":"$new_lvl","lio":"$new_lio","previous_lvl":"$prev_lvl","previous_lio":"$prev_lio","zoneName":"$actual_zone_name","previous_zoneName":"$prev_zone_name"}
EOF
  else
    json_error "Zone failed to start after lvl/lio swap"
  fi
}

cmd_list_cfgs() {
  local first=true
  echo -n "["
  for f in "$ASSETS_DIR"/*.cfg; do
    [ -f "$f" ] || continue
    local name
    name=$(basename "$f")
    local lvl
    lvl=$(get_cfg_field "$name" "LvlFile")
    local lio
    lio=$(get_cfg_field "$name" "LioFile")
    if [ "$first" = true ]; then
      first=false
    else
      echo -n ","
    fi
    echo -n "{\"cfg\":\"$name\",\"lvl\":\"$lvl\",\"lio\":\"$lio\"}"
  done
  echo "]"
}

cmd_list_lvls() {
  local first=true
  echo -n "["
  for f in "$ASSETS_DIR"/*.lvl; do
    [ -f "$f" ] || continue
    local name
    name=$(basename "$f")
    if [ "$first" = true ]; then
      first=false
    else
      echo -n ","
    fi
    echo -n "\"$name\""
  done
  echo "]"
}

cmd_list_lios() {
  local first=true
  echo -n "["
  for f in "$ASSETS_DIR"/*.lio; do
    [ -f "$f" ] || continue
    local name
    name=$(basename "$f")
    if [ "$first" = true ]; then
      first=false
    else
      echo -n ","
    fi
    echo -n "\"$name\""
  done
  echo "]"
}

# --- Main ---

command="${1:-}"
shift || true

case "$command" in
  status)      cmd_status ;;
  swap-cfg)    cmd_swap_cfg "$@" ;;
  swap-lvl)    cmd_swap_lvl "$@" ;;
  list-cfgs)   cmd_list_cfgs ;;
  list-lvls)   cmd_list_lvls ;;
  list-lios)   cmd_list_lios ;;
  *)           json_error "Unknown command: $command. Use: status|swap-cfg|swap-lvl|list-cfgs|list-lvls|list-lios" ;;
esac
