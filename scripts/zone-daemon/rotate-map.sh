#!/bin/bash
# rotate-map.sh <zone_dir> <command> [args...]
# =============================================
# Generalized, multi-zone, spaces-safe map helper called by zone-daemon.sh.
# It ONLY introspects and edits files (server.xml zoneConfig + a cfg's
# LvlFile/LioFile) — it never stops/starts the zone. The daemon owns the
# zone lifecycle, so the daemon does stop -> swap -> start.
#
# Commands (all emit JSON on stdout):
#   status                       -> {cfg,lvl,lio,zoneName} for the active cfg
#   list-cfgs                    -> [{cfg,lvl,lio}, ...] for every *.cfg
#   list-lvls / list-lios        -> ["name.lvl", ...] / ["name.lio", ...]
#   swap-lvl-lio <cfg> <lvl> <lio>  -> point <cfg>'s LvlFile/LioFile at <lvl>/<lio>
#                                      (cfg defaults to the active zoneConfig)
#
# Filenames may contain spaces (e.g. "League - USL CRPL.cfg"); only path
# traversal ("/" or "..") is rejected.

set -uo pipefail

ZONE_DIR="${1:-}"
CMD="${2:-}"
shift 2 2>/dev/null || true

ASSETS="$ZONE_DIR/assets"
SERVER_XML="$ZONE_DIR/server.xml"

err() { jq -nc --arg e "$1" '{success:false,error:$e}'; exit 1; }
command -v jq >/dev/null 2>&1 || { echo '{"success":false,"error":"jq not installed"}'; exit 1; }
[ -n "$ZONE_DIR" ] && [ -d "$ZONE_DIR" ] || err "zone dir not found: $ZONE_DIR"
[ -d "$ASSETS" ] || err "assets dir not found: $ASSETS"

cur_cfg()      { grep -oP 'zoneConfig value="\K[^"]+' "$SERVER_XML" 2>/dev/null | head -1 || true; }
cur_zonename() { grep -oP 'zoneName value="\K[^"]+'   "$SERVER_XML" 2>/dev/null | head -1 || true; }
cfg_field()    { grep -oiP "^$2=\K.*" "$ASSETS/$1" 2>/dev/null | tr -d '\r' | head -1 || true; }
safe()         { case "$1" in */*|*..*) err "invalid name: $1";; esac; }

case "$CMD" in
  status)
    cfg="$(cur_cfg)"; lvl=""; lio=""
    if [ -n "$cfg" ] && [ -f "$ASSETS/$cfg" ]; then
      lvl="$(cfg_field "$cfg" LvlFile)"; lio="$(cfg_field "$cfg" LioFile)"
    fi
    jq -nc --arg cfg "$cfg" --arg lvl "$lvl" --arg lio "$lio" --arg zn "$(cur_zonename)" \
      '{success:true,cfg:$cfg,lvl:$lvl,lio:$lio,zoneName:$zn}'
    ;;
  list-cfgs)
    out="[]"
    for f in "$ASSETS"/*.cfg; do
      [ -f "$f" ] || continue
      n="$(basename "$f")"
      out="$(jq -c --arg c "$n" --arg l "$(cfg_field "$n" LvlFile)" --arg o "$(cfg_field "$n" LioFile)" \
              '. + [{cfg:$c,lvl:$l,lio:$o}]' <<<"$out")"
    done
    echo "$out"
    ;;
  list-lvls)
    out="[]"; for f in "$ASSETS"/*.lvl; do [ -f "$f" ] || continue
      out="$(jq -c --arg n "$(basename "$f")" '. + [$n]' <<<"$out")"; done; echo "$out"
    ;;
  list-lios)
    out="[]"; for f in "$ASSETS"/*.lio; do [ -f "$f" ] || continue
      out="$(jq -c --arg n "$(basename "$f")" '. + [$n]' <<<"$out")"; done; echo "$out"
    ;;
  swap-lvl-lio)
    cfg="${1:-}"; lvl="${2:-}"; lio="${3:-}"
    [ -z "$cfg" ] && cfg="$(cur_cfg)"
    [ -n "$lvl" ] && [ -n "$lio" ] || err "usage: swap-lvl-lio <cfg> <lvl> <lio>"
    safe "$cfg"; safe "$lvl"; safe "$lio"
    [ -f "$ASSETS/$cfg" ] || err "cfg not found: $cfg"
    [ -f "$ASSETS/$lvl" ] || err "lvl not found: $lvl"
    [ -f "$ASSETS/$lio" ] || err "lio not found: $lio"
    prev_lvl="$(cfg_field "$cfg" LvlFile)"; prev_lio="$(cfg_field "$cfg" LioFile)"
    # Replace the LvlFile=/LioFile= lines (case-insensitive). Use a non-/ delimiter
    # so filenames with slashes can't escape (already blocked by safe()).
    sed -i "s|^LvlFile=.*|LvlFile=$lvl|I" "$ASSETS/$cfg"
    sed -i "s|^LioFile=.*|LioFile=$lio|I" "$ASSETS/$cfg"
    jq -nc --arg cfg "$cfg" --arg lvl "$lvl" --arg lio "$lio" --arg pl "$prev_lvl" --arg po "$prev_lio" \
      '{success:true,cfg:$cfg,lvl:$lvl,lio:$lio,previous_lvl:$pl,previous_lio:$po}'
    ;;
  *)
    err "unknown command: $CMD (use status|list-cfgs|list-lvls|list-lios|swap-lvl-lio)"
    ;;
esac
