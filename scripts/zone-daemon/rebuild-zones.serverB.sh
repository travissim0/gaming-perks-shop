#!/bin/bash
# rebuild-zones.sh (Server B variant) - stop, rebuild from latest GitHub
# release, restart Infantry zones on the OVH vps.
# Deploy to: /home/freeinfantry/zones/scripts/rebuild-zones.sh
#
# BASE is derived as the parent of this script's dir, so placing it in
# /home/freeinfantry/zones/scripts/ makes BASE=/home/freeinfantry/zones,
# which is where the zone folders live.
#
#   ./rebuild-zones.sh usl        # only the named tags
#   ./rebuild-zones.sh all        # every zone in the map (restarts them all!)
#
# Each zone installs from REPO (the stock InfantryOnline server) unless
# zone-daemon.conf's ZONE_REPOS maps its tag to a fork (eol -> ModalInc). A
# fork zone gets a no-downgrade guard: if the fork's latest release is older
# than the ZoneServer.dll the zone already runs (someone deployed a newer build
# by hand), that zone is skipped and left running untouched.
#
# Every release is downloaded and checked BEFORE any zone is stopped, so a
# failed download no longer leaves zones down.

set -uo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="InfantryOnline/Infantry-Online-Server"

# tag -> zone directory name (relative to $BASE). Taken straight from
# zone-daemon.conf's ZONE_DIRS so this script can never drift from the tags the
# admin console offers a Rebuild button for (it used to list only [usl], so a
# rebuild of any other zone died with "unknown tag"). The static map is just a
# fallback for a missing/unreadable conf.
CONF="${ZONE_DAEMON_CONF:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/zone-daemon.conf}"
declare -A ZONE_DIRS=()
declare -A ZONE_REPOS=()
declare -A ZONES=()
if [ -r "$CONF" ]; then
  # shellcheck disable=SC1090
  source "$CONF"
  for tag in "${!ZONE_DIRS[@]}"; do ZONES["$tag"]="${ZONE_DIRS[$tag]}"; done
  unset SUPABASE_SERVICE_KEY   # sourced only for the zone map; don't leak it to children
fi
if [ "${#ZONES[@]}" -eq 0 ]; then
  echo "WARN: no zones from $CONF - falling back to the built-in map"
  ZONES=( [usl]="League - USL Matches" )
fi

# Targets must be explicit. The map used to hold a single zone, so a bare run
# meaning "all of them" was harmless; now it holds every registered zone and a
# stray no-arg run would stop+restart the whole server.
if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <tag> [tag...]   |   $0 all"
  echo "Known tags: ${!ZONES[*]}"
  exit 1
fi
if [ "$#" -eq 1 ] && [ "$1" = "all" ]; then TAGS=("${!ZONES[@]}"); else TAGS=("$@"); fi
for tag in "${TAGS[@]}"; do
  [ -n "${ZONES[$tag]:-}" ] || { echo "ERROR: unknown tag '$tag'. Known: ${!ZONES[*]}"; exit 1; }
done

echo "==> Infantry root: $BASE"
echo "==> Target zones : ${TAGS[*]}"

# Group the targets by the repo they install from, so each release downloads once.
declare -A REPO_TAGS=()
for tag in "${TAGS[@]}"; do
  r="${ZONE_REPOS[$tag]:-$REPO}"
  REPO_TAGS["$r"]="${REPO_TAGS[$r]:-}${REPO_TAGS[$r]:+ }$tag"
done

WORK="$(mktemp -d /tmp/infantry-rebuild.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
declare -A TAG_SRC=()   # tag -> extracted release dir to deploy
DEPLOY=()               # tags that passed every check, in order
FAILED=0
n=0
for r in "${!REPO_TAGS[@]}"; do
  n=$((n + 1))
  echo "==> Resolving latest release of $r"
  meta="$(curl -fsS "https://api.github.com/repos/$r/releases/latest")" \
    || { echo "   ERROR: GitHub API request failed for $r"; FAILED=1; continue; }
  URL="$(printf '%s' "$meta" | jq -r '.assets[] | select(.name=="release-linux.zip") | .browser_download_url' | head -1)"
  PUBLISHED="$(printf '%s' "$meta" | jq -r '.published_at // empty')"
  [ -n "$URL" ] && [ "$URL" != "null" ] \
    || { echo "   ERROR: could not resolve release-linux.zip URL for $r"; FAILED=1; continue; }
  echo "   $URL (published $PUBLISHED)"
  ext="$WORK/rel$n"; mkdir -p "$ext"
  wget -q -O "$WORK/rel$n.zip" "$URL" || { echo "   ERROR: download failed for $r"; FAILED=1; continue; }
  unzip -o -q "$WORK/rel$n.zip" -d "$ext" || { echo "   ERROR: unzip failed for $r"; FAILED=1; continue; }
  [ -f "$ext/ZoneServer.dll" ] || { echo "   ERROR: ZoneServer.dll missing in $r release - not deploying it"; FAILED=1; continue; }
  pub_epoch="$(date -d "$PUBLISHED" +%s 2>/dev/null || echo 0)"

  for tag in ${REPO_TAGS[$r]}; do
    dir="$BASE/${ZONES[$tag]}"
    [ -d "$dir" ] || { echo "   SKIP $tag - missing: $dir"; continue; }
    # No-downgrade guard (fork zones only): a ZoneServer.dll newer than the
    # release was deployed by hand, so installing the release would roll it back.
    # (A release's own dll carries its build time, a few minutes BEFORE it was
    # published, so re-running Rebuild on the same release still passes.)
    if [ -n "${ZONE_REPOS[$tag]:-}" ] && [ -f "$dir/ZoneServer.dll" ] && [ "$pub_epoch" -gt 0 ]; then
      cur_epoch="$(stat -c %Y "$dir/ZoneServer.dll")"
      if [ "$cur_epoch" -gt $((pub_epoch + 600)) ]; then
        echo "   ERROR $tag: latest $r release ($PUBLISHED) is OLDER than the build $tag runs now ($(date -u -d "@$cur_epoch" +%FT%TZ)) - not rolling it back. Publish a newer release from the fork, then Rebuild again."
        FAILED=1
        continue
      fi
    fi
    TAG_SRC["$tag"]="$ext"
    DEPLOY+=("$tag")
  done
done

if [ "${#DEPLOY[@]}" -eq 0 ]; then
  echo "==> Nothing deployed - every target was skipped (zones left as they were)"
  exit 1
fi

echo "==> Stopping zone screens"
for tag in "${DEPLOY[@]}"; do
  screen -S "$tag" -X quit 2>/dev/null && echo "   stopped $tag" || echo "   $tag not running"
done
sleep 2

echo "==> Deploying build into each zone"
for tag in "${DEPLOY[@]}"; do
  dir="$BASE/${ZONES[$tag]}"
  echo "   -> $tag ($dir) from ${ZONE_REPOS[$tag]:-$REPO}"
  rsync -a "${TAG_SRC[$tag]}/" "$dir/"
done

echo "==> Starting zones (detached)"
for tag in "${DEPLOY[@]}"; do
  dir="$BASE/${ZONES[$tag]}"
  ( cd "$dir" && screen -dmS "$tag" dotnet ZoneServer.dll ) && echo "   started $tag"
done

echo "==> Done. Active screens:"; screen -ls || true
exit "$FAILED"
