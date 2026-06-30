#!/bin/bash
# rebuild-zones.sh (Server B variant) - stop, rebuild from latest GitHub
# release, restart Infantry zones on the OVH vps.
# Deploy to: /home/freeinfantry/zones/scripts/rebuild-zones.sh
#
# BASE is derived as the parent of this script's dir, so placing it in
# /home/freeinfantry/zones/scripts/ makes BASE=/home/freeinfantry/zones,
# which is where the zone folders live.
#
#   ./rebuild-zones.sh            # all zones in the map
#   ./rebuild-zones.sh usl        # only the named tags

set -uo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="InfantryOnline/Infantry-Online-Server"

# tag -> zone directory name (relative to $BASE). Keep in sync with zone-daemon.conf.
declare -A ZONES=(
  [usl]="League - USL Matches"
)

if [ "$#" -gt 0 ]; then TAGS=("$@"); else TAGS=("${!ZONES[@]}"); fi
for tag in "${TAGS[@]}"; do
  [ -n "${ZONES[$tag]:-}" ] || { echo "ERROR: unknown tag '$tag'. Known: ${!ZONES[*]}"; exit 1; }
done

echo "==> Infantry root: $BASE"
echo "==> Target zones : ${TAGS[*]}"

echo "==> Stopping zone screens"
for tag in "${TAGS[@]}"; do
  screen -S "$tag" -X quit 2>/dev/null && echo "   stopped $tag" || echo "   $tag not running"
done
sleep 2

echo "==> Downloading latest release (once)"
URL=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" \
      | grep browser_download_url | grep release-linux.zip | cut -d '"' -f 4)
[ -n "$URL" ] || { echo "ERROR: could not resolve release-linux.zip URL"; exit 1; }
echo "   $URL"
EXTRACT=/tmp/infantry-release
wget -q -O /tmp/release-linux.zip "$URL" || { echo "ERROR: download failed"; exit 1; }
rm -rf "$EXTRACT" && mkdir -p "$EXTRACT"
unzip -o -q /tmp/release-linux.zip -d "$EXTRACT" || { echo "ERROR: unzip failed"; exit 1; }
[ -f "$EXTRACT/ZoneServer.dll" ] || { echo "ERROR: ZoneServer.dll missing in release - aborting"; exit 1; }

echo "==> Deploying build into each zone"
for tag in "${TAGS[@]}"; do
  dir="$BASE/${ZONES[$tag]}"
  [ -d "$dir" ] || { echo "   SKIP $tag - missing: $dir"; continue; }
  echo "   -> $tag ($dir)"
  rsync -a "$EXTRACT/" "$dir/"
done

echo "==> Starting zones (detached)"
for tag in "${TAGS[@]}"; do
  dir="$BASE/${ZONES[$tag]}"
  [ -d "$dir" ] || continue
  ( cd "$dir" && screen -dmS "$tag" dotnet ZoneServer.dll ) && echo "   started $tag"
done

rm -f /tmp/release-linux.zip; rm -rf "$EXTRACT"
echo "==> Done. Active screens:"; screen -ls || true
