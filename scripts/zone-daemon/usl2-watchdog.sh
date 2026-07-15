#!/bin/bash
# usl2-watchdog.sh - keep "USL - KS10" (zoneid 120) running on Server A.
#
# usl2 is hosted on Server A (droplet) rather than Server B because B's OVH edge
# firewall (not under our control) won't allow opening new ports for it. Unlike a
# rebuild-started zone, usl2 was launched manually, and nothing on A auto-restarts
# zones, so this watchdog provides reboot + crash persistence.
#
# Deploy to: /opt/infantry/scripts/usl2-watchdog.sh  (chmod +x)
# Driven by two travis crontab lines:
#   @reboot sleep 45 && /opt/infantry/scripts/usl2-watchdog.sh >> /tmp/usl2-watchdog.log 2>&1
#   * * * * *          /opt/infantry/scripts/usl2-watchdog.sh >> /tmp/usl2-watchdog.log 2>&1
#
# Relaunches the zone in a screen named exactly "usl2" so the zone-daemon
# (ZONE_DIRS[usl2]) keeps detecting/controlling it via /admin/zones.
# To intentionally keep it DOWN, comment out the "* * * * *" line in `crontab -e`.
export PATH=/usr/bin:/bin:$PATH
DIR="/opt/infantry/League - USL Matches2"
TAG="usl2"
if ! screen -ls 2>/dev/null | grep -qE "[0-9]+\.${TAG}[[:space:]]"; then
  cd "$DIR" && screen -dmS "$TAG" dotnet ZoneServer.dll
  echo "$(date '+%F %T') relaunched $TAG"
fi
